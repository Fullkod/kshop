-- KSH0011: changing the price of a line. Costs reach owner and admin only (counter catalog and admin_variant_costs),
-- never staff nor another store; a changed price and a sale below cost are noted without the amount of the cost.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Precio Test A', 'precio-test-a', tests.fx('owner_a'), 'CUP', 'QA', '5351111111', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Precio Test B', 'precio-test-b', tests.fx('owner_b'), 'CUP', 'QB', '5352222222', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');

create function pg_temp.seed(p_store text, p_owner text, p_prefix text) returns void
language plpgsql as $$
declare
  v_type uuid; v_product uuid;
begin
  insert into public.product_types (store_id, name, slug) values (tests.fx(p_store), 'Simple', 'simple')
    returning id into v_type;
  v_product := public.save_product(tests.fx(p_store), jsonb_build_object(
    'product_type_id', v_type, 'name', 'Arroz ' || p_prefix, 'slug', 'arroz-' || p_prefix, 'status', 'published',
    'variants', jsonb_build_array(jsonb_build_object('sku', upper(p_prefix) || '-ARROZ', 'price', 1000, 'stock', 50,
      'cost', jsonb_build_object('price', 700, 'currency', 'CUP')))),
    tests.fx(p_owner));
  insert into pg_temp.fixtures select p_prefix || '_variant', id from public.product_variants where product_id = v_product;
end;
$$;
select pg_temp.seed('store_a', 'owner_a', 'a');
select pg_temp.seed('store_b', 'owner_b', 'b');

-- ---------------------------------------------------------------------------
-- Counter: the catalog brings costs only when asked; the sale notes the change
-- ---------------------------------------------------------------------------

select tests.check('pos_catalog: no cost by default',
  public.pos_catalog(tests.fx('store_a'), null, 500)::text !~* 'cost');
select tests.eq('pos_catalog: the cost in the base currency when asked (owner and admin)',
  (public.pos_catalog(tests.fx('store_a'), null, 500, true) -> 'items' -> 0 ->> 'cost')::numeric, 700::numeric);

insert into pg_temp.fixtures (key, id)
select 'order_pos', (public.pos_record_sale(tests.fx('store_a'), jsonb_build_object(
  'id', '22222222-2222-4222-8222-222222222222', 'device_id', '00000000-0000-4000-8000-000000000002',
  'local_number', 'C-1', 'sold_at', now(),
  'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx('a_variant'), 'quantity', 1, 'unit_price', 600,
    'product_name', 'Arroz', 'price_changed', true, 'price_note', 'cliente fijo')),
  'payments', jsonb_build_array(jsonb_build_object('amount', 600))), tests.fx('staff_a')) ->> 'order_id')::uuid;

select tests.eq('pos: a price changed on purpose is noted with its reason, not as a stale price',
  (select jsonb_agg(f ->> 'type' order by f ->> 'type') from public.pos_sales s, jsonb_array_elements(s.flags) f
   where s.order_id = tests.fx('order_pos')), '["below_cost", "price_changed"]'::jsonb);
select tests.eq('pos: the reason travels',
  (select f ->> 'note' from public.pos_sales s, jsonb_array_elements(s.flags) f
   where s.order_id = tests.fx('order_pos') and f ->> 'type' = 'price_changed'), 'cliente fijo');
select tests.check('pos: the notes never carry the cost',
  (select flags::text from public.pos_sales where order_id = tests.fx('order_pos')) !~ '700');
select tests.eq('pos: the line keeps the store price and what was charged',
  (select jsonb_build_array(unit_list_price, unit_price) from public.order_lines where order_id = tests.fx('order_pos')),
  '[1000.00, 600.00]'::jsonb);

-- ---------------------------------------------------------------------------
-- «Nuevo pedido» (channel admin): a line with its own price
-- ---------------------------------------------------------------------------

insert into pg_temp.fixtures (key, id)
select 'order_admin', (public.checkout_create_order(tests.fx('store_a'), jsonb_build_object(
  'idempotency_key', 'ksh0011-admin', 'channel', 'admin', 'currency', 'CUP', 'created_by', tests.fx('staff_a'),
  'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx('a_variant'), 'quantity', 2, 'unit_price', 650,
    'price_note', 'liquidación')),
  'customer', jsonb_build_object('name', 'Cliente', 'phone', '+5353123456'),
  'shipping', '{}'::jsonb)) ->> 'order_id')::uuid;

select tests.eq('admin order: the line costs what the staff set',
  (select jsonb_build_array(unit_list_price, unit_price, line_total) from public.order_lines
   where order_id = tests.fx('order_admin')), '[1000.00, 650.00, 1300.00]'::jsonb);
select tests.eq('admin order: the change and the sale below cost are internal events',
  (select jsonb_agg(type order by type) from public.order_events
   where order_id = tests.fx('order_admin') and type in ('price_changed', 'below_cost') and is_internal),
  '["below_cost", "price_changed"]'::jsonb);
select tests.check('admin order: the events never carry the cost',
  (select string_agg(payload::text, ' ') from public.order_events where order_id = tests.fx('order_admin')) !~ '700');

insert into pg_temp.fixtures (key, id)
select 'order_web', (public.checkout_create_order(tests.fx('store_a'), jsonb_build_object(
  'idempotency_key', 'ksh0011-web', 'channel', 'web', 'currency', 'CUP',
  'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx('a_variant'), 'quantity', 1, 'unit_price', 1)),
  'customer', jsonb_build_object('name', 'Cliente', 'phone', '+5353123457'),
  'shipping', '{}'::jsonb)) ->> 'order_id')::uuid;
select tests.eq('web order: a price sent by the customer is ignored',
  (select unit_price from public.order_lines where order_id = tests.fx('order_web')), 1000.00);

-- ---------------------------------------------------------------------------
-- Who sees costs and the cashier
-- ---------------------------------------------------------------------------

select tests.login('owner_a');
select tests.eq('owner A: admin_variant_costs gives the cost in the base currency',
  public.admin_variant_costs(tests.fx('store_a'), array[tests.fx('a_variant')]) ->> tests.fx('a_variant')::text, '700.00');
select tests.check('owner A: the sale says who sold it',
  public.admin_pos_sale(tests.fx('order_pos')) ->> 'cashier' is not null);

select tests.login('staff_a');
select tests.eq('staff A: admin_variant_costs is empty',
  public.admin_variant_costs(tests.fx('store_a'), array[tests.fx('a_variant')]), '{}'::jsonb);

select tests.login('owner_b');
select tests.eq('owner B: no costs of A',
  public.admin_variant_costs(tests.fx('store_a'), array[tests.fx('a_variant')]), '{}'::jsonb);
select tests.eq('owner B: no costs of A through its own store id',
  public.admin_variant_costs(tests.fx('store_b'), array[tests.fx('a_variant')]), '{}'::jsonb);
select tests.check('owner B: the sale of A does not exist (nor its cashier)',
  public.admin_pos_sale(tests.fx('order_pos')) is null);
select tests.check('owner B: cannot read the cashier of A directly',
  private.pos_cashier_email(tests.fx('order_pos')) is null);

select tests.login_anon();
select tests.check('anon: cannot read costs',
  tests.throws(format('select public.admin_variant_costs(%L, array[%L]::uuid[])', tests.fx('store_a'), tests.fx('a_variant'))));
select tests.check('anon: cannot call the counter catalog',
  tests.throws(format('select public.pos_catalog(%L, null, 500, true)', tests.fx('store_a'))));

select tests.logout();
