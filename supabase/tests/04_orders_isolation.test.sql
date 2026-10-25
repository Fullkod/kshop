-- Phase 3: customers, checkout options and orders isolated between stores A and B; the customer only
-- reads its own rows and only with a customer token of the same store; costs and internal notes stay
-- with the staff.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Ord Test A', 'ord-test-a', tests.fx('owner_a'), 'CUP', 'OA', '5351111111', 'base', 30, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Ord Test B', 'ord-test-b', tests.fx('owner_b'), 'USD', 'OB', '5352222222', 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');

insert into pg_temp.fixtures (key, id)
select 'wh_a', id from public.warehouses where store_id = tests.fx('store_a') and is_default;
insert into pg_temp.fixtures (key, id)
select 'wh_b', id from public.warehouses where store_id = tests.fx('store_b') and is_default;

-- Customers: one per store with a proper token, plus a token whose store_id claim points elsewhere.
select tests.create_user('cust_a', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_a')));
select tests.create_user('cust_b', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_b')));
select tests.create_user('cust_a_cross', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_b')));

create function pg_temp.add_customer(p_key text, p_store text, p_user text, p_phone text) returns void
language sql as $$
  with x as (
    insert into public.customers (store_id, user_id, phone, first_name)
    values (tests.fx(p_store), tests.fx(p_user), p_phone, p_key) returning id
  ) insert into pg_temp.fixtures select p_key, id from x;
$$;

select pg_temp.add_customer('c_a', 'store_a', 'cust_a', '+5353000001');
select pg_temp.add_customer('c_b', 'store_b', 'cust_b', '+5353000001');
-- The cross token user has a customer row in A but its JWT says store B.
select pg_temp.add_customer('c_a_cross', 'store_a', 'cust_a_cross', '+5353000002');

insert into public.customer_addresses (store_id, customer_id, recipient, address)
values (tests.fx('store_a'), tests.fx('c_a'), 'Ana', 'Calle 1'), (tests.fx('store_b'), tests.fx('c_b'), 'Beto', 'Calle 2');

-- Checkout options: active and inactive in both stores, and a pickup point in A.
create function pg_temp.seed_options(p_prefix text, p_store text, p_wh text) returns void language plpgsql as $$
declare
  v_zone uuid;
begin
  insert into public.shipping_zones (store_id, name) values (tests.fx(p_store), 'Centro') returning id into v_zone;
  insert into pg_temp.fixtures values (p_prefix || 'zone', v_zone);
  insert into public.shipping_zones (store_id, name, is_active) values (tests.fx(p_store), 'Oculta', false);
  insert into public.shipping_methods (store_id, zone_id, type, name, price)
  values (tests.fx(p_store), v_zone, 'delivery', 'Mensajería', 200);
  insert into public.shipping_methods (store_id, zone_id, type, name, is_active)
  values (tests.fx(p_store), v_zone, 'to_agree', 'A convenir', false);
  insert into public.payment_methods (store_id, name, currencies) values (tests.fx(p_store), 'Efectivo', '{CUP}');
  insert into public.payment_methods (store_id, name, is_active) values (tests.fx(p_store), 'Inactivo', false);
end $$;

select pg_temp.seed_options('a_', 'store_a', 'wh_a');
select pg_temp.seed_options('b_', 'store_b', 'wh_b');
update public.warehouses set is_pickup_point = true, address = 'Tienda A, Calle 23' where id = tests.fx('wh_a');

-- Orders: one per customer of A and B, and a guest order in A.
create function pg_temp.add_order(p_key text, p_store text, p_wh text, p_customer text, p_number int) returns void
language plpgsql as $$
declare
  v_order uuid;
  v_line uuid;
begin
  insert into public.orders (store_id, number, customer_id, currency, subtotal, shipping_total, total,
    customer_name, customer_phone, warehouse_id)
  values (tests.fx(p_store), p_number, tests.fx(p_customer), 'CUP', 1000, 200, 1200, p_key, '+5353000001', tests.fx(p_wh))
  returning id into v_order;
  insert into pg_temp.fixtures values (p_key, v_order);
  insert into public.order_lines (store_id, order_id, product_name, sku, quantity, unit_price, line_total)
  values (tests.fx(p_store), v_order, 'Vestido', 'SKU-1', 2, 500, 1000) returning id into v_line;
  insert into public.order_line_costs (store_id, order_line_id, unit_cost, cost_currency)
  values (tests.fx(p_store), v_line, 3, 'USD');
  insert into public.order_events (store_id, order_id, type) values (tests.fx(p_store), v_order, 'created');
  insert into public.order_events (store_id, order_id, type, is_internal, payload)
  values (tests.fx(p_store), v_order, 'note', true, '{"text": "cliente difícil"}');
  insert into public.payments (store_id, order_id, amount, currency) values (tests.fx(p_store), v_order, 100, 'CUP');
  insert into public.refunds (store_id, order_id, amount, currency) values (tests.fx(p_store), v_order, 50, 'CUP');
end $$;

select pg_temp.add_order('o_a', 'store_a', 'wh_a', 'c_a', 1001);
select pg_temp.add_order('o_b', 'store_b', 'wh_b', 'c_b', 1001);
select pg_temp.add_order('o_a_cross', 'store_a', 'wh_a', 'c_a_cross', 1002);
with x as (
  insert into public.orders (store_id, number, currency, subtotal, customer_name, customer_phone, warehouse_id)
  values (tests.fx('store_a'), 1003, 'CUP', 500, 'Invitado', '+5353000009', tests.fx('wh_a')) returning id
) insert into pg_temp.fixtures select 'o_guest', id from x;

with x as (
  insert into public.carts (store_id, customer_id) values (tests.fx('store_a'), tests.fx('c_a')) returning id
) insert into pg_temp.fixtures select 'cart_a', id from x;

-- ---------------------------------------------------------------------------
-- Integrity
-- ---------------------------------------------------------------------------

select tests.check('FK: order of A cannot point to a customer of B', tests.throws(format(
  $$update public.orders set customer_id = %L where id = %L$$, tests.fx('c_b'), tests.fx('o_a'))));
select tests.check('FK: order of A cannot use a warehouse of B', tests.throws(format(
  $$update public.orders set warehouse_id = %L where id = %L$$, tests.fx('wh_b'), tests.fx('o_a'))));
select tests.check('FK: method of A cannot use a zone of B', tests.throws(format(
  $$insert into public.shipping_methods (store_id, zone_id, type, name) values (%L, %L, 'delivery', 'X')$$,
  tests.fx('store_a'), tests.fx('b_zone'))));
select tests.check('order number is unique per store', tests.throws(format(
  $$insert into public.orders (store_id, number, currency, subtotal, customer_name, customer_phone, warehouse_id)
    values (%L, 1001, 'CUP', 1, 'X', '+5353000001', %L)$$, tests.fx('store_a'), tests.fx('wh_a'))));
select tests.check('order number 1001 can repeat in another store',
  (select count(*) from public.orders where number = 1001 and store_id in (tests.fx('store_a'), tests.fx('store_b'))) = 2);
select tests.check('phone is unique per store', tests.throws(format(
  $$insert into public.customers (store_id, user_id, phone, first_name) values (%L, %L, '+5353000001', 'X')$$,
  tests.fx('store_a'), tests.fx('owner_a'))));
select tests.check('shipping and total are both set or both null', tests.throws(format(
  $$update public.orders set shipping_total = null where id = %L$$, tests.fx('o_a'))));
select tests.check('pickup method needs a warehouse', tests.throws(format(
  $$insert into public.shipping_methods (store_id, type, name) values (%L, 'pickup', 'Recogida')$$, tests.fx('store_a'))));
select tests.check('to_agree method cannot have a price', tests.throws(format(
  $$insert into public.shipping_methods (store_id, type, name, price) values (%L, 'to_agree', 'X', 5)$$, tests.fx('store_a'))));
select tests.check('phone must be E.164', tests.throws(format(
  $$update public.customers set phone = '53000001' where id = %L$$, tests.fx('c_a'))));

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.eq('anon: sees only active zones of A',
  (select count(*) from public.shipping_zones where store_id = tests.fx('store_a'))::int, 1);
select tests.eq('anon: sees only active methods of A',
  (select count(*) from public.shipping_methods where store_id = tests.fx('store_a'))::int, 1);
select tests.eq('anon: sees only active payment methods of A',
  (select count(*) from public.payment_methods where store_id = tests.fx('store_a'))::int, 1);
select tests.eq('anon: sees the pickup point of A (name and address)',
  (select address from public.warehouses where id = tests.fx('wh_a')), 'Tienda A, Calle 23');
select tests.eq('anon: does not see non-pickup warehouses',
  (select count(*) from public.warehouses where id = tests.fx('wh_b'))::int, 0);
select tests.check('anon: cannot read warehouse phone', tests.throws('select phone from public.warehouses'));
select tests.check('anon: cannot read customers', tests.throws('select * from public.customers'));
select tests.check('anon: cannot read orders', tests.throws('select * from public.orders'));
select tests.check('anon: cannot read order_lines', tests.throws('select * from public.order_lines'));
select tests.check('anon: cannot read carts', tests.throws('select * from public.carts'));
select tests.check('anon: cannot read payments', tests.throws('select * from public.payments'));
select tests.check('anon: cannot read the OTP table', tests.throws('select * from private.customer_otps'));
select tests.check('anon: GraphQL has no ordersCollection', (
  select graphql.resolve(query := '{ ordersCollection(first: 1) { edges { node { id } } } }') ? 'errors'));
select tests.logout();

update public.stores set status = 'suspended' where id = tests.fx('store_b');
select tests.login_anon();
select tests.eq('anon: a suspended store shows no checkout options',
  (select count(*) from public.shipping_methods where store_id = tests.fx('store_b'))::int
  + (select count(*) from public.payment_methods where store_id = tests.fx('store_b'))::int, 0);
select tests.logout();
update public.stores set status = 'active' where id = tests.fx('store_b');

-- ---------------------------------------------------------------------------
-- Customer of A
-- ---------------------------------------------------------------------------

select tests.login('cust_a');
select tests.eq('customer A: reads only its customer row',
  (select count(*) from public.customers)::int, 1);
select tests.eq('customer A: reads only its addresses',
  (select count(*) from public.customer_addresses)::int, 1);
select tests.eq('customer A: reads only its order',
  (select array_agg(id) from public.orders), array[tests.fx('o_a')]);
select tests.eq('customer A: reads the lines of its order only',
  (select count(*) from public.order_lines)::int, 1);
select tests.eq('customer A: reads public events of its order, not internal notes',
  (select count(*) from public.order_events)::int, 1);
select tests.eq('customer A: reads payments and refunds of its order only',
  (select count(*) from public.payments)::int + (select count(*) from public.refunds)::int, 2);
select tests.eq('customer A: no line costs', (select count(*) from public.order_line_costs)::int, 0);
select tests.eq('customer A: no reservations', (select count(*) from public.inventory_reservations)::int, 0);
select tests.eq('customer A: no carts through the API roles', (select count(*) from public.carts)::int, 0);
select tests.check('customer A: cannot read the cart token', tests.throws('select token from public.carts'));
select tests.eq('customer A: does not see the guest order', (select count(*) from public.orders where id = tests.fx('o_guest'))::int, 0);
select tests.eq('customer A: cannot update its order', tests.affected(format(
  $$update public.orders set status = 'paid' where id = %L$$, tests.fx('o_a'))), -1);
select tests.eq('customer A: cannot insert orders', tests.affected(format(
  $$insert into public.orders (store_id, number, currency, subtotal, customer_name, customer_phone, warehouse_id)
    values (%L, 5000, 'CUP', 1, 'X', '+5353000001', %L)$$, tests.fx('store_a'), tests.fx('wh_a'))), -1);
select tests.eq('customer A: cannot update its profile directly', tests.affected(format(
  $$update public.customers set is_blocked = false where id = %L$$, tests.fx('c_a'))), -1);
select tests.check('customer A: GraphQL lists its order without cost fields', (
  select graphql.resolve(query := '{ ordersCollection { edges { node { number orderLinesCollection { edges { node { sku } } } } } } }')
    -> 'data' -> 'ordersCollection' -> 'edges' -> 0 -> 'node' ->> 'number' = '1001'));
select tests.check('customer A: GraphQL cannot reach line costs', (
  select coalesce(jsonb_array_length(graphql.resolve(query := '{ orderLineCostsCollection { edges { node { unitCost } } } }')
    -> 'data' -> 'orderLineCostsCollection' -> 'edges'), 0) = 0));
select tests.logout();

-- A customer token whose store_id claim does not match the customer row sees nothing.
select tests.login('cust_a_cross');
select tests.eq('cross token: no customer row', (select count(*) from public.customers)::int, 0);
select tests.eq('cross token: no orders', (select count(*) from public.orders)::int, 0);
select tests.eq('cross token: no lines, events or payments',
  (select count(*) from public.order_lines)::int + (select count(*) from public.order_events)::int
  + (select count(*) from public.payments)::int, 0);
select tests.logout();

-- Same user id with a store_id claim of B cannot read the rows it has in A: simulate a copied token.
update auth.users set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('store_id', tests.fx('store_b'))
where id = tests.fx('cust_a');
select tests.login('cust_a');
select tests.eq('customer A token with store B claim: sees nothing of A',
  (select count(*) from public.orders)::int + (select count(*) from public.customers)::int, 0);
select tests.logout();
update auth.users set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('store_id', tests.fx('store_a'))
where id = tests.fx('cust_a');

-- A staff token is not a customer token (kind missing).
select tests.login('owner_b');
select tests.eq('owner B: does not see orders, customers or carts of A',
  (select count(*) from public.orders where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.customers where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.carts where store_id = tests.fx('store_a'))::int, 0);
select tests.eq('owner B: does not see lines, costs, events, payments or refunds of A',
  (select count(*) from public.order_lines where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.order_line_costs where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.order_events where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.payments where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.refunds where store_id = tests.fx('store_a'))::int, 0);
select tests.eq('owner B: does not see inactive options of A',
  (select count(*) from public.shipping_zones where store_id = tests.fx('store_a') and not is_active)::int, 0);
select tests.eq('owner B: reads its own orders and costs',
  (select count(*) from public.orders where store_id = tests.fx('store_b'))::int
  + (select count(*) from public.order_line_costs where store_id = tests.fx('store_b'))::int, 2);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Staff of A
-- ---------------------------------------------------------------------------

select tests.login('owner_a');
select tests.eq('owner A: reads every order of A (customers, cross and guest)',
  (select count(*) from public.orders where store_id = tests.fx('store_a'))::int, 3);
select tests.eq('owner A: reads internal notes', (select count(*) from public.order_events
  where store_id = tests.fx('store_a') and is_internal)::int, 2);
select tests.check('owner A: reads line costs', (select count(*) from public.order_line_costs where store_id = tests.fx('store_a')) = 2);
select tests.eq('owner A: reads inactive options', (select count(*) from public.payment_methods
  where store_id = tests.fx('store_a'))::int, 2);
select tests.eq('owner A: reads carts', (select count(*) from public.carts where store_id = tests.fx('store_a'))::int, 1);
select tests.eq('owner A: cannot change an order directly', tests.affected(format(
  $$update public.orders set status = 'paid' where id = %L$$, tests.fx('o_a'))), -1);
select tests.eq('owner A: cannot insert payments directly', tests.affected(format(
  $$insert into public.payments (store_id, order_id, amount, currency) values (%L, %L, 1, 'CUP')$$,
  tests.fx('store_a'), tests.fx('o_a'))), -1);
select tests.eq('owner A: does not see B', (select count(*) from public.orders where store_id = tests.fx('store_b'))::int, 0);
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff A: reads orders of A', (select count(*) from public.orders where store_id = tests.fx('store_a'))::int, 3);
select tests.eq('staff A: cannot read line costs (admin only)',
  (select count(*) from public.order_line_costs where store_id = tests.fx('store_a'))::int, 0);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Order functions (phase 3.2): checkout, idempotency, stock, states, payments, cancel, cart merge
-- ---------------------------------------------------------------------------

-- Catalog: type Ropa (Talla S/M as variants), product with S (4 units, cost 3 USD) and M (1 unit).
create function pg_temp.seed_product(p_prefix text, p_store text, p_owner text, p_sku text) returns void
language plpgsql as $$
declare
  v_attr uuid; v_s uuid; v_m uuid; v_type uuid; v_product uuid;
begin
  insert into public.attributes (store_id, name, slug) values (tests.fx(p_store), 'Talla', 'talla') returning id into v_attr;
  insert into public.attribute_values (store_id, attribute_id, name, slug) values (tests.fx(p_store), v_attr, 'S', 's') returning id into v_s;
  insert into public.attribute_values (store_id, attribute_id, name, slug) values (tests.fx(p_store), v_attr, 'M', 'm') returning id into v_m;
  insert into public.product_types (store_id, name, slug, has_variants) values (tests.fx(p_store), 'Ropa', 'ropa', true)
    returning id into v_type;
  insert into public.product_type_attributes (store_id, product_type_id, attribute_id, scope, variant_selection)
  values (tests.fx(p_store), v_type, v_attr, 'variant', true);
  v_product := public.save_product(tests.fx(p_store), jsonb_build_object(
    'product_type_id', v_type, 'name', 'Vestido ' || p_prefix, 'slug', 'vestido-' || rtrim(p_prefix, '_'), 'status', 'published',
    'variants', jsonb_build_array(
      jsonb_build_object('sku', p_sku || '-S', 'price', 1500, 'stock', 4,
        'cost', jsonb_build_object('price', 3, 'currency', 'USD'),
        'attribute_values', jsonb_build_array(jsonb_build_object('attribute_id', v_attr, 'value_id', v_s))),
      jsonb_build_object('sku', p_sku || '-M', 'price', 1800, 'stock', 1,
        'attribute_values', jsonb_build_array(jsonb_build_object('attribute_id', v_attr, 'value_id', v_m))))),
    tests.fx(p_owner));
  insert into pg_temp.fixtures values (p_prefix || 'product', v_product);
  insert into pg_temp.fixtures select p_prefix || 'v_s', id from public.product_variants where sku = p_sku || '-S' and store_id = tests.fx(p_store);
  insert into pg_temp.fixtures select p_prefix || 'v_m', id from public.product_variants where sku = p_sku || '-M' and store_id = tests.fx(p_store);
end $$;

select pg_temp.seed_product('fa_', 'store_a', 'owner_a', 'FA');
select pg_temp.seed_product('fb_', 'store_b', 'owner_b', 'FB');
-- Fixture orders took 1001-1003 in A and 1001 in B by hand.
insert into public.store_order_counters (store_id, last_number) values (tests.fx('store_a'), 1003), (tests.fx('store_b'), 1001);
insert into pg_temp.fixtures select 'm_delivery', id from public.shipping_methods
  where store_id = tests.fx('store_a') and type = 'delivery';
insert into pg_temp.fixtures select 'm_agree', id from public.shipping_methods
  where store_id = tests.fx('store_a') and type = 'to_agree';
update public.shipping_methods set is_active = true where id = tests.fx('m_agree');
insert into pg_temp.fixtures select 'pm_cash', id from public.payment_methods
  where store_id = tests.fx('store_a') and name = 'Efectivo';

create function pg_temp.checkout(p_store text, p_key text, p_lines jsonb, p_method text, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select public.checkout_create_order(tests.fx(p_store), jsonb_build_object(
    'idempotency_key', p_key, 'channel', 'web', 'currency', 'CUP', 'lines', p_lines,
    'customer', jsonb_build_object('name', 'Invitada', 'phone', '+5353123456'),
    'shipping', jsonb_build_object('method_id', tests.fx(p_method), 'zone_id', tests.fx('a_zone'), 'address', 'Calle 5 #12'),
    'payment_method_id', tests.fx('pm_cash')) || p_extra);
$$;

create function pg_temp.lines(p_variant text, p_quantity int) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('variant_id', tests.fx(p_variant), 'quantity', p_quantity));
$$;

create function pg_temp.stock(p_variant text) returns text language sql as $$
  select format('%s/%s/%s', s.quantity, s.quantity_allocated, v.stock_available)
  from public.stocks s join public.product_variants v on v.id = s.variant_id where s.variant_id = tests.fx(p_variant);
$$;

-- Checkout with delivery: 2 x S + 1 x M (the last M).
insert into pg_temp.fixtures select 'ord1', (pg_temp.checkout('store_a', 'key-ord-0001',
  pg_temp.lines('fa_v_s', 2) || pg_temp.lines('fa_v_m', 1), 'm_delivery') ->> 'order_id')::uuid;
select tests.eq('checkout: number continues the store counter', (select number from public.orders where id = tests.fx('ord1')), 1004);
select tests.eq('checkout: totals (2x1500 + 1800 + shipping 200)',
  (select format('%s+%s=%s', subtotal, shipping_total, total) from public.orders where id = tests.fx('ord1')), '4800.00+200.00=5000.00');
select tests.eq('checkout: reserves stock (S: 4 units, 2 reserved)', pg_temp.stock('fa_v_s'), '4/2/2');
select tests.eq('checkout: last M reserved, not available', pg_temp.stock('fa_v_m'), '1/1/0');
select tests.eq('checkout: line snapshot with attributes', (select attributes -> 0 ->> 'value' from public.order_lines
  where order_id = tests.fx('ord1') and sku = 'FA-S'), 'S');
select tests.eq('checkout: line cost snapshot', (select format('%s %s', c.unit_cost, c.cost_currency)
  from public.order_line_costs c join public.order_lines l on l.id = c.order_line_id
  where l.order_id = tests.fx('ord1') and l.sku = 'FA-S'), '3.00 USD');
select tests.eq('checkout: shipping snapshot', (select shipping_snapshot ->> 'address' from public.orders where id = tests.fx('ord1')),
  'Calle 5 #12');
select tests.eq('checkout: created event', (select count(*) from public.order_events where order_id = tests.fx('ord1') and type = 'created')::int, 1);

-- Idempotency: the same key returns the same order without reserving again.
select tests.eq('checkout: retry with the same key returns the same order', (pg_temp.checkout('store_a', 'key-ord-0001',
  pg_temp.lines('fa_v_s', 2), 'm_delivery') ->> 'order_id')::uuid, tests.fx('ord1'));
select tests.eq('checkout: retry does not reserve again', pg_temp.stock('fa_v_s'), '4/2/2');

-- Stock and validation.
select tests.check('checkout: more than available is rejected', tests.throws(
  $$select pg_temp.checkout('store_a', 'key-ord-0002', pg_temp.lines('fa_v_s', 3), 'm_delivery')$$));
select tests.eq('checkout: a rejected checkout leaves stock and counter untouched',
  pg_temp.stock('fa_v_s') || ' ' || (select last_number from public.store_order_counters where store_id = tests.fx('store_a')), '4/2/2 1004');
select tests.check('checkout: a variant of another store is rejected', tests.throws(
  $$select pg_temp.checkout('store_a', 'key-ord-0003', pg_temp.lines('fb_v_s', 1), 'm_delivery')$$));
select tests.check('checkout: delivery needs an address', tests.throws(
  $$select pg_temp.checkout('store_a', 'key-ord-0004', pg_temp.lines('fa_v_s', 1), 'm_delivery',
    jsonb_build_object('shipping', jsonb_build_object('method_id', tests.fx('m_delivery'), 'zone_id', tests.fx('a_zone'))))$$));
select tests.check('checkout: payment method of another store is rejected', tests.throws(
  $$select pg_temp.checkout('store_a', 'key-ord-0005', pg_temp.lines('fa_v_s', 1), 'm_delivery',
    jsonb_build_object('payment_method_id', (select id from public.payment_methods where store_id = tests.fx('store_b') and is_active)))$$));
select tests.check('checkout: bad phone is rejected', tests.throws(
  $$select pg_temp.checkout('store_a', 'key-ord-0006', pg_temp.lines('fa_v_s', 1), 'm_delivery',
    jsonb_build_object('customer', jsonb_build_object('name', 'X', 'phone', '5312')))$$));
select tests.check('stock: allocated can never exceed quantity', tests.throws(format(
  $$update public.stocks set quantity_allocated = quantity + 1 where variant_id = %L$$, tests.fx('fa_v_s'))));
select public.set_products_status(tests.fx('store_a'), array[tests.fx('fa_product')], 'draft');
select tests.check('checkout: draft products cannot be bought from the storefront', tests.throws(
  $$select pg_temp.checkout('store_a', 'key-ord-0007', pg_temp.lines('fa_v_s', 1), 'm_delivery')$$));
select tests.check('checkout: the admin channel can sell a draft product', not tests.throws(
  $$select pg_temp.checkout('store_a', 'key-ord-0008', pg_temp.lines('fa_v_s', 1), 'm_delivery', '{"channel": "admin"}')$$));
select public.set_products_status(tests.fx('store_a'), array[tests.fx('fa_product')], 'published');
insert into pg_temp.fixtures select 'ord_admin', id from public.orders where idempotency_key = 'key-ord-0008';
select tests.eq('admin channel recorded', (select channel::text from public.orders where id = tests.fx('ord_admin')), 'admin');

-- Selling the last available units flips the product (S had 1 left after ord_admin; M already sold out).
select tests.eq('checkout: flipped products when the product sells out', (pg_temp.checkout('store_a', 'key-ord-0009',
  pg_temp.lines('fa_v_s', 1), 'm_delivery') -> 'flipped_product_ids' ->> 0)::uuid, tests.fx('fa_product'));
insert into pg_temp.fixtures select 'ord2', id from public.orders where idempotency_key = 'key-ord-0009';
select tests.eq('checkout: product summary shows out of stock', (select in_stock from public.products where id = tests.fx('fa_product')), false);

-- "To agree": no total until the staff sets the shipping cost.
select public.order_cancel(tests.fx('store_a'), tests.fx('ord_admin'), null, null);
select public.set_stock_quantity(tests.fx('store_a'), tests.fx('fa_v_s'), tests.fx('wh_a'), 10, 'adjustment', null, null);
insert into pg_temp.fixtures select 'ord3', (pg_temp.checkout('store_a', 'key-ord-0010',
  pg_temp.lines('fa_v_s', 1), 'm_agree') ->> 'order_id')::uuid;
select tests.eq('to agree: shipping and total are null', (select coalesce(shipping_total::text, 'null') || coalesce(total::text, 'null')
  from public.orders where id = tests.fx('ord3')), 'nullnull');
select tests.check('to agree: cannot confirm without shipping cost', tests.throws(format(
  $$select public.order_transition(%L, %L, 'pending_payment', null)$$, tests.fx('store_a'), tests.fx('ord3'))));
select tests.check('to agree: cannot mark paid without shipping cost', tests.throws(format(
  $$select public.order_transition(%L, %L, 'paid', null)$$, tests.fx('store_a'), tests.fx('ord3'))));
select public.order_set_shipping(tests.fx('store_a'), tests.fx('ord3'), 150, tests.fx('owner_a'));
select tests.eq('to agree: total after setting shipping', (select total from public.orders where id = tests.fx('ord3')), 1650.00);
select tests.eq('to agree: confirm after setting shipping',
  (public.order_transition(tests.fx('store_a'), tests.fx('ord3'), 'pending_payment', tests.fx('owner_a'))).status, 'pending_payment');

-- States and payments.
select tests.check('transition: pending -> delivered is rejected', tests.throws(format(
  $$select public.order_transition(%L, %L, 'delivered', null)$$, tests.fx('store_a'), tests.fx('ord1'))));
select tests.check('transition: order of another store is not found', tests.throws(format(
  $$select public.order_transition(%L, %L, 'pending_payment', null)$$, tests.fx('store_b'), tests.fx('ord1'))));
select public.order_record_payment(tests.fx('store_a'), tests.fx('ord1'),
  jsonb_build_object('amount', 1000, 'payment_method_id', tests.fx('pm_cash'), 'reference', 'TRF-1'), tests.fx('owner_a'));
select tests.eq('payment: partial payment', (select format('%s %s', payment_status, paid_total) from public.orders
  where id = tests.fx('ord1')), 'partially_paid 1000.00');
select public.order_transition(tests.fx('store_a'), tests.fx('ord1'), 'paid', tests.fx('owner_a'));
select tests.eq('paid: records the outstanding amount', (select format('%s %s', payment_status, paid_total) from public.orders
  where id = tests.fx('ord1')), 'paid 5000.00');
select tests.eq('paid: consumes the reservation (M sold: 0 units, 0 reserved)', pg_temp.stock('fa_v_m'), '0/0/0');
select tests.eq('paid: sale movements recorded', (select sum(quantity) from public.stock_movements
  where order_id = tests.fx('ord1') and type = 'sale')::int, -3);
select public.order_transition(tests.fx('store_a'), tests.fx('ord1'), 'processing', null);
select public.order_transition(tests.fx('store_a'), tests.fx('ord1'), 'shipped', null);
select tests.eq('paid -> processing -> shipped', (select status::text from public.orders where id = tests.fx('ord1')), 'shipped');
select tests.check('cancel: a shipped order cannot be cancelled', tests.throws(format(
  $$select public.order_cancel(%L, %L, 'x', null)$$, tests.fx('store_a'), tests.fx('ord1'))));

-- Cancel a pending order: releases the reservation.
select public.order_cancel(tests.fx('store_a'), tests.fx('ord2'), 'Cliente no respondió', tests.fx('owner_a'));
select tests.eq('cancel pending: reservation released', (select string_agg(status::text, ',') from public.inventory_reservations
  where order_id = tests.fx('ord2')), 'released');
select tests.eq('cancel pending: no refund without payments', (select count(*) from public.refunds where order_id = tests.fx('ord2'))::int, 0);

-- Cancel a paid order: units go back and the refund is recorded.
select public.order_transition(tests.fx('store_a'), tests.fx('ord3'), 'paid', tests.fx('owner_a'));
select tests.eq('paid to-agree order consumed 1 unit (ord1 took 2 of 10)', pg_temp.stock('fa_v_s'), '7/0/7');
select public.order_cancel(tests.fx('store_a'), tests.fx('ord3'), 'Devuelto', tests.fx('owner_a'));
select tests.eq('cancel paid: units back in stock', pg_temp.stock('fa_v_s'), '8/0/8');
select tests.eq('cancel paid: refund and payment status', (select format('%s %s', o.payment_status, r.amount)
  from public.orders o join public.refunds r on r.order_id = o.id where o.id = tests.fx('ord3')), 'refunded 1650.00');
select tests.eq('cancel paid: restock movement', (select sum(quantity) from public.stock_movements
  where order_id = tests.fx('ord3') and type = 'cancel')::int, 1);

-- Cart merge: the guest cart joins the customer's active cart.
with g as (insert into public.carts (store_id) values (tests.fx('store_a')) returning id, token)
insert into pg_temp.fixtures select 'guest_cart', id from g union all select 'guest_token', token from g;
insert into public.cart_lines (store_id, cart_id, variant_id, quantity) values
  (tests.fx('store_a'), tests.fx('guest_cart'), tests.fx('fa_v_s'), 2),
  (tests.fx('store_a'), tests.fx('cart_a'), tests.fx('fa_v_s'), 1);
select tests.eq('cart merge: returns the customer cart',
  public.cart_merge(tests.fx('store_a'), tests.fx('guest_token'), tests.fx('c_a')), tests.fx('cart_a'));
select tests.eq('cart merge: quantities added, guest cart removed', (select quantity from public.cart_lines
  where cart_id = tests.fx('cart_a') and variant_id = tests.fx('fa_v_s')) * 10
  + (select count(*) from public.carts where id = tests.fx('guest_cart'))::int, 30);
select tests.eq('cart merge: a customer of B cannot take a cart of A',
  public.cart_merge(tests.fx('store_b'), tests.fx('guest_token'), tests.fx('c_b')), null::uuid);

-- Multi-warehouse (Pro): the checkout reserves the default warehouse first, then the others, and agrees with
-- stock_available (sum of every active warehouse).
with w as (insert into public.warehouses (store_id, name) values (tests.fx('store_b'), 'Segundo') returning id)
insert into pg_temp.fixtures select 'wh_b2', id from w;
select public.set_stock_quantity(tests.fx('store_b'), tests.fx('fb_v_s'), tests.fx('wh_b2'), 3, 'adjustment', null, null);
select tests.eq('multi-warehouse: stock_available sums both warehouses',
  (select stock_available from public.product_variants where id = tests.fx('fb_v_s')), 7);
insert into pg_temp.fixtures select 'ord_b_split', (public.checkout_create_order(tests.fx('store_b'), jsonb_build_object(
  'idempotency_key', 'key-ord-b-split', 'currency', 'USD',
  'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx('fb_v_s'), 'quantity', 6)),
  'customer', jsonb_build_object('name', 'Split', 'phone', '+5353123456'),
  'shipping', jsonb_build_object('method_id', (select id from public.shipping_methods where store_id = tests.fx('store_b') and type = 'delivery'),
    'zone_id', tests.fx('b_zone'), 'address', 'Calle 1'))) ->> 'order_id')::uuid;
select tests.eq('multi-warehouse: 6 units reserved as 4 (default) + 2 (second)', (
  select string_agg(r.quantity::text, '+' order by w.is_default desc)
  from public.inventory_reservations r join public.warehouses w on w.id = r.warehouse_id
  where r.order_id = tests.fx('ord_b_split')), '4+2');
select tests.check('multi-warehouse: one more unit than available is rejected', tests.throws(format(
  $$select public.checkout_create_order(%L, jsonb_build_object('currency', 'USD',
    'lines', jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 2)),
    'customer', jsonb_build_object('name', 'X', 'phone', '+5353123456'),
    'shipping', jsonb_build_object('method_id', (select id from public.shipping_methods where store_id = %L and type = 'delivery'),
      'zone_id', %L, 'address', 'Calle 1')))$$,
  tests.fx('store_b'), tests.fx('fb_v_s'), tests.fx('store_b'), tests.fx('b_zone'))));
select public.order_transition(tests.fx('store_b'), tests.fx('ord_b_split'), 'paid', null);
select tests.eq('multi-warehouse: paying consumes in both warehouses', (
  select string_agg(s.quantity || '/' || s.quantity_allocated, ' ' order by w.is_default desc)
  from public.stocks s join public.warehouses w on w.id = s.warehouse_id where s.variant_id = tests.fx('fb_v_s')), '0/0 1/0');
select public.order_cancel(tests.fx('store_b'), tests.fx('ord_b_split'), 'x', null);
select tests.eq('multi-warehouse: cancelling a paid order restocks both warehouses', (
  select string_agg(s.quantity || '/' || s.quantity_allocated, ' ' order by w.is_default desc)
  from public.stocks s join public.warehouses w on w.id = s.warehouse_id where s.variant_id = tests.fx('fb_v_s')), '4/0 3/0');

-- Only service_role can call the write functions.
select tests.login('owner_a');
select tests.check('owner A: cannot call checkout_create_order directly', tests.throws(format(
  $$select public.checkout_create_order(%L, '{}'::jsonb)$$, tests.fx('store_a'))));
select tests.check('owner A: cannot call order_transition directly', tests.throws(format(
  $$select public.order_transition(%L, %L, 'paid', null)$$, tests.fx('store_a'), tests.fx('ord1'))));
select tests.logout();
select tests.login('cust_a');
select tests.check('customer A: cannot call order_cancel', tests.throws(format(
  $$select public.order_cancel(%L, %L, 'x', null)$$, tests.fx('store_a'), tests.fx('o_a'))));
select tests.logout();
select tests.login_anon();
select tests.check('anon: cannot call checkout_create_order', tests.throws(format(
  $$select public.checkout_create_order(%L, '{}'::jsonb)$$, tests.fx('store_a'))));
select tests.logout();
