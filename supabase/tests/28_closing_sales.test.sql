-- The sales of a closing and of a product (Minimercado, 2026-11-14): admin_pos_closing_sales brings a closing's sales
-- with their lines, admin_pos_closings pages back with p_before, admin_pos_product_sales finds the counter sales of one
-- product (closed or not). The staff of the store read them; another store reads nothing; no costs in them.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Ventas Cierre A', 'ventas-cierre-a', tests.fx('owner_a'), 'CUP', 'VA', '5351111111', 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Ventas Cierre B', 'ventas-cierre-b', tests.fx('owner_b'), 'CUP', 'VB', '5352222222', 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');

create function pg_temp.seed(p_store text, p_owner text, p_prefix text, p_name text) returns void
language plpgsql as $$
declare
  v_type uuid; v_product uuid;
begin
  select id into v_type from public.product_types where store_id = tests.fx(p_store) and slug = 'simple';
  if v_type is null then
    insert into public.product_types (store_id, name, slug) values (tests.fx(p_store), 'Simple', 'simple')
      returning id into v_type;
  end if;
  v_product := public.save_product(tests.fx(p_store), jsonb_build_object(
    'product_type_id', v_type, 'name', p_name, 'slug', p_prefix, 'status', 'published',
    'variants', jsonb_build_array(jsonb_build_object('sku', upper(p_prefix), 'price', 100, 'stock', 500,
      'cost', jsonb_build_object('price', 60, 'currency', 'CUP')))),
    tests.fx(p_owner));
  insert into pg_temp.fixtures values (p_prefix || '_product', v_product);
  insert into pg_temp.fixtures select p_prefix || '_variant', id from public.product_variants where product_id = v_product;
end;
$$;
select pg_temp.seed('store_a', 'owner_a', 'arroz', 'Arroz');
select pg_temp.seed('store_a', 'owner_a', 'aceite', 'Aceite');
select pg_temp.seed('store_b', 'owner_b', 'queso', 'Queso');

-- A counter sale in store A with p_lines = [[prefix, quantity], …] (100 CUP each), paid in cash, p_minutes_ago.
create function pg_temp.sell(p_lines jsonb, p_minutes_ago int, p_voided boolean default false) returns uuid
language sql as $$
  select (public.pos_record_sale(tests.fx('store_a'), jsonb_build_object(
    'id', gen_random_uuid(), 'device_id', '00000000-0000-4000-8000-000000000028', 'local_number', 'V-1',
    'sold_at', now() - make_interval(mins => p_minutes_ago), 'voided', p_voided,
    'lines', (select jsonb_agg(jsonb_build_object('variant_id', tests.fx((x ->> 0) || '_variant'),
        'quantity', (x ->> 1)::numeric, 'unit_price', 100, 'product_name', initcap(x ->> 0)))
      from jsonb_array_elements(p_lines) x),
    'payments', jsonb_build_array(jsonb_build_object('amount',
      (select sum((x ->> 1)::numeric) * 100 from jsonb_array_elements(p_lines) x)))), tests.fx('staff_a')) ->> 'order_id')::uuid;
$$;

-- An old closing (40 days ago) with one sale of aceite.
insert into pg_temp.fixtures values ('sale_old', pg_temp.sell('[["aceite", 1]]', 10));
insert into pg_temp.fixtures (key, id)
select 'closing_old', (public.pos_close_day(tests.fx('store_a'), tests.fx('staff_a'),
  '{"counted": {"CUP": 100}}') ->> 'id')::uuid;
update public.pos_closings set day = day - 40, closed_at = closed_at - interval '40 days'
where id = tests.fx('closing_old');
update public.pos_sales set sold_at = sold_at - interval '40 days' where order_id = tests.fx('sale_old');

