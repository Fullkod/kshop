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
