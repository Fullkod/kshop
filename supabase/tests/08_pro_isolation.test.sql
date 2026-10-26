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
