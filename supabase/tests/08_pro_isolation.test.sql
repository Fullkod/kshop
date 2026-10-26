-- Phase 6 (Pro): warehouse zones, transfers, expenses, cost rate snapshot, market rates and custom domains.
-- Staff of a store read zones and movements but not finance; other stores, customers and anon nothing.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');
select tests.create_user('root', '{"role": "superadmin"}');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Pro Test A', 'pro-test-a', tests.fx('owner_a'), 'CUP', 'PA', '5351111111', 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Pro Test B', 'pro-test-b', tests.fx('owner_b'), 'CUP', 'PB', '5352222222', 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');
select tests.create_user('cust_a', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_a')));

insert into pg_temp.fixtures (key, id)
select 'wh_a', id from public.warehouses where store_id = tests.fx('store_a') and is_default;
insert into pg_temp.fixtures (key, id)
select 'wh_b', id from public.warehouses where store_id = tests.fx('store_b') and is_default;
with z as (insert into public.shipping_zones (store_id, name) values (tests.fx('store_a'), 'Centro') returning id)
insert into pg_temp.fixtures (key, id) select 'zone_a', id from z;
with z as (insert into public.shipping_zones (store_id, name) values (tests.fx('store_b'), 'Centro') returning id)
insert into pg_temp.fixtures (key, id) select 'zone_b', id from z;
insert into public.warehouse_shipping_zones (store_id, warehouse_id, zone_id)
values (tests.fx('store_a'), tests.fx('wh_a'), tests.fx('zone_a')),
       (tests.fx('store_b'), tests.fx('wh_b'), tests.fx('zone_b'));

insert into public.expenses (store_id, spent_on, category, amount, currency)
values (tests.fx('store_a'), current_date, 'Mensajería', 500, 'CUP'),
       (tests.fx('store_b'), current_date, 'Alquiler', 20, 'USD');

-- USD as a cost currency of A at 300, then 400 (history keeps both).
select public.set_store_currency(tests.fx('store_a'), 'USD', 300, false, null, tests.fx('owner_a'));
update public.currency_rate_history set set_at = now() - interval '2 days'
where store_id = tests.fx('store_a') and currency = 'USD';
select public.set_store_currency(tests.fx('store_a'), 'USD', 400, false, null, tests.fx('owner_a'));

-- An order of A in CUP with a line costing 2 USD.
create function pg_temp.order_line(p_store text, p_currency text, p_rate numeric) returns uuid
language plpgsql as $$
declare v_order uuid; v_line uuid; v_wh uuid;
begin
  select id into v_wh from public.warehouses where store_id = tests.fx(p_store) and is_default;
  insert into public.orders (store_id, number, currency, exchange_rate, subtotal, shipping_total, total,
    customer_name, customer_phone, warehouse_id)
  values (tests.fx(p_store), (select coalesce(max(number), 0) + 1 from public.orders where store_id = tests.fx(p_store)),
    p_currency, p_rate, 1000, 0, 1000, 'Cliente', '+5351234567', v_wh)
  returning id into v_order;
  insert into public.order_lines (store_id, order_id, product_name, sku, quantity, unit_price, line_total)
  values (tests.fx(p_store), v_order, 'Blusa', 'B-1', 1, 1000, 1000)
  returning id into v_line;
  return v_line;
end $$;

insert into pg_temp.fixtures values ('line_a', pg_temp.order_line('store_a', 'CUP', 1));
insert into public.order_line_costs (store_id, order_line_id, unit_cost, cost_currency)
values (tests.fx('store_a'), tests.fx('line_a'), 2, 'USD');
insert into pg_temp.fixtures values ('line_a_usd', pg_temp.order_line('store_a', 'USD', 380));
insert into public.order_line_costs (store_id, order_line_id, unit_cost, cost_currency)
values (tests.fx('store_a'), tests.fx('line_a_usd'), 2, 'USD');
insert into pg_temp.fixtures values ('line_b', pg_temp.order_line('store_b', 'CUP', 1));
insert into public.order_line_costs (store_id, order_line_id, unit_cost, cost_currency)
values (tests.fx('store_b'), tests.fx('line_b'), 100, 'CUP');

insert into public.store_domains (store_id, domain, type, status, dns_records)
values (tests.fx('store_a'), 'tienda-a.example.com', 'custom', 'pending', '[{"type": "A", "value": "76.76.21.21"}]');

-- ---------------------------------------------------------------------------
-- Schema rules
-- ---------------------------------------------------------------------------

select tests.eq('cost rate: other currency takes the store rate at sale time',
  (select cost_rate_to_base from public.order_line_costs where order_line_id = tests.fx('line_a')), 400.000000);
select tests.eq('cost rate: cost in the order currency takes the order rate',
  (select cost_rate_to_base from public.order_line_costs where order_line_id = tests.fx('line_a_usd')), 380.000000);
select tests.eq('cost rate: base currency is 1',
  (select cost_rate_to_base from public.order_line_costs where order_line_id = tests.fx('line_b')), 1.000000);
select tests.check('cost rate: every cost line has a rate',
  not exists (select 1 from public.order_line_costs where cost_rate_to_base is null));
select tests.check('a zone cannot be served by a warehouse of another store', tests.throws(format(
  $$insert into public.warehouse_shipping_zones (store_id, warehouse_id, zone_id) values (%L, %L, %L)$$,
  tests.fx('store_a'), tests.fx('wh_b'), tests.fx('zone_a'))));
select tests.check('expenses: positive amount', tests.throws(format(
  $$insert into public.expenses (store_id, spent_on, category, amount, currency) values (%L, current_date, 'x', 0, 'CUP')$$,
  tests.fx('store_a'))));
select tests.check('one custom domain per store', tests.throws(format(
  $$insert into public.store_domains (store_id, domain, type, status) values (%L, 'otra-a.example.com', 'custom', 'pending')$$,
  tests.fx('store_a'))));
select tests.check('a custom domain is verified exactly when verified_at is set', tests.throws(format(
  $$update public.store_domains set status = 'verified' where store_id = %L and type = 'custom'$$,
  tests.fx('store_a'))));
select tests.eq('subdomains are still created verified',
  (select status from public.store_domains where store_id = tests.fx('store_b') and type = 'subdomain'), 'verified');

-- ---------------------------------------------------------------------------
-- Multi-warehouse engine (phase 6.2): reservation by zone, transfers, module off
-- ---------------------------------------------------------------------------

with t as (insert into public.product_types (store_id, name, slug) values (tests.fx('store_a'), 'Simple', 'simple')
  returning id)
insert into pg_temp.fixtures select 'type_a', id from t;
insert into pg_temp.fixtures select 'product_a', public.save_product(tests.fx('store_a'), jsonb_build_object(
  'product_type_id', tests.fx('type_a'), 'name', 'Gorra', 'slug', 'gorra', 'status', 'published',
  'variants', jsonb_build_array(jsonb_build_object('sku', 'GOR', 'price', 1000, 'stock', 2))), tests.fx('owner_a'));
insert into pg_temp.fixtures select 'var_a', id from public.product_variants where store_id = tests.fx('store_a') and sku = 'GOR';
with w as (insert into public.warehouses (store_id, name) values (tests.fx('store_a'), 'Norte') returning id)
insert into pg_temp.fixtures select 'wh_a2', id from w;
select public.set_stock_quantity(tests.fx('store_a'), tests.fx('var_a'), tests.fx('wh_a2'), 5, 'adjustment', null, null);
with z as (insert into public.shipping_zones (store_id, name) values (tests.fx('store_a'), 'Norte') returning id)
insert into pg_temp.fixtures select 'zone_a2', id from z;
with m as (insert into public.shipping_methods (store_id, zone_id, type, name, price)
  values (tests.fx('store_a'), tests.fx('zone_a'), 'delivery', 'Centro', 100) returning id)
insert into pg_temp.fixtures select 'method_a', id from m;
with m as (insert into public.shipping_methods (store_id, zone_id, type, name, price)
  values (tests.fx('store_a'), tests.fx('zone_a2'), 'delivery', 'Norte', 100) returning id)
insert into pg_temp.fixtures select 'method_a2', id from m;
select public.set_zone_warehouses(tests.fx('store_a'), tests.fx('zone_a2'), array[tests.fx('wh_a2')]);

create function pg_temp.buy(p_key text, p_method text, p_zone text, p_qty int) returns uuid
language sql as $$
  select (public.checkout_create_order(tests.fx('store_a'), jsonb_build_object(
    'idempotency_key', p_key, 'currency', 'CUP',
    'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx('var_a'), 'quantity', p_qty)),
    'customer', jsonb_build_object('name', 'Ana', 'phone', '+5353123456'),
    'shipping', jsonb_build_object('method_id', tests.fx(p_method), 'zone_id', tests.fx(p_zone), 'address', 'Calle 1')))
    ->> 'order_id')::uuid;
$$;

select tests.eq('stock: with the module both warehouses count',
  (select stock_available from public.product_variants where id = tests.fx('var_a')), 7);
insert into pg_temp.fixtures values ('ord_north', pg_temp.buy('key-pro-north', 'method_a2', 'zone_a2', 3));
select tests.eq('zone Norte reserves from its warehouse',
  (select string_agg(w.name || ':' || r.quantity, ' ') from public.inventory_reservations r
   join public.warehouses w on w.id = r.warehouse_id where r.order_id = tests.fx('ord_north')), 'Norte:3');
select tests.eq('the order keeps the warehouse that serves it',
  (select warehouse_id from public.orders where id = tests.fx('ord_north')), tests.fx('wh_a2'));
-- Centro has no warehouses of its own after this: default first, then the others (the order may split).
select public.set_zone_warehouses(tests.fx('store_a'), tests.fx('zone_a'), '{}');
insert into pg_temp.fixtures values ('ord_center', pg_temp.buy('key-pro-center', 'method_a', 'zone_a', 4));
select tests.eq('a zone without warehouses takes the default one first, then the rest', (
  select string_agg(w.name || ':' || r.quantity, ' ' order by w.is_default desc) from public.inventory_reservations r
  join public.warehouses w on w.id = r.warehouse_id where r.order_id = tests.fx('ord_center')), 'Principal:2 Norte:2');
select tests.check('a zone cannot use a warehouse of another store', tests.throws(format(
  $$select public.set_zone_warehouses(%L, %L, array[%L]::uuid[])$$,
  tests.fx('store_a'), tests.fx('zone_a2'), tests.fx('wh_b'))));

select tests.check('transfer: reserved units do not move', tests.throws(format(
  $$select public.transfer_stock(%L, %L, %L, '[{"variant_id": "%s", "quantity": 1}]', null, null)$$,
  tests.fx('store_a'), tests.fx('wh_a2'), tests.fx('wh_a'), tests.fx('var_a'))));
select public.set_stock_quantity(tests.fx('store_a'), tests.fx('var_a'), tests.fx('wh_a2'), 8, 'adjustment', null, null);
insert into pg_temp.fixtures select 'transfer_a', (public.transfer_stock(tests.fx('store_a'), tests.fx('wh_a2'),
  tests.fx('wh_a'), jsonb_build_array(jsonb_build_object('variant_id', tests.fx('var_a'), 'quantity', 3)), 'Reponer', null)
  ->> 'transfer_id')::uuid;
select tests.eq('transfer: two movements with the same id', (
  select string_agg(type::text || ':' || quantity, ' ' order by quantity) from public.stock_movements
  where transfer_id = tests.fx('transfer_a')), 'transfer_out:-3 transfer_in:3');
select tests.eq('transfer: stock moved (default 5/2, Norte 5/5)', (
  select string_agg(s.quantity || '/' || s.quantity_allocated, ' ' order by w.is_default desc) from public.stocks s
  join public.warehouses w on w.id = s.warehouse_id where s.variant_id = tests.fx('var_a')), '5/2 5/5');
select tests.check('transfer: not to the same warehouse', tests.throws(format(
  $$select public.transfer_stock(%L, %L, %L, '[{"variant_id": "%s", "quantity": 1}]', null, null)$$,
  tests.fx('store_a'), tests.fx('wh_a'), tests.fx('wh_a'), tests.fx('var_a'))));
select tests.check('transfer: not more than the free units', tests.throws(format(
  $$select public.transfer_stock(%L, %L, %L, '[{"variant_id": "%s", "quantity": 4}]', null, null)$$,
  tests.fx('store_a'), tests.fx('wh_a'), tests.fx('wh_a2'), tests.fx('var_a'))));
select tests.check('transfer: not to a warehouse of another store', tests.throws(format(
  $$select public.transfer_stock(%L, %L, %L, '[{"variant_id": "%s", "quantity": 1}]', null, null)$$,
  tests.fx('store_a'), tests.fx('wh_a'), tests.fx('wh_b'), tests.fx('var_a'))));

-- Down to Base: only the default warehouse sells (D13); nothing is deleted.
select public.change_plan(tests.fx('store_a'), 'base', 'month', tests.fx('owner_a'));
select tests.eq('module off: available counts only the default warehouse',
  (select stock_available from public.product_variants where id = tests.fx('var_a')), 3);
insert into pg_temp.fixtures values ('ord_base', pg_temp.buy('key-pro-base', 'method_a2', 'zone_a2', 1));
select tests.eq('module off: the zone of Norte reserves from the default warehouse',
  (select string_agg(w.name || ':' || r.quantity, ' ') from public.inventory_reservations r
   join public.warehouses w on w.id = r.warehouse_id where r.order_id = tests.fx('ord_base')), 'Principal:1');
select tests.check('module off: no transfers nor zone changes',
  tests.throws(format($$select public.transfer_stock(%L, %L, %L, '[{"variant_id": "%s", "quantity": 1}]', null, null)$$,
    tests.fx('store_a'), tests.fx('wh_a'), tests.fx('wh_a2'), tests.fx('var_a')))
  and tests.throws(format($$select public.set_zone_warehouses(%L, %L, '{}')$$, tests.fx('store_a'), tests.fx('zone_a2'))));
select tests.eq('module off: the zone rows are kept',
  (select count(*) from public.warehouse_shipping_zones where zone_id = tests.fx('zone_a2'))::int, 1);
select public.set_stock_quantity(tests.fx('store_a'), tests.fx('var_a'), tests.fx('wh_a2'), 6, 'adjustment', null, null);
select tests.eq('module off: stock added to Norte is not for sale',
  (select stock_available from public.product_variants where id = tests.fx('var_a')), 2);
select public.change_plan(tests.fx('store_a'), 'pro', 'month', tests.fx('owner_a'));
select tests.eq('module back: both warehouses count again (2 + 1)',
  (select stock_available from public.product_variants where id = tests.fx('var_a')), 3);

-- ---------------------------------------------------------------------------
-- Finance (phase 6.3): the reports add up to the orders. Store C, base CUP, USD at 300 until yesterday 23:00 and
-- 400 since. d0 = today in Havana; every order at 12:00 of its day.
--   o1 d0-2 CUP: 2 caps × 500, shipping 100, discount 100 → total 1000; cost 1 USD each at 300; paid 600.
--   o2 d0   USD at 400: 1 bag × 10 → total 10; cost 5 USD; paid 10, refunded 2.
--   o3 d0   CUP 500 cancelled (left out).   o4 d0 CUP 300 "to agree" (total null), cap without cost.
--   expenses: 200 CUP on d0, 1 USD on d0-1.
-- ---------------------------------------------------------------------------

select tests.create_user('owner_c');
insert into pg_temp.fixtures (key, id)
select 'store_c', (public.create_store(
  'Pro Test C', 'pro-test-c', tests.fx('owner_c'), 'CUP', 'PC', '5353333333', 'pro', 0, 'kshop.fullkod.com', null)).id;
select public.set_store_currency(tests.fx('store_c'), 'USD', 300, true, null, null);
update public.currency_rate_history set set_at = private.havana_start((now() at time zone 'America/Havana')::date - 5)
where store_id = tests.fx('store_c');
select public.set_store_currency(tests.fx('store_c'), 'USD', 400, true, null, null);
update public.currency_rate_history set set_at = private.havana_start((now() at time zone 'America/Havana')::date) - interval '1 hour'
where store_id = tests.fx('store_c') and rate = 400;
with t as (insert into public.product_types (store_id, name, slug) values (tests.fx('store_c'), 'Simple', 'simple') returning id)
insert into pg_temp.fixtures select 'type_c', id from t;
insert into pg_temp.fixtures select 'cap_c', public.save_product(tests.fx('store_c'), jsonb_build_object(
  'product_type_id', tests.fx('type_c'), 'name', 'Gorra', 'slug', 'gorra', 'status', 'published',
  'variants', jsonb_build_array(jsonb_build_object('sku', 'C-GOR', 'price', 1000, 'stock', 4,
    'cost', jsonb_build_object('price', 2, 'currency', 'USD')))), tests.fx('owner_c'));
insert into pg_temp.fixtures select 'bag_c', public.save_product(tests.fx('store_c'), jsonb_build_object(
  'product_type_id', tests.fx('type_c'), 'name', 'Bolso', 'slug', 'bolso', 'status', 'published',
  'variants', jsonb_build_array(jsonb_build_object('sku', 'C-BOL', 'price', 3000, 'stock', 2))), tests.fx('owner_c'));

create function pg_temp.c_order(p_key text, p_days_ago int, p_currency text, p_rate numeric, p_status text,
  p_subtotal numeric, p_shipping numeric, p_discount numeric, p_paid numeric, p_product text, p_qty int,
  p_unit numeric, p_cost numeric, p_cost_rate numeric) returns void
language plpgsql as $$
declare v_order uuid; v_line uuid; v_at timestamptz;
begin
  v_at := private.havana_start((now() at time zone 'America/Havana')::date - p_days_ago) + interval '12 hours';
  insert into public.orders (store_id, number, currency, exchange_rate, status, subtotal, shipping_total,
    discount_total, total, paid_total, customer_name, customer_phone, warehouse_id, created_at, channel,
    payment_snapshot, shipping_snapshot, shipping_type)
  values (tests.fx('store_c'), (select coalesce(max(number), 0) + 1 from public.orders where store_id = tests.fx('store_c')),
    p_currency, p_rate, p_status::public.order_status, p_subtotal, p_shipping, p_discount,
    case when p_shipping is null then null else p_subtotal + p_shipping - p_discount end, p_paid, 'Cliente',
    '+5351234567', (select id from public.warehouses where store_id = tests.fx('store_c') and is_default), v_at, 'web',
    jsonb_build_object('name', case when p_currency = 'USD' then 'Zelle' else 'Efectivo' end),
    jsonb_build_object('zone', 'Centro'), 'delivery')
  returning id into v_order;
  insert into pg_temp.fixtures values (p_key, v_order);
  insert into public.order_lines (store_id, order_id, product_id, product_name, sku, quantity, unit_price, line_total)
  values (tests.fx('store_c'), v_order, tests.fx(p_product), case p_product when 'cap_c' then 'Gorra' else 'Bolso' end, 'X', p_qty, p_unit,
    p_unit * p_qty)
  returning id into v_line;
  if p_cost is not null then
    insert into public.order_line_costs (store_id, order_line_id, unit_cost, cost_currency, cost_rate_to_base)
    values (tests.fx('store_c'), v_line, p_cost, 'USD', p_cost_rate);
  end if;
end $$;

select pg_temp.c_order('o1', 2, 'CUP', 1, 'processing', 1000, 100, 100, 600, 'cap_c', 2, 500, 1, 300);
select pg_temp.c_order('o2', 0, 'USD', 400, 'processing', 10, 0, 0, 8, 'bag_c', 1, 10, 5, null);
select pg_temp.c_order('o3', 0, 'CUP', 1, 'cancelled', 500, 0, 0, 0, 'cap_c', 1, 500, 1, null);
select pg_temp.c_order('o4', 0, 'CUP', 1, 'pending_confirmation', 300, null, 0, 0, 'cap_c', 1, 300, null, null);
insert into public.payments (store_id, order_id, amount, currency, created_at) values
  (tests.fx('store_c'), tests.fx('o1'), 600, 'CUP', (select created_at from public.orders where id = tests.fx('o1'))),
  (tests.fx('store_c'), tests.fx('o2'), 10, 'USD', (select created_at from public.orders where id = tests.fx('o2')));
insert into public.refunds (store_id, order_id, amount, currency, created_at) values
  (tests.fx('store_c'), tests.fx('o2'), 2, 'USD', (select created_at from public.orders where id = tests.fx('o2')));
insert into public.expenses (store_id, spent_on, category, amount, currency) values
  (tests.fx('store_c'), (now() at time zone 'America/Havana')::date, 'Mensajería', 200, 'CUP'),
  (tests.fx('store_c'), (now() at time zone 'America/Havana')::date - 1, 'Bolsas', 1, 'USD');

create function pg_temp.d(p_days_ago int) returns date language sql as $$
  select (now() at time zone 'America/Havana')::date - p_days_ago;
$$;

select tests.eq('cost rate: the cost in the order currency took the order rate (400)',
  (select c.cost_rate_to_base from public.order_line_costs c join public.order_lines l on l.id = c.order_line_id
   where l.order_id = tests.fx('o2')), 400.000000);
select tests.eq('summary CUP: sold per currency (cancelled left out, "to agree" by subtotal)',
  (select string_agg(x ->> 'currency' || ':' || (x ->> 'orders') || ':' || (x ->> 'amount') || ':' || (x ->> 'pending'), ' ')
   from jsonb_array_elements(public.finance_summary(tests.fx('store_c'), pg_temp.d(2), pg_temp.d(0), 'CUP') -> 'sold') x),
  'CUP:2:1300.00:700.00 USD:1:10.00:2.00');
select tests.eq('summary CUP: collected per currency (payments − refunds)',
  (select string_agg(x ->> 'currency' || ':' || (x ->> 'amount'), ' ')
   from jsonb_array_elements(public.finance_summary(tests.fx('store_c'), pg_temp.d(2), pg_temp.d(0), 'CUP') -> 'collected') x),
  'CUP:600.00 USD:8.00');
select tests.eq('summary CUP: totals in CUP with the rate of each order',
  (select format('sold=%s pending=%s collected=%s expenses=%s margin=%s net=%s ticket=%s shipping=%s nocost=%s',
     t ->> 'sold', t ->> 'pending', t ->> 'collected', t ->> 'expenses', t ->> 'margin', t ->> 'net', t ->> 'avg_ticket',
     t ->> 'shipping', t ->> 'lines_without_cost')
   from (select public.finance_summary(tests.fx('store_c'), pg_temp.d(2), pg_temp.d(0), 'CUP') -> 'totals' as t) x),
  'sold=5300.00 pending=1500.00 collected=3800.00 expenses=600.00 margin=2300.00 net=1700.00 ticket=1766.67 shipping=100.00 nocost=1');
select tests.eq('summary USD: equivalent with the USD rate at each order (1000/300 + 300/400 + 10)',
  (select (public.finance_summary(tests.fx('store_c'), pg_temp.d(2), pg_temp.d(0), 'USD') -> 'totals' ->> 'sold')), '14.08');
select tests.eq('summary: the previous period of the same length',
  (select p ->> 'from' || '..' || (p ->> 'to') || ':' || (p ->> 'orders')
   from (select public.finance_summary(tests.fx('store_c'), pg_temp.d(2), pg_temp.d(0), 'CUP') -> 'previous' as p) x),
  pg_temp.d(5) || '..' || pg_temp.d(3) || ':0');
select public.set_store_currency(tests.fx('store_c'), 'USD', 500, true, null, null);
select tests.eq('a new rate today does not change the report of two days ago (1000 CUP at 300)',
  (select public.finance_summary(tests.fx('store_c'), pg_temp.d(2), pg_temp.d(2), 'USD') -> 'totals' ->> 'sold'), '3.33');
select tests.eq('daily close: every currency of each day',
  (select string_agg(format('%s|%s|%s|%s', (x ->> 'day')::date - pg_temp.d(2),
     (select string_agg((s ->> 'currency') || (s ->> 'amount'), ',') from jsonb_array_elements(x -> 'sold') s),
     (select string_agg((s ->> 'currency') || (s ->> 'amount'), ',') from jsonb_array_elements(x -> 'collected') s),
     (select string_agg((s ->> 'currency') || (s ->> 'amount'), ',') from jsonb_array_elements(x -> 'expenses') s)), ' ')
   from jsonb_array_elements(public.finance_daily(tests.fx('store_c'), pg_temp.d(2), pg_temp.d(0), 'CUP')) x),
  '0|CUP1000.00|CUP600.00| 1|||USD1.00 2|CUP300.00,USD10.00|USD8.00|CUP200.00');
select tests.eq('margin by product: Bolso 4000−2000, Gorra 1200 (900 with cost) − 600',
  (select string_agg(format('%s:%s:%s:%s:%s', r ->> 'name', r ->> 'revenue', r ->> 'cost', r ->> 'margin',
     r ->> 'lines_without_cost'), ' ')
   from jsonb_array_elements(public.finance_margin(tests.fx('store_c'), pg_temp.d(2), pg_temp.d(0), 'CUP', 'product')
     -> 'rows') r),
  'Bolso:4000.00:2000.00:2000.00:0 Gorra:1200.00:600.00:300.00:1');
select tests.eq('breakdown: by payment method',
  (select string_agg(r ->> 'name' || ':' || (r ->> 'orders') || ':' || (r ->> 'amount'), ' ')
   from jsonb_array_elements(public.finance_breakdown(tests.fx('store_c'), pg_temp.d(2), pg_temp.d(0), 'CUP')
     -> 'payment_methods') r),
  'Zelle:1:4000.00 Efectivo:2:1300.00');
select tests.eq('inventory: units, cost value (4 × 2 USD × 500) and sale value in CUP; Bolso is low',
  (select format('%s|%s|%s|%s|%s', t ->> 'units', t ->> 'cost_value', t ->> 'sale_value', t ->> 'low_stock',
     t ->> 'without_cost')
   from (select public.finance_inventory(tests.fx('store_c'), null, 'CUP', 'all', 60, null, 50, 0) -> 'totals' as t) x),
  '6|4000.00|10000.00|1|1');
select tests.eq('inventory: filter low', (select string_agg(r ->> 'sku', ',') from jsonb_array_elements(
  public.finance_inventory(tests.fx('store_c'), null, 'CUP', 'low', 60, null, 50, 0) -> 'rows') r), 'C-BOL');
select tests.check('finance: a period of more than a year is rejected', tests.throws(format(
  $$select public.finance_summary(%L, '2025-01-01', '2026-06-01', 'CUP')$$, tests.fx('store_c'))));

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.check('anon: no zones, expenses, movements, costs nor domains',
  tests.throws('select count(*) from public.warehouse_shipping_zones')
  and tests.throws('select count(*) from public.expenses')
  and tests.throws('select count(*) from public.stock_movements')
  and tests.throws('select count(*) from public.order_line_costs')
  and tests.throws('select count(*) from public.store_domains'));
select tests.check('anon: market rates are server only', tests.throws('select count(*) from private.market_rates'));
select tests.logout();

select tests.login('cust_a');
select tests.eq('customer: no zones, expenses, costs nor domains',
  (select count(*) from public.warehouse_shipping_zones)::int + (select count(*) from public.expenses)::int
  + (select count(*) from public.order_line_costs)::int + (select count(*) from public.store_domains)::int, 0);
select tests.check('customer: market rates are server only', tests.throws('select count(*) from private.market_rates'));
select tests.logout();

select tests.login('owner_a');
select tests.eq('owner A: its zones, expenses, costs and custom domain',
  (select count(*) from public.warehouse_shipping_zones)::text || (select count(*) from public.expenses)
  || (select count(*) from public.order_line_costs) || (select count(*) from public.store_domains where type = 'custom'),
  '1121');
select tests.eq('owner A: cannot write zones', tests.affected(format(
  $$delete from public.warehouse_shipping_zones where store_id = %L$$, tests.fx('store_a'))), -1);
select tests.eq('owner A: cannot write expenses directly', tests.affected(format(
  $$insert into public.expenses (store_id, spent_on, category, amount, currency) values (%L, current_date, 'x', 1, 'CUP')$$,
  tests.fx('store_a'))), -1);
select tests.check('owner A: finance reports only through the server',
  tests.throws(format($$select public.finance_summary(%L, current_date, current_date, 'CUP')$$, tests.fx('store_a')))
  and tests.throws(format($$select public.finance_inventory(%L, null, 'CUP', 'all', 60, null, 50, 0)$$, tests.fx('store_a'))));
select tests.eq('owner A: cannot verify its own domain', tests.affected(format(
  $$update public.store_domains set verified_at = now(), status = 'verified' where store_id = %L$$,
  tests.fx('store_a'))), -1);
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff A: zones yes; expenses and costs no',
  (select count(*) from public.warehouse_shipping_zones)::text || (select count(*) from public.expenses)
  || (select count(*) from public.order_line_costs), '100');
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B: nothing of A',
  (select count(*) from public.warehouse_shipping_zones where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.expenses where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.order_line_costs where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.store_domains where store_id = tests.fx('store_a'))::int, 0);
select tests.logout();

select tests.login('root');
select tests.eq('superadmin: expenses and custom domains of every store',
  (select count(*) from public.expenses where store_id in (tests.fx('store_a'), tests.fx('store_b')))::text
  || (select count(*) from public.store_domains where type = 'custom' and store_id = tests.fx('store_a')), '21');
select tests.logout();
