-- KSH0015: selling by weight or measure. A product «por libra» takes 2 decimals in the checkout, the counter, the
-- stock and transfers, each line keeps its unit and the amount is round(price × quantity, 2); a product «por unidad»
-- still refuses decimals; stores stay isolated.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Peso Test A', 'peso-test-a', tests.fx('owner_a'), 'CUP', 'PA', '5351111111', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Peso Test B', 'peso-test-b', tests.fx('owner_b'), 'CUP', 'PB', '5352222222', 'base', 0, 'kshop.fullkod.com', null)).id;

create function pg_temp.error_of(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$$;

create function pg_temp.seed(p_store text, p_owner text, p_prefix text, p_unit text, p_price numeric, p_stock numeric)
returns void
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
    'product_type_id', v_type, 'name', 'Prod ' || p_prefix, 'slug', 'prod-' || p_prefix, 'status', 'published',
    'sale_unit', p_unit,
    'variants', jsonb_build_array(jsonb_build_object('sku', upper(p_prefix), 'price', p_price, 'stock', p_stock))),
    tests.fx(p_owner));
  insert into pg_temp.fixtures select p_prefix || '_product', v_product;
  insert into pg_temp.fixtures select p_prefix || '_variant', id from public.product_variants where product_id = v_product;
end;
$$;
select pg_temp.seed('store_a', 'owner_a', 'jamon', 'lb', 1700, 35.5);
select pg_temp.seed('store_a', 'owner_a', 'jabon', 'unit', 400, 10);
select pg_temp.seed('store_b', 'owner_b', 'queso', 'lb', 650, 20);

-- ---------------------------------------------------------------------------
-- Product and stock
-- ---------------------------------------------------------------------------

select tests.eq('save_product: the unit and a decimal stock',
  (select format('%s %s', p.sale_unit, v.stock_available) from public.products p
   join public.product_variants v on v.product_id = p.id where p.id = tests.fx('jamon_product')),
  'lb 35.50');
select tests.check('set_stock_quantity: a whole product refuses 1.5',
  tests.throws(format(
    'select public.set_stock_quantity(%L, %L, (select warehouse_id from public.stocks where variant_id = %L limit 1), 1.5, %L, null, null)',
    tests.fx('store_a'), tests.fx('jabon_variant'), tests.fx('jabon_variant'), 'adjustment')));
select tests.check('set_stock_quantity: 3 decimals are refused',
  tests.throws(format(
    'select public.set_stock_quantity(%L, %L, (select warehouse_id from public.stocks where variant_id = %L limit 1), 1.375, %L, null, null)',
    tests.fx('store_a'), tests.fx('jamon_variant'), tests.fx('jamon_variant'), 'adjustment')));
select tests.check('save_product: omitting the unit leaves it as it is',
  (select public.save_product(tests.fx('store_a'), jsonb_build_object(
     'id', tests.fx('jamon_product'), 'product_type_id', p.product_type_id, 'name', p.name, 'slug', p.slug,
     'status', 'published', 'variants', jsonb_build_array(jsonb_build_object('id', v.id, 'sku', v.sku, 'price', 1700))),
     tests.fx('owner_a')) = tests.fx('jamon_product')
   from public.products p join public.product_variants v on v.product_id = p.id where p.id = tests.fx('jamon_product'))
  and (select sale_unit from public.products where id = tests.fx('jamon_product')) = 'lb');

-- ---------------------------------------------------------------------------
-- Checkout (web): 1.5 lb reserved, its unit and the rounded amount on the line
-- ---------------------------------------------------------------------------

insert into pg_temp.fixtures (key, id)
select 'order_web', (public.checkout_create_order(tests.fx('store_a'), jsonb_build_object(
  'idempotency_key', 'ksh0015-web', 'currency', 'CUP',
  'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx('jamon_variant'), 'quantity', 1.37)),
  'customer', jsonb_build_object('name', 'Cliente', 'phone', '+5353123456'),
  'shipping', '{}'::jsonb)) ->> 'order_id')::uuid;

select tests.eq('checkout: 1.37 lb × 1700 = 2329, unit lb',
  (select jsonb_build_array(quantity, unit, line_total) from public.order_lines where order_id = tests.fx('order_web')),
  '[1.37, "lb", 2329.00]'::jsonb);
select tests.eq('checkout: 1.37 lb reserved, 34.13 lb still available',
  (select format('%s %s', s.quantity_allocated, v.stock_available) from public.stocks s
   join public.product_variants v on v.id = s.variant_id where s.variant_id = tests.fx('jamon_variant')),
  '1.37 34.13');
select tests.check('checkout: a whole product refuses 1.5',
  tests.throws(format($q$select public.checkout_create_order(%L, %L::jsonb)$q$, tests.fx('store_a'), jsonb_build_object(
    'idempotency_key', 'ksh0015-bad', 'currency', 'CUP',
    'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx('jabon_variant'), 'quantity', 1.5)),
    'customer', jsonb_build_object('name', 'Cliente', 'phone', '+5353123456'), 'shipping', '{}'::jsonb))));
