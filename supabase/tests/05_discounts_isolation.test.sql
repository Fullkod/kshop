-- Phase 4: promotions, vouchers and order discounts isolated between stores A and B. Voucher codes are never
-- readable by anon or customers (not even of their store); the storefront only sees the materialized
-- promotion price of public stores; a customer sees the discounts of its own orders only.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Disc Test A', 'disc-test-a', tests.fx('owner_a'), 'CUP', 'DA', '5351111111', 'base', 30, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Disc Test B', 'disc-test-b', tests.fx('owner_b'), 'USD', 'DB', '5352222222', 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');

select tests.create_user('cust_a', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_a')));
with x as (
  insert into public.customers (store_id, user_id, phone, first_name)
  values (tests.fx('store_a'), tests.fx('cust_a'), '+5353000001', 'Ana') returning id
) insert into pg_temp.fixtures select 'c_a', id from x;

create function pg_temp.seed(p_prefix text, p_store text, p_owner text) returns void
language plpgsql as $$
declare
  v_type uuid; v_product uuid; v_promo uuid; v_voucher uuid; v_order uuid;
begin
  insert into public.product_types (store_id, name, slug) values (tests.fx(p_store), 'Simple', 'simple')
    returning id into v_type;
  v_product := public.save_product(tests.fx(p_store), jsonb_build_object(
    'product_type_id', v_type, 'name', 'Bolso ' || p_prefix, 'slug', 'bolso-' || rtrim(p_prefix, '_'), 'status', 'published',
    'variants', jsonb_build_array(jsonb_build_object('sku', upper(p_prefix) || 'BOLSO', 'price', 1000, 'stock', 5))),
    tests.fx(p_owner));
  insert into pg_temp.fixtures values (p_prefix || 'product', v_product);
  insert into pg_temp.fixtures select p_prefix || 'variant', id from public.product_variants where product_id = v_product;

  insert into public.promotions (store_id, name, reward, value) values (tests.fx(p_store), 'Rebajas', 'percent', 20)
    returning id into v_promo;
  insert into pg_temp.fixtures values (p_prefix || 'promo', v_promo);
  insert into public.promotion_targets (store_id, promotion_id, target_type, target_id)
  values (tests.fx(p_store), v_promo, 'product', v_product);
  insert into public.variant_promotions (variant_id, store_id, product_id, promotion_id, promotion_name, reward, value, promo_price)
  values (tests.fx(p_prefix || 'variant'), tests.fx(p_store), v_product, v_promo, 'Rebajas', 'percent', 20, 800);

  insert into public.vouchers (store_id, code, name, reward, value) values (tests.fx(p_store), 'SECRETO10', 'Diez', 'percent', 10)
    returning id into v_voucher;
  insert into pg_temp.fixtures values (p_prefix || 'voucher', v_voucher);
  insert into public.voucher_targets (store_id, voucher_id, target_type, target_id)
  values (tests.fx(p_store), v_voucher, 'product', v_product);
end $$;

select pg_temp.seed('da_', 'store_a', 'owner_a');
select pg_temp.seed('db_', 'store_b', 'owner_b');

-- One order of the customer of A and one guest order of A, each with a voucher discount.
create function pg_temp.add_order(p_key text, p_customer uuid, p_number int) returns void
language plpgsql as $$
declare
  v_order uuid;
begin
  insert into public.orders (store_id, number, customer_id, currency, subtotal, shipping_total, discount_total, total,
    customer_name, customer_phone, warehouse_id, voucher_code)
  values (tests.fx('store_a'), p_number, p_customer, 'CUP', 1000, 0, 100, 900, p_key, '+5353000001',
    (select id from public.warehouses where store_id = tests.fx('store_a') and is_default), 'SECRETO10')
  returning id into v_order;
  insert into pg_temp.fixtures values (p_key, v_order);
  insert into public.order_discounts (store_id, order_id, kind, source_id, code, name, reward, value, amount, currency)
  values (tests.fx('store_a'), v_order, 'voucher', tests.fx('da_voucher'), 'SECRETO10', 'Diez', 'percent', 10, 100, 'CUP');
  insert into public.voucher_usages (store_id, voucher_id, order_id, customer_id, phone, amount, currency)
  values (tests.fx('store_a'), tests.fx('da_voucher'), v_order, p_customer, '+5353000001', 100, 'CUP');
end $$;

select pg_temp.add_order('o_mine', tests.fx('c_a'), 1001);
select pg_temp.add_order('o_guest', null, 1002);

-- ---------------------------------------------------------------------------
-- Schema rules
-- ---------------------------------------------------------------------------

select tests.check('voucher code must be uppercase', tests.throws(format(
  $$insert into public.vouchers (store_id, code, name, reward, value) values (%L, 'minus', 'x', 'percent', 5)$$,
  tests.fx('store_a'))));
select tests.check('voucher code is unique per store', tests.throws(format(
  $$insert into public.vouchers (store_id, code, name, reward, value) values (%L, 'SECRETO10', 'x', 'percent', 5)$$,
  tests.fx('store_a'))));
select tests.check('percent above 100 is rejected', tests.throws(format(
  $$insert into public.promotions (store_id, name, reward, value) values (%L, 'x', 'percent', 120)$$, tests.fx('store_a'))));
select tests.check('promotion cannot end before it starts', tests.throws(format(
  $$insert into public.promotions (store_id, name, reward, value, starts_at, ends_at)
    values (%L, 'x', 'fixed', 5, now(), now() - interval '1 day')$$, tests.fx('store_a'))));
select tests.check('promotion target of another store is rejected', tests.throws(format(
  $$insert into public.promotion_targets (store_id, promotion_id, target_type, target_id) values (%L, %L, 'product', %L)$$,
  tests.fx('store_a'), tests.fx('db_promo'), tests.fx('da_product'))));
select tests.check('one voucher per order', tests.throws(format(
  $$insert into public.voucher_usages (store_id, voucher_id, order_id, phone, currency) values (%L, %L, %L, '+5353000001', 'CUP')$$,
  tests.fx('store_a'), tests.fx('da_voucher'), tests.fx('o_mine'))));

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.check('anon: cannot read vouchers', tests.throws('select count(*) from public.vouchers'));
select tests.check('anon: cannot read promotions', tests.throws('select count(*) from public.promotions'));
select tests.check('anon: cannot read voucher usages', tests.throws('select count(*) from public.voucher_usages'));
select tests.check('anon: cannot read order discounts', tests.throws('select count(*) from public.order_discounts'));
select tests.eq('anon: reads the promotion price of public stores',
  (select count(*) from public.variant_promotions where store_id in (tests.fx('store_a'), tests.fx('store_b')))::int, 2);
select tests.eq('anon: cannot write promotion prices', tests.affected(format(
  $$update public.variant_promotions set promo_price = 1 where store_id = %L$$, tests.fx('store_a'))), -1);
select tests.logout();

-- ---------------------------------------------------------------------------
-- customer of A
-- ---------------------------------------------------------------------------

select tests.login('cust_a');
select tests.eq('customer A: no voucher of its own store',
  (select count(*) from public.vouchers)::int + (select count(*) from public.voucher_targets)::int, 0);
select tests.eq('customer A: no promotion rows', (select count(*) from public.promotions)::int, 0);
select tests.eq('customer A: no voucher usages', (select count(*) from public.voucher_usages)::int, 0);
select tests.eq('customer A: discounts of its own order only',
  (select string_agg(order_id::text, ',') from public.order_discounts), tests.fx('o_mine')::text);
select tests.logout();

-- ---------------------------------------------------------------------------
-- staff of A and owner of B
-- ---------------------------------------------------------------------------

select tests.login('staff_a');
select tests.eq('staff A: reads A promotions, targets and vouchers',
  (select count(*) from public.promotions)::int + (select count(*) from public.promotion_targets)::int
  + (select count(*) from public.vouchers)::int + (select count(*) from public.voucher_targets)::int, 4);
select tests.eq('staff A: reads both A voucher usages and order discounts',
  (select count(*) from public.voucher_usages)::int + (select count(*) from public.order_discounts)::int, 4);
select tests.eq('staff A: sees nothing of B', (select count(*) from public.vouchers where store_id = tests.fx('store_b'))::int
  + (select count(*) from public.promotions where store_id = tests.fx('store_b'))::int, 0);
select tests.eq('staff A: cannot create vouchers directly', tests.affected(format(
  $$insert into public.vouchers (store_id, code, name, reward, value) values (%L, 'HACK', 'x', 'percent', 90)$$,
  tests.fx('store_a'))), -1);
select tests.eq('staff A: cannot change used_count directly', tests.affected(format(
  $$update public.vouchers set used_count = 0 where id = %L$$, tests.fx('da_voucher'))), -1);
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B: sees no promotion, voucher, usage or order discount of A',
  (select count(*) from public.promotions where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.vouchers where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.voucher_usages where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.order_discounts where store_id = tests.fx('store_a'))::int, 0);
select tests.eq('owner B: reads its own voucher', (select code from public.vouchers), 'SECRETO10');
select tests.logout();
