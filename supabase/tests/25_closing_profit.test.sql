-- Profit of the day in the closing: sales, cost and profit of the whole store, the products sold without a cost
-- apart; a cost set later fills the past sales and the old closing shows it on the next read. Owner and admin see it;
-- staff and another store never.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('admin_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Ganancia A', 'ganancia-a', tests.fx('owner_a'), 'CUP', 'GA', '5351111111', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Ganancia B', 'ganancia-b', tests.fx('owner_b'), 'CUP', 'GB', '5352222222', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values
  (tests.fx('store_a'), tests.fx('admin_a'), 'admin'),
  (tests.fx('store_a'), tests.fx('staff_a'), 'staff');

create function pg_temp.seed(p_prefix text, p_unit text, p_price numeric, p_cost numeric) returns void
language plpgsql as $$
declare
  v_type uuid; v_product uuid;
begin
  select id into v_type from public.product_types where store_id = tests.fx('store_a') and slug = 'simple';
  if v_type is null then
    insert into public.product_types (store_id, name, slug) values (tests.fx('store_a'), 'Simple', 'simple')
      returning id into v_type;
  end if;
  v_product := public.save_product(tests.fx('store_a'), jsonb_build_object(
    'product_type_id', v_type, 'name', 'Prod ' || p_prefix, 'slug', 'prod-' || p_prefix, 'status', 'published',
    'sale_unit', p_unit,
    'variants', jsonb_build_array(jsonb_build_object('sku', upper(p_prefix), 'price', p_price, 'stock', 100)
      || case when p_cost is not null then jsonb_build_object('cost', jsonb_build_object('price', p_cost, 'currency', 'CUP'))
         else '{}'::jsonb end)),
    tests.fx('owner_a'));
  insert into pg_temp.fixtures select p_prefix || '_variant', id from public.product_variants where product_id = v_product;
end;
$$;
-- Jamón 1700/lb costs 1200; jabón 400 costs 300; galletas 230 has no cost yet.
select pg_temp.seed('jamon', 'lb', 1700, 1200);
select pg_temp.seed('jabon', 'unit', 400, 300);
select pg_temp.seed('galleta', 'unit', 230, null);

-- One sale: 1.5 lb of jamón (2550), 2 jabones (800), 4 galletas (920) = 4270.
select public.pos_record_sale(tests.fx('store_a'), jsonb_build_object(
  'id', gen_random_uuid(), 'device_id', '00000000-0000-4000-8000-000000000005', 'local_number', 'G-1',
  'sold_at', now(),
  'lines', jsonb_build_array(
    jsonb_build_object('variant_id', tests.fx('jamon_variant'), 'quantity', 1.5, 'unit_price', 1700, 'product_name', 'Jamón'),
    jsonb_build_object('variant_id', tests.fx('jabon_variant'), 'quantity', 2, 'unit_price', 400, 'product_name', 'Jabón'),
    jsonb_build_object('variant_id', tests.fx('galleta_variant'), 'quantity', 4, 'unit_price', 230, 'product_name', 'Galleta')),
  'payments', jsonb_build_array(jsonb_build_object('amount', 4270))), tests.fx('staff_a'));

insert into pg_temp.fixtures (key, id)
select 'closing', (public.pos_close_day(tests.fx('store_a'), tests.fx('staff_a'), '{"counted": {"CUP": 4270}}') ->> 'id')::uuid;

create function pg_temp.profit() returns jsonb language sql as $$
  select c -> 'profit' from jsonb_array_elements(public.admin_pos_closings(tests.fx('store_a')) -> 'closings') c
  where c ->> 'id' = tests.fx('closing')::text;
$$;

-- ---------------------------------------------------------------------------
-- Owner and admin see it; the galletas are apart
-- ---------------------------------------------------------------------------

select tests.login('owner_a');
select tests.eq('owner: sales 4270, with cost 3350, cost 2400, profit 950, 1 product without cost (920)',
  (select format('%s %s %s %s %s %s', p ->> 'revenue', p ->> 'revenueWithCost', p ->> 'cost', p ->> 'profit',
     p -> 'withoutCost' ->> 'products', p -> 'withoutCost' ->> 'amount') from pg_temp.profit() p),
  '4270.00 3350.00 2400.00 950.00 1 920.00');
select tests.eq('owner: by product, the jamón in lb with its profit, the galletas without',
  (select jsonb_agg(jsonb_build_array(x ->> 'name', x ->> 'unit', (x ->> 'quantity')::numeric, x ->> 'profit',
     (x ->> 'missingCost')::boolean) order by x ->> 'name')
   from jsonb_array_elements((select p -> 'byProduct' from pg_temp.profit() p)) x),
  '[["Prod galleta", "unit", 4, null, true], ["Prod jabon", "unit", 2, "200.00", false], ["Prod jamon", "lb", 1.5, "750.00", false]]'::jsonb);
select tests.logout();

select tests.login('admin_a');
select tests.eq('admin: the same profit', (select p ->> 'profit' from pg_temp.profit() p), '950.00');
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff: no profit (costs are for owner and admin)',
  (select coalesce(p::text, 'none') from pg_temp.profit() p), 'null');
select tests.check('staff: cannot read it calling the function either',
  private.closing_profit(tests.fx('store_a'), array(select order_id from public.pos_sales where store_id = tests.fx('store_a'))) is null);
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B: no closing of A, no profit of A',
  (select format('%s %s', jsonb_array_length(public.admin_pos_closings(tests.fx('store_a')) -> 'closings'),
     coalesce(private.closing_profit(tests.fx('store_a'),
       array(select order_id from public.pos_sales where store_id = tests.fx('store_a')))::text, 'null'))),
  '0 null');
select tests.logout();

-- ---------------------------------------------------------------------------
-- The cost of the galletas arrives later: the old closing counts them on the next read
-- ---------------------------------------------------------------------------

insert into public.variant_costs (store_id, variant_id, cost_price, cost_currency)
values (tests.fx('store_a'), tests.fx('galleta_variant'), 180, 'CUP');

select tests.eq('the past sale got the cost (180)',
  (select c.unit_cost from public.order_line_costs c join public.order_lines l on l.id = c.order_line_id
   where l.variant_id = tests.fx('galleta_variant')), 180::numeric);
select tests.login('owner_a');
select tests.eq('owner: the old closing now counts them: profit 1150, none without cost',
  (select format('%s %s', p ->> 'profit', p -> 'withoutCost' ->> 'products') from pg_temp.profit() p), '1150.00 0');
select tests.logout();

update public.variant_costs set cost_price = 999 where variant_id = tests.fx('jabon_variant');
select tests.eq('a later cost never overwrites the one the sale kept (jabón stays 300)',
  (select c.unit_cost from public.order_line_costs c join public.order_lines l on l.id = c.order_line_id
   where l.variant_id = tests.fx('jabon_variant')), 300::numeric);

-- ---------------------------------------------------------------------------
-- WhatsApp line
-- ---------------------------------------------------------------------------

select tests.check('closing_profit_text: «Ganancia» with the percent and the warning',
  private.closing_profit_text('{"currency": "CUP", "revenue": 4270, "revenueWithCost": 3350, "profit": 950,
    "withoutCost": {"products": 1, "amount": 920}}'::jsonb) ~ '^Ganancia: .*950.*\(28,4 %\)\n⚠️ 1 producto vendido sin costo');
