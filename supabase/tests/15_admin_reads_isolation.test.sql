-- R11 phase 5: the admin's RPC reads (admin_orders, admin_order, admin_checkout_settings, admin_notification_log)
-- run as the caller (security invoker), so they see exactly what pg_graphql would: the staff of a store see its
-- orders and notices, only admins see line costs, the staff of another store and customers see none of it, anon
-- cannot call them.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Reads Test A', 'reads-test-a', tests.fx('owner_a'), 'CUP', 'RA', '5351111111', 'pro', 30, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Reads Test B', 'reads-test-b', tests.fx('owner_b'), 'CUP', 'RB', '5352222222', 'base', 30, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');
select tests.create_user('cust_a', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_a')));

with o as (
  insert into public.orders (store_id, number, currency, subtotal, shipping_total, total, customer_name, customer_phone,
    warehouse_id)
  select tests.fx('store_a'), 1001, 'CUP', 1000, 200, 1200, 'Ana Reads', '+5353000001', w.id
  from public.warehouses w where w.store_id = tests.fx('store_a') limit 1
  returning id
) insert into pg_temp.fixtures select 'order_a', id from o;
with l as (
  insert into public.order_lines (store_id, order_id, product_name, sku, quantity, unit_price, line_total)
  values (tests.fx('store_a'), tests.fx('order_a'), 'Vestido', 'SKU-1', 2, 500, 1000)
  returning id
) insert into public.order_line_costs (store_id, order_line_id, unit_cost, cost_currency)
select tests.fx('store_a'), id, 3, 'USD' from l;
insert into public.notification_log (store_id, order_id, audience, event, recipient, message, status)
values (tests.fx('store_a'), tests.fx('order_a'), 'customer', 'order_created', '+5353000001', 'Hola', 'simulated');

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.check('anon: cannot call the admin reads',
  tests.throws(format('select public.admin_orders(%L, 10)', tests.fx('store_a')))
  and tests.throws(format('select public.admin_order(%L)', tests.fx('order_a')))
  and tests.throws(format('select public.admin_checkout_settings(%L)', tests.fx('store_a')))
  and tests.throws(format('select public.admin_notification_log(%L, 10)', tests.fx('store_a'))));
select tests.logout();

select tests.login('owner_a');
select tests.eq('owner A: its order in the list',
  (select format('%s %s', r->'ordersCollection'->>'totalCount',
     r->'ordersCollection'->'edges'->0->'node'->>'customerName')
   from (select public.admin_orders(tests.fx('store_a'), 10) r) x),
  '1 Ana Reads');
select tests.eq('owner A: search by name and by number',
  (select format('%s %s',
     public.admin_orders(tests.fx('store_a'), 10, p_name => '%ana%', p_phone => '%ana%')->'ordersCollection'->>'totalCount',
     public.admin_orders(tests.fx('store_a'), 10, p_number => 1001)->'ordersCollection'->>'totalCount')),
  '1 1');
select tests.eq('owner A: the order with its line cost',
  (select r->'ordersCollection'->'edges'->0->'node'->'orderLinesCollection'->'edges'->0->'node'->'orderLineCosts'->>'unitCost'
   from (select public.admin_order(tests.fx('order_a')) r) x),
  '3.00');
select tests.eq('owner A: the notices of its store and of the order',
  (select format('%s %s',
     public.admin_notification_log(tests.fx('store_a'), 10)->'notificationLogCollection'->>'totalCount',
     public.admin_notification_log(tests.fx('store_a'), 10, tests.fx('order_a'))->'notificationLogCollection'->'edges'->0->'node'->'orders'->>'number')),
  '1 1001');
select tests.eq('owner A: its order prefix in the checkout settings',
  (select public.admin_checkout_settings(tests.fx('store_a'))->'storesCollection'->'edges'->0->'node'->>'orderPrefix'),
  'RA');
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff A: the order, but no line cost',
  (select format('%s %s', jsonb_array_length(r->'ordersCollection'->'edges'),
     coalesce(r->'ordersCollection'->'edges'->0->'node'->'orderLinesCollection'->'edges'->0->'node'->>'orderLineCosts', '-'))
   from (select public.admin_order(tests.fx('order_a')) r) x),
  '1 -');
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B on store A: no orders, order nor notices',
  (select format('%s %s %s',
     public.admin_orders(tests.fx('store_a'), 10)->'ordersCollection'->>'totalCount',
     jsonb_array_length(public.admin_order(tests.fx('order_a'))->'ordersCollection'->'edges'),
     public.admin_notification_log(tests.fx('store_a'), 10)->'notificationLogCollection'->>'totalCount')),
  '0 0 0');
select tests.check('owner B on store A: no cost anywhere',
  (select not (public.admin_order(tests.fx('order_a'))::text ~* 'unitCost')));
select tests.logout();

select tests.login('cust_a');
select tests.eq('customer of A: no orders list nor notices of the store',
  (select format('%s %s',
     public.admin_orders(tests.fx('store_a'), 10)->'ordersCollection'->>'totalCount',
     public.admin_notification_log(tests.fx('store_a'), 10)->'notificationLogCollection'->>'totalCount')),
  '0 0');
select tests.logout();
