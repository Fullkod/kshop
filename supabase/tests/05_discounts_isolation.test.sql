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
-- Coupons are not in Base since phase 5: A buys the vouchers add-on.
select public.set_store_addon(tests.fx('store_a'), 'vouchers', true, null);

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

-- ---------------------------------------------------------------------------
-- Pricing engine (as the database owner = what the API does with service_role)
-- ---------------------------------------------------------------------------

-- Checkout options of A: delivery 200 and "to agree".
with z as (insert into public.shipping_zones (store_id, name) values (tests.fx('store_a'), 'Centro') returning id)
insert into pg_temp.fixtures select 'a_zone', id from z;
with m as (
  insert into public.shipping_methods (store_id, zone_id, type, name, price)
  values (tests.fx('store_a'), tests.fx('a_zone'), 'delivery', 'Mensajería', 200) returning id
) insert into pg_temp.fixtures select 'm_delivery', id from m;
with m as (
  insert into public.shipping_methods (store_id, zone_id, type, name)
  values (tests.fx('store_a'), tests.fx('a_zone'), 'to_agree', 'A convenir') returning id
) insert into pg_temp.fixtures select 'm_agree', id from m;
insert into public.store_order_counters (store_id, last_number) values (tests.fx('store_a'), 1002);

create function pg_temp.checkout(p_key text, p_quantity int, p_extra jsonb default '{}', p_method text default 'm_delivery')
returns jsonb language sql as $$
  select public.checkout_create_order(tests.fx('store_a'), jsonb_build_object(
    'idempotency_key', p_key, 'currency', 'CUP',
    'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx('da_variant'), 'quantity', p_quantity)),
    'customer', jsonb_build_object('name', 'Invitada', 'phone', '+5353123456'),
    'shipping', jsonb_build_object('method_id', tests.fx(p_method), 'zone_id', tests.fx('a_zone'), 'address', 'Calle 5'))
    || p_extra);
$$;