select tests.eq('checkout: no stock message with the unit',
  pg_temp.error_of(format($q$select public.checkout_create_order(%L, %L::jsonb)$q$, tests.fx('store_a'), jsonb_build_object(
    'idempotency_key', 'ksh0015-much', 'currency', 'CUP',
    'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx('jamon_variant'), 'quantity', 100)),
    'customer', jsonb_build_object('name', 'Cliente', 'phone', '+5353123456'), 'shipping', '{}'::jsonb))),
  'Solo quedan 34,13 lb de Prod jamon');
select tests.check('checkout: the variant of another store is not available',
  tests.throws(format($q$select public.checkout_create_order(%L, %L::jsonb)$q$, tests.fx('store_a'), jsonb_build_object(
    'idempotency_key', 'ksh0015-other', 'currency', 'CUP',
    'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx('queso_variant'), 'quantity', 1.5)),
    'customer', jsonb_build_object('name', 'Cliente', 'phone', '+5353123456'), 'shipping', '{}'::jsonb))));

select public.order_cancel(tests.fx('store_a'), tests.fx('order_web'), 'prueba', tests.fx('owner_a'));
select tests.eq('order cancelled: the 1.37 lb are free again',
  (select format('%s %s', s.quantity_allocated, v.stock_available) from public.stocks s
   join public.product_variants v on v.id = s.variant_id where s.variant_id = tests.fx('jamon_variant')),
  '0.00 35.50');

-- ---------------------------------------------------------------------------
-- Counter: decimals as sold, the unit of the phone or the product
-- ---------------------------------------------------------------------------

insert into pg_temp.fixtures (key, id)
select 'order_pos', (public.pos_record_sale(tests.fx('store_a'), jsonb_build_object(
  'id', '33333333-3333-4333-8333-333333333333', 'device_id', '00000000-0000-4000-8000-000000000003',
  'local_number', 'C-1', 'sold_at', now(),
  'lines', jsonb_build_array(
    jsonb_build_object('variant_id', tests.fx('jamon_variant'), 'quantity', 0.75, 'unit_price', 1700, 'product_name', 'Jamón'),
    jsonb_build_object('variant_id', tests.fx('jabon_variant'), 'quantity', 2, 'unit_price', 400, 'product_name', 'Jabón')),
  'payments', jsonb_build_array(jsonb_build_object('amount', 2075))), tests.fx('owner_a')) ->> 'order_id')::uuid;

select tests.eq('pos: 0.75 lb and 2 u, each with its unit; total 2075',
  (select jsonb_build_object('lines', jsonb_agg(jsonb_build_array(l.quantity, l.unit, l.line_total) order by l.sort_order),
     'total', (select total from public.orders where id = tests.fx('order_pos')))
   from public.order_lines l where l.order_id = tests.fx('order_pos')),
  '{"lines": [[0.75, "lb", 1275.00], [2.00, "unit", 800.00]], "total": 2075.00}'::jsonb);
select tests.eq('pos: the stock goes down 0.75 lb',
  (select stock_available from public.product_variants where id = tests.fx('jamon_variant')), 34.75::numeric);
select tests.eq('pos_catalog: brings the unit',
  (select i ->> 'saleUnit' from jsonb_array_elements(public.pos_catalog(tests.fx('store_a'), null, 500) -> 'items') i
   where i ->> 'variantId' = tests.fx('jamon_variant')::text), 'lb');

-- ---------------------------------------------------------------------------
-- Reads, messages and counting
-- ---------------------------------------------------------------------------

select tests.eq('quantity_text: «1,5 lb», «3», «3 u», «0,75 L», «2 m²»',
  format('%s|%s|%s|%s|%s', private.quantity_text(1.5, 'lb'), private.quantity_text(3, 'unit'),
    private.quantity_text(3, 'unit', true), private.quantity_text(0.75, 'l'), private.quantity_text(2, 'm2')),
  '1,5 lb|3|3 u|0,75 L|2 m²');
select tests.check('order_template_vars: the WhatsApp lines say «0,75 lb ×»',
  (select private.order_template_vars(tests.fx('order_pos')) ->> 'lineas') ~ '0,75 lb ×');
select tests.eq('counted_quantity: a measured line counts as one product',
  private.counted_quantity(42.5, 'lb') + private.counted_quantity(3, 'unit'), 4::numeric);

select tests.login('owner_a');
select tests.eq('owner A: the product and its stock as text, with the unit',
  (select format('%s %s',
     public.admin_product(tests.fx('jamon_product')) -> 'productsCollection' -> 'edges' -> 0 -> 'node'
       -> 'productVariantsCollection' -> 'edges' -> 0 -> 'node' ->> 'stockAvailable',
     public.admin_products(tests.fx('store_a'), 10, p_query => 'Prod jamon') -> 'adminSearchProducts' -> 'edges' -> 0
       -> 'node' ->> 'saleUnit')),
  '34.75 lb');
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B on store A: no stock per warehouse, no movements, no order lines',
  (select format('%s %s %s',
     (select count(*) from public.stocks where store_id = tests.fx('store_a')),
     (select count(*) from public.stock_movements where store_id = tests.fx('store_a')),
     (select count(*) from public.order_lines where store_id = tests.fx('store_a')))),
  '0 0 0');
select tests.logout();