-- Today: three sales closed (one voided) and one left open.
insert into pg_temp.fixtures values ('sale_1', pg_temp.sell('[["arroz", 2]]', 4));
insert into pg_temp.fixtures values ('sale_2', pg_temp.sell('[["arroz", 1], ["aceite", 2]]', 3));
insert into pg_temp.fixtures values ('sale_3', pg_temp.sell('[["aceite", 1]]', 2, true));
insert into pg_temp.fixtures (key, id)
select 'closing_1', (public.pos_close_day(tests.fx('store_a'), tests.fx('staff_a'),
  '{"counted": {"CUP": 400}}') ->> 'id')::uuid;
insert into pg_temp.fixtures values ('sale_4', pg_temp.sell('[["aceite", 3]]', 1));

-- Numbers of the sales a read brings, in its order.
create function pg_temp.numbers(p_sales jsonb) returns text
language sql as $$
  select coalesce(string_agg(o.number::text, ',' order by x.ord), '')
  from jsonb_array_elements(p_sales) with ordinality x (s, ord)
  join public.orders o on o.id = (x.s ->> 'orderId')::uuid;
$$;
create function pg_temp.num(p_key text) returns text
language sql as $$ select number::text from public.orders where id = tests.fx(p_key); $$;

-- ---------------------------------------------------------------------------
-- Owner A
-- ---------------------------------------------------------------------------

select tests.login('owner_a');

select tests.eq('closing sales: the three sales of the closing, newest first',
  pg_temp.numbers(public.admin_pos_closing_sales(tests.fx('store_a'), tests.fx('closing_1')) -> 'sales'),
  concat_ws(',', pg_temp.num('sale_3'), pg_temp.num('sale_2'), pg_temp.num('sale_1')));
select tests.eq('closing sales: each sale with its lines (product, quantity, unit and line total)',
  (select string_agg(format('%s %s=%s', l ->> 'name', l ->> 'quantity', l ->> 'lineTotal'), ', '
     order by l ->> 'name')
   from jsonb_array_elements(public.admin_pos_closing_sales(tests.fx('store_a'), tests.fx('closing_1')) -> 'sales') s,
     jsonb_array_elements(s -> 'lines') l
   where (s ->> 'orderId')::uuid = tests.fx('sale_2')),
  'Aceite 2.00=200.00, Arroz 1.00=100.00');
select tests.eq('closing sales: the lines carry the product id (to filter and to search)',
  (select count(*) from jsonb_array_elements(public.admin_pos_closing_sales(tests.fx('store_a'), tests.fx('closing_1')) -> 'sales') s,
     jsonb_array_elements(s -> 'lines') l
   where (l ->> 'productId')::uuid = tests.fx('aceite_product'))::int, 2);
select tests.eq('closing sales: the voided one is marked',
  (select string_agg(s ->> 'cancelled', ',' order by s ->> 'soldAt' desc)
   from jsonb_array_elements(public.admin_pos_closing_sales(tests.fx('store_a'), tests.fx('closing_1')) -> 'sales') s),
  'true,false,false');
select tests.check('closing sales: no costs in the cards',
  public.admin_pos_closing_sales(tests.fx('store_a'), tests.fx('closing_1'))::text not ilike '%cost%');

select tests.eq('closings: the last 30 days bring today''s closing and say there are older ones',
  (select jsonb_build_array(jsonb_array_length(r -> 'closings'), r -> 'hasOlder', r -> 'closings' -> 0 ->> 'id')
   from public.admin_pos_closings(tests.fx('store_a')) r),
  jsonb_build_array(1, true, tests.fx('closing_1')));
select tests.eq('closings: the next page (p_before) brings the old one and nothing older',
  (select jsonb_build_array(jsonb_array_length(r -> 'closings'), r -> 'hasOlder', r -> 'closings' -> 0 ->> 'id')
   from public.admin_pos_closings(tests.fx('store_a'), 30,
     (public.admin_pos_closings(tests.fx('store_a')) ->> 'before')::date) r),
  jsonb_build_array(1, false, tests.fx('closing_old')));

select tests.eq('product sales: the sales with aceite of the last 30 days, open one included',
  pg_temp.numbers(public.admin_pos_product_sales(tests.fx('store_a'), tests.fx('aceite_product')) -> 'sales'),
  concat_ws(',', pg_temp.num('sale_4'), pg_temp.num('sale_3'), pg_temp.num('sale_2')));