create function pg_temp.price(p_quantity int, p_extra jsonb default '{}') returns jsonb language sql as $$
  select public.price_lines(tests.fx('store_a'), jsonb_build_object('currency', 'CUP',
    'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx('da_variant'), 'quantity', p_quantity))) || p_extra);
$$;

select private.refresh_store_promotions(tests.fx('store_a'));
select tests.eq('promotions: 20 % materialized for the storefront',
  (select format('%s %s', promo_price, promotion_name) from public.variant_promotions where variant_id = tests.fx('da_variant')),
  '800.00 Rebajas');
select tests.eq('promotions: product summary uses the effective price and is on sale',
  (select format('%s %s', min_price, on_sale) from public.products where id = tests.fx('da_product')), '800.00 t');

insert into public.promotions (store_id, name, reward, value) values (tests.fx('store_a'), 'Fija', 'fixed', 300);
insert into public.promotion_targets (store_id, promotion_id, target_type, target_id)
select tests.fx('store_a'), id, 'variant', tests.fx('da_variant') from public.promotions where name = 'Fija';
insert into public.promotions (store_id, name, reward, value, starts_at, ends_at)
values (tests.fx('store_a'), 'Pasada', 'percent', 90, now() - interval '2 days', now() - interval '1 day');
insert into public.promotion_targets (store_id, promotion_id, target_type, target_id)
select tests.fx('store_a'), id, 'product', tests.fx('da_product') from public.promotions where name = 'Pasada';
select private.refresh_store_promotions(tests.fx('store_a'));
select tests.eq('promotions: the lowest price wins, an ended one never applies',
  (select format('%s %s', promo_price, promotion_name) from public.variant_promotions where variant_id = tests.fx('da_variant')),
  '700.00 Fija');

select tests.eq('price_lines: subtotal, list subtotal and savings',
  (select format('%s %s %s', p ->> 'subtotal', p ->> 'list_subtotal', p ->> 'promotion_savings') from pg_temp.price(2) p),
  '1400.00 2000.00 600.00');
select tests.eq('price_lines: line keeps list price and promotion',
  (select format('%s %s %s', l ->> 'list_price', l ->> 'unit_price', l -> 'promotion' ->> 'name')
   from pg_temp.price(2) p, jsonb_array_elements(p -> 'lines') l), '1000.00 700.00 Fija');
select tests.eq('price_lines: a specific voucher on the product (10 % of 1400)',
  (pg_temp.price(2, '{"voucher_code": "secreto10"}') ->> 'discount_total')::numeric, 140.00);
select tests.eq('price_lines: unknown voucher has a reason and no discount',
  (select format('%s|%s', p -> 'voucher' ->> 'error', p ->> 'discount_total') from pg_temp.price(1, '{"voucher_code": "NOEXISTE"}') p),
  'Este cupón no existe o ya no está activo|0');
insert into public.vouchers (store_id, code, name, reward, value, min_subtotal)
values (tests.fx('store_a'), 'MIN5000', 'Mínimo', 'percent', 10, 5000);
select tests.check('price_lines: minimum subtotal not reached',
  (pg_temp.price(1, '{"voucher_code": "MIN5000"}') -> 'voucher' ->> 'error') like 'El pedido mínimo para este cupón es 5%CUP');

-- Checkout with the voucher: snapshot per line and per order, use counted.
insert into pg_temp.fixtures select 'o_v1', (pg_temp.checkout('key-disc-0001', 2, '{"voucher_code": "Secreto10"}') ->> 'order_id')::uuid;
select tests.eq('checkout: subtotal - voucher + shipping = total',
  (select format('%s-%s+%s=%s %s', subtotal, discount_total, shipping_total, total, voucher_code) from public.orders where id = tests.fx('o_v1')),
  '1400.00-140.00+200.00=1460.00 SECRETO10');
select tests.eq('checkout: line snapshot (list, unit, saving, promotion)',
  (select format('%s %s %s %s', unit_list_price, unit_price, discount_amount, promotion_name) from public.order_lines where order_id = tests.fx('o_v1')),
  '1000.00 700.00 600.00 Fija');
select tests.eq('checkout: order discounts breakdown',
  (select string_agg(format('%s:%s', kind, amount), ' ' order by kind) from public.order_discounts where order_id = tests.fx('o_v1')),
  'promotion:600.00 voucher:140.00');
select tests.eq('checkout: voucher use counted', (select used_count from public.vouchers where id = tests.fx('da_voucher')), 1);

-- Usage limits.
insert into public.vouchers (store_id, code, name, reward, value, usage_limit) values (tests.fx('store_a'), 'UNA', 'Una vez', 'fixed', 50, 1);
insert into pg_temp.fixtures select 'o_una', (pg_temp.checkout('key-disc-0002', 1, '{"voucher_code": "UNA"}') ->> 'order_id')::uuid;
select tests.check('checkout: a voucher with no uses left is rejected',
  tests.throws($$select pg_temp.checkout('key-disc-0003', 1, '{"voucher_code": "UNA"}')$$));
select tests.eq('price_lines: no uses left', pg_temp.price(1, '{"voucher_code": "UNA"}') -> 'voucher' ->> 'error',
  'Este cupón ya no está disponible');
select public.order_cancel(tests.fx('store_a'), tests.fx('o_una'), 'x', null);
select tests.eq('cancel: releases the voucher use',
  (select format('%s %s', v.used_count, u.released_at is not null) from public.vouchers v join public.voucher_usages u on u.voucher_id = v.id
   where v.code = 'UNA'), '0 t');
insert into public.vouchers (store_id, code, name, reward, value, usage_per_customer)
values (tests.fx('store_a'), 'PORCLIENTE', 'Por cliente', 'percent', 5, 1);
insert into pg_temp.fixtures select 'o_pc', (pg_temp.checkout('key-disc-0004', 1, '{"voucher_code": "PORCLIENTE"}') ->> 'order_id')::uuid;
select tests.eq('price_lines: the same phone already used it',
  pg_temp.price(1, '{"voucher_code": "PORCLIENTE", "phone": "+5353123456"}') -> 'voucher' ->> 'error', 'Ya usaste este cupón');
select public.order_cancel(tests.fx('store_a'), tests.fx('o_pc'), 'x', null);

-- Shipping voucher with "to agree": no amount until the staff sets the shipping cost.
insert into public.vouchers (store_id, code, name, scope, reward, value)
values (tests.fx('store_a'), 'ENVIOGRATIS', 'Envío gratis', 'shipping', 'percent', 100);
insert into pg_temp.fixtures select 'o_ship', (pg_temp.checkout('key-disc-0005', 1, '{"voucher_code": "ENVIOGRATIS"}', 'm_agree') ->> 'order_id')::uuid;
select tests.eq('shipping voucher: pending while the shipping is to agree',
  (select format('%s %s', discount_total, coalesce(total::text, 'null')) from public.orders where id = tests.fx('o_ship')), '0.00 null');
select public.order_set_shipping(tests.fx('store_a'), tests.fx('o_ship'), 300, null);
select tests.eq('shipping voucher: applied when the shipping is set',
  (select format('%s %s %s', shipping_total, discount_total, total) from public.orders where id = tests.fx('o_ship')), '300.00 300.00 700.00');
select public.order_cancel(tests.fx('store_a'), tests.fx('o_ship'), 'x', null);

-- Manual discount: admin orders only.
select tests.check('manual discount: rejected outside the admin',
  tests.throws($$select pg_temp.checkout('key-disc-0006', 1, '{"manual_discount": {"reward": "fixed", "value": 100}}')$$));
insert into pg_temp.fixtures select 'o_manual', (pg_temp.checkout('key-disc-0007', 1,
  '{"channel": "admin", "manual_discount": {"reward": "percent", "value": 10, "reason": "Cliente habitual"}}') ->> 'order_id')::uuid;
select tests.eq('manual discount: 10 % of 700 with its reason',
  (select format('%s %s', amount, reason) from public.order_discounts where order_id = tests.fx('o_manual') and kind = 'manual'),
  '70.00 Cliente habitual');
select tests.eq('manual discount: in the order total',
  (select format('%s %s', discount_total, total) from public.orders where id = tests.fx('o_manual')), '70.00 830.00');

-- Module off: nothing applies, the data stays.
update public.store_modules set enabled = false where store_id = tests.fx('store_a') and module_code in ('discounts', 'vouchers');
select tests.eq('module off: list price, voucher rejected',
  (select format('%s|%s', p ->> 'subtotal', p -> 'voucher' ->> 'error') from pg_temp.price(1, '{"voucher_code": "SECRETO10"}') p),
  '1000.00|Este cupón no existe o ya no está activo');
select private.refresh_store_promotions(tests.fx('store_a'));
select tests.eq('module off: no materialized promotion, promotions kept',
  (select count(*) from public.variant_promotions where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.promotions where store_id = tests.fx('store_a'))::int, 3);
update public.store_modules set enabled = true where store_id = tests.fx('store_a') and module_code in ('discounts', 'vouchers');

select tests.login('owner_a');
select tests.check('owner A: cannot call price_lines directly', tests.throws(format(
  $$select public.price_lines(%L, '{}'::jsonb)$$, tests.fx('store_a'))));
select tests.check('owner A: cannot refresh promotions directly', tests.throws(format(
  $$select public.refresh_promotions(%L)$$, tests.fx('store_a'))));
select tests.logout();