select tests.eq('product sales: each one says its closing (null = not closed)',
  (select string_agg(coalesce(s ->> 'closingId', '-'), ',' order by s ->> 'soldAt' desc)
   from jsonb_array_elements(public.admin_pos_product_sales(tests.fx('store_a'), tests.fx('aceite_product')) -> 'sales') s),
  concat_ws(',', '-', tests.fx('closing_1'), tests.fx('closing_1')));
select tests.eq('product sales: the product and that there are older sales',
  (select jsonb_build_array(r -> 'product' ->> 'name', r -> 'hasOlder')
   from public.admin_pos_product_sales(tests.fx('store_a'), tests.fx('aceite_product')) r),
  '["Aceite", true]'::jsonb);
select tests.eq('product sales: the next page brings the old sale, with its closing',
  (select jsonb_build_array(pg_temp.numbers(r -> 'sales'), r -> 'sales' -> 0 ->> 'closingId', r -> 'hasOlder')
   from public.admin_pos_product_sales(tests.fx('store_a'), tests.fx('aceite_product'), 30,
     (public.admin_pos_product_sales(tests.fx('store_a'), tests.fx('aceite_product')) ->> 'before')::date) r),
  jsonb_build_array(pg_temp.num('sale_old'), tests.fx('closing_old'), false));

select tests.logout();

-- ---------------------------------------------------------------------------
-- Staff A reads the same (without costs)
-- ---------------------------------------------------------------------------

select tests.login('staff_a');
select tests.eq('staff A: the closing sales',
  jsonb_array_length(public.admin_pos_closing_sales(tests.fx('store_a'), tests.fx('closing_1')) -> 'sales'), 3);
select tests.eq('staff A: the product sales',
  jsonb_array_length(public.admin_pos_product_sales(tests.fx('store_a'), tests.fx('aceite_product')) -> 'sales'), 3);
select tests.eq('staff A: the closings page back too',
  jsonb_array_length(public.admin_pos_closings(tests.fx('store_a'), 30,
    (public.admin_pos_closings(tests.fx('store_a')) ->> 'before')::date) -> 'closings'), 1);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Owner B reads nothing of store A
-- ---------------------------------------------------------------------------

select tests.login('owner_b');
select tests.check('owner B: a closing of A is not found (with A''s id)',
  public.admin_pos_closing_sales(tests.fx('store_a'), tests.fx('closing_1')) is null);
select tests.check('owner B: a closing of A is not found (with B''s id)',
  public.admin_pos_closing_sales(tests.fx('store_b'), tests.fx('closing_1')) is null);
select tests.eq('owner B: no product sales of A (with A''s id)',
  public.admin_pos_product_sales(tests.fx('store_a'), tests.fx('aceite_product')) -> 'sales', '[]'::jsonb);
select tests.eq('owner B: no product sales of A (with B''s id)',
  public.admin_pos_product_sales(tests.fx('store_b'), tests.fx('aceite_product')) -> 'sales', '[]'::jsonb);
select tests.eq('owner B: no closings of A, old or new',
  jsonb_build_array(
    jsonb_array_length(public.admin_pos_closings(tests.fx('store_a')) -> 'closings'),
    public.admin_pos_closings(tests.fx('store_a')) -> 'hasOlder'),
  '[0, false]'::jsonb);
select tests.check('owner B: cannot read the card of a sale of A',
  private.pos_sale_card(tests.fx('store_a'), tests.fx('sale_1')) is null);
select tests.logout();

select tests.login_anon();
select tests.check('anon: cannot call the reads',
  tests.throws(format('select public.admin_pos_closing_sales(%L, %L)', tests.fx('store_a'), tests.fx('closing_1')))
  and tests.throws(format('select public.admin_pos_product_sales(%L, %L)', tests.fx('store_a'), tests.fx('aceite_product'))));
select tests.logout();
