-- Phase 5: subscriptions, grants and platform invoices. Owner/admin of a store read its billing, staff only the
-- subscription state, other stores, customers and anon nothing; nobody but service_role writes.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('admin_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');
select tests.create_user('root', '{"role": "superadmin"}');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Billing Test A', 'billing-test-a', tests.fx('owner_a'), 'CUP', 'BA', '5351111111', 'base', 30, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Billing Test B', 'billing-test-b', tests.fx('owner_b'), 'CUP', 'BB', '5352222222', 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values
  (tests.fx('store_a'), tests.fx('admin_a'), 'admin'),
  (tests.fx('store_a'), tests.fx('staff_a'), 'staff');
select tests.create_user('cust_a', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_a')));

create function pg_temp.invoice(p_store text, p_number text) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  insert into public.platform_invoices (store_id, number, period_start, period_end, subtotal, discount, total, due_at)
  values (tests.fx(p_store), p_number, now(), now() + interval '1 month', 5, 0, 5, now() + interval '7 days')
  returning id into v_id;
  insert into public.platform_invoice_lines (store_id, invoice_id, kind, description, unit_amount, amount)
  values (tests.fx(p_store), v_id, 'plan', 'Plan Base', 5, 5);
  insert into public.platform_payments (store_id, invoice_id, amount, notes)
  values (tests.fx(p_store), v_id, 5, 'Efectivo en mano');
  return v_id;
end $$;

insert into pg_temp.fixtures values ('inv_a', pg_temp.invoice('store_a', 'KS-2099-0001'));
insert into pg_temp.fixtures values ('inv_b', pg_temp.invoice('store_b', 'KS-2099-0002'));
insert into public.subscription_grants (store_id, type, value, reason, granted_by)
values (tests.fx('store_a'), 'discount_percent', 50, 'Socio fundador', tests.fx('root')),
       (tests.fx('store_b'), 'free_days', 30, 'Regalo', tests.fx('root'));
update public.subscriptions set price_override = 3, notes = 'Precio especial' where store_id = tests.fx('store_a');
insert into public.notification_log (store_id, audience, event, recipient, message, status, dedupe_key)
values (tests.fx('store_a'), 'store', 'billing_invoice_issued', '+5351111111', 'Factura de 5 USD', 'simulated',
  'test:billing:a');

-- ---------------------------------------------------------------------------
-- Schema rules
-- ---------------------------------------------------------------------------

select tests.check('one open invoice per store and period', tests.throws(format(
  $$insert into public.platform_invoices (store_id, number, period_start, period_end, subtotal, total, due_at)
    select store_id, 'KS-2099-0003', period_start, period_end, 5, 5, due_at from public.platform_invoices where id = %L$$,
  tests.fx('inv_a'))));
select tests.check('total = subtotal - discount', tests.throws(format(
  $$insert into public.platform_invoices (store_id, number, period_start, period_end, subtotal, discount, total, due_at)
    values (%L, 'KS-2099-0004', now() + interval '2 months', now() + interval '3 months', 5, 1, 5, now())$$,
  tests.fx('store_a'))));
select tests.check('invoices and payments only in USD', tests.throws(format(
  $$insert into public.platform_payments (store_id, invoice_id, amount, currency) values (%L, %L, 1, 'CUP')$$,
  tests.fx('store_a'), tests.fx('inv_a'))));
select tests.check('a line cannot point to an invoice of another store', tests.throws(format(
  $$insert into public.platform_invoice_lines (store_id, invoice_id, kind, description, unit_amount, amount)
    values (%L, %L, 'adjustment', 'x', 1, 1)$$, tests.fx('store_a'), tests.fx('inv_b'))));
select tests.check('discount grants are 1-100 %', tests.throws(format(
  $$insert into public.subscription_grants (store_id, type, value) values (%L, 'discount_percent', 150)$$,
  tests.fx('store_a'))));
select tests.check('billing notices are deduplicated by key', tests.throws(format(
  $$insert into public.notification_log (store_id, audience, event, recipient, message, status, dedupe_key)
    values (%L, 'store', 'billing_invoice_issued', '+5351111111', 'x', 'simulated', 'test:billing:a')$$,
  tests.fx('store_a'))));
select tests.eq('catalog: Base 5 USD, Pro 12 USD; vouchers only in Pro',
  (select string_agg(format('%s:%s:%s', p.code, p.price, p.currency), ' ' order by p.sort_order) from public.plans p
   where p.code in ('base', 'pro'))
  || ' ' || (select string_agg(p.code, ',') from public.plan_modules pm join public.plans p on p.id = pm.plan_id
   where pm.module_code = 'vouchers'),
  'base:5.00:USD pro:12.00:USD pro');

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.check('anon: no subscriptions, grants, invoices, lines or payments',
  tests.throws('select count(*) from public.subscriptions')
  and tests.throws('select count(*) from public.subscription_grants')
  and tests.throws('select count(*) from public.platform_invoices')
  and tests.throws('select count(*) from public.platform_invoice_lines')
  and tests.throws('select count(*) from public.platform_payments'));
select tests.logout();

select tests.login('cust_a');
select tests.eq('customer: nothing of the billing',
  (select count(*) from public.subscriptions)::int + (select count(*) from public.subscription_grants)::int
  + (select count(*) from public.platform_invoices)::int + (select count(*) from public.platform_invoice_lines)::int
  + (select count(*) from public.platform_payments)::int, 0);
select tests.logout();

select tests.login('owner_a');
select tests.eq('owner A: its invoice, line, payment and grant only',
  (select count(*) from public.platform_invoices)::text || (select count(*) from public.platform_invoice_lines)
  || (select count(*) from public.platform_payments) || (select count(*) from public.subscription_grants), '1111');
select tests.eq('owner A: subscription state and dates', (select status::text || ' ' || currency
  from public.subscriptions where store_id = tests.fx('store_a')), 'trialing USD');
select tests.check('owner A: price override and notes stay with the server',
  tests.throws('select price_override from public.subscriptions')
  and tests.throws('select notes from public.subscriptions')
  and tests.throws('select limit_overrides from public.subscriptions'));
select tests.check('owner A: who recorded the payment or gave the grant is not exposed',
  tests.throws('select recorded_by from public.platform_payments')
  and tests.throws('select notes from public.platform_payments')
  and tests.throws('select granted_by from public.subscription_grants'));
select tests.eq('owner A: sees the billing notices of its store',
  (select count(*) from public.notification_log where event like 'billing\_%')::int, 1);
select tests.eq('owner A: cannot write invoices, payments or grants', tests.affected(format(
  $$update public.platform_invoices set status = 'paid' where id = %L$$, tests.fx('inv_a'))), -1);
select tests.eq('owner A: cannot insert payments', tests.affected(format(
  $$insert into public.platform_payments (store_id, invoice_id, amount) values (%L, %L, 5)$$,
  tests.fx('store_a'), tests.fx('inv_a'))), -1);
select tests.eq('owner A: cannot give itself grants', tests.affected(format(
  $$insert into public.subscription_grants (store_id, type, value) values (%L, 'free_days', 365)$$,
  tests.fx('store_a'))), -1);
select tests.logout();

select tests.login('admin_a');
select tests.eq('admin A: reads the invoices of A', (select count(*) from public.platform_invoices)::int, 1);
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff A: subscription state (for the banners)',
  (select status::text from public.subscriptions where store_id = tests.fx('store_a')), 'trialing');
select tests.eq('staff A: no invoices, lines, payments, grants nor billing notices',
  (select count(*) from public.platform_invoices)::int + (select count(*) from public.platform_invoice_lines)::int
  + (select count(*) from public.platform_payments)::int + (select count(*) from public.subscription_grants)::int
  + (select count(*) from public.notification_log where event like 'billing\_%')::int, 0);
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B: nothing of A',
  (select count(*) from public.platform_invoices where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.platform_invoice_lines where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.platform_payments where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.subscription_grants where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.subscriptions where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.notification_log where store_id = tests.fx('store_a'))::int, 0);
select tests.eq('owner B: its own invoice', (select count(*) from public.platform_invoices)::int, 1);
select tests.logout();

select tests.login('root');
select tests.eq('superadmin: reads the invoices of every test store', (select count(*) from public.platform_invoices
  where store_id in (tests.fx('store_a'), tests.fx('store_b')))::int, 2);
select tests.eq('superadmin: still cannot write directly', tests.affected(format(
  $$update public.platform_invoices set status = 'paid' where id = %L$$, tests.fx('inv_a'))), -1);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Modules, limits and team (phase 5.2), as the database owner
-- ---------------------------------------------------------------------------

create function pg_temp.modules(p_store text) returns text language sql as $$
  select coalesce(string_agg(module_code, ',' order by module_code), '')
  from public.store_entitlements(tests.fx(p_store));
$$;

-- B (Pro) with Pro data: a second warehouse, a second sale currency, notice contacts and 3 products.
insert into public.warehouses (store_id, name) values (tests.fx('store_b'), 'Almacén 2');
insert into public.store_currencies (store_id, currency, is_base, sells, rate_to_base)
values (tests.fx('store_b'), 'USD', false, true, 400);
insert into public.store_notification_contacts (store_id, name, phone) values (tests.fx('store_b'), 'Dueño B', '+5355550002');
with x as (
  insert into public.product_types (store_id, name, slug) values (tests.fx('store_b'), 'Simple', 'simple') returning id
) insert into pg_temp.fixtures select 'type_b', id from x;
create function pg_temp.product(p_n int) returns uuid language sql as $$
  select public.save_product(tests.fx('store_b'), jsonb_build_object(
    'product_type_id', tests.fx('type_b'), 'name', 'Producto ' || p_n, 'slug', 'producto-' || p_n, 'status', 'published',
    'variants', jsonb_build_array(jsonb_build_object('sku', 'BP' || p_n, 'price', 100, 'stock', 5))), tests.fx('owner_b'));
$$;
select pg_temp.product(n) from generate_series(1, 3) n;
select tests.eq('Pro: every module, vouchers included', pg_temp.modules('store_b'),
  'catalog,custom_domain,discounts,excel_import,finance,mobile_app,multi_currency,multi_warehouse,orders,sales_today,shipping,themes,vouchers,whatsapp_notifications');

-- Down to Base: modules off in the database, every row and every piece of data kept.
select public.change_plan(tests.fx('store_b'), 'base', 'month', tests.fx('root'));
select tests.eq('Pro -> Base: only the Base modules',
  pg_temp.modules('store_b'), 'catalog,discounts,excel_import,mobile_app,orders,sales_today,shipping,themes');
select tests.eq('Pro -> Base: the plan rows are disabled, not deleted',
  (select count(*) from public.store_modules where store_id = tests.fx('store_b') and source = 'plan')::int, 14);
select tests.eq('Pro -> Base: warehouses, currencies, contacts and products kept',
  (select count(*) from public.warehouses where store_id = tests.fx('store_b'))::text
  || (select count(*) from public.store_currencies where store_id = tests.fx('store_b'))
  || (select count(*) from public.store_notification_contacts where store_id = tests.fx('store_b'))
  || (select count(*) from public.products where store_id = tests.fx('store_b')), '2213');
select tests.check('Base: no more warehouses', tests.throws(format(
  $$insert into public.warehouses (store_id, name) values (%L, 'Almacén 3')$$, tests.fx('store_b'))));
select tests.check('Base: no more sale currencies', tests.throws(format(
  $$insert into public.store_currencies (store_id, currency, is_base, sells, rate_to_base) values (%L, 'EUR', false, true, 450)$$,
  tests.fx('store_b'))));
select tests.eq('Base: the storefront sells only in the base currency and has no coupon field',
  public.storefront_features(tests.fx('store_b')), '{"vouchers": false, "multi_currency": false}'::jsonb);
select tests.eq('Base: the cart knows coupons are off',
  (public.price_lines(tests.fx('store_b'), '{"lines": []}') ->> 'vouchers_enabled'), 'false');
select tests.eq('Base: effective limits', public.store_limits(tests.fx('store_b')),
  '{"max_staff": 2, "max_products": 300}'::jsonb);

-- Back to Pro: everything is there again, the same.
select public.change_plan(tests.fx('store_b'), 'pro', 'year', tests.fx('root'));
select tests.eq('Base -> Pro: every module back', pg_temp.modules('store_b'),
  'catalog,custom_domain,discounts,excel_import,finance,mobile_app,multi_currency,multi_warehouse,orders,sales_today,shipping,themes,vouchers,whatsapp_notifications');
select tests.eq('Base -> Pro: yearly, Pro limits (no product limit)',
  (select billing_interval::text from public.subscriptions where store_id = tests.fx('store_b'))
  || ' ' || public.store_limits(tests.fx('store_b'))::text, 'year {"max_staff": 10}');
update public.plans set yearly_price = null where code = 'base';
select tests.check('a plan without yearly price cannot be yearly', tests.throws(format(
  $$select public.change_plan(%L, 'base', 'year', null)$$, tests.fx('store_b'))));
update public.plans set yearly_price = 50 where code = 'base';

-- Add-ons on Base: price frozen, dependencies, only sellable modules.
select public.change_plan(tests.fx('store_b'), 'base', 'month', null);
select public.set_store_addon(tests.fx('store_b'), 'multi_currency', true, tests.fx('root'));
update public.modules set addon_price = 9 where code = 'multi_currency';
select tests.eq('add-on: active, with the price it was bought at',
  (select format('%s %s %s', enabled, price, currency) from public.store_modules
   where store_id = tests.fx('store_b') and module_code = 'multi_currency' and source = 'addon'), 't 3.00 USD');
select tests.eq('add-on: the storefront sells in more currencies again',
  public.storefront_features(tests.fx('store_b')) ->> 'multi_currency', 'true');
select tests.check('add-on: a module that is not sold alone is rejected', tests.throws(format(
  $$select public.set_store_addon(%L, 'catalog', true, null)$$, tests.fx('store_b'))));
update public.store_modules set enabled = false where store_id = tests.fx('store_b') and module_code = 'orders';
select tests.check('add-on: dependencies are checked (vouchers needs orders)', tests.throws(format(
  $$select public.set_store_addon(%L, 'vouchers', true, null)$$, tests.fx('store_b'))));
update public.store_modules set enabled = true where store_id = tests.fx('store_b') and module_code = 'orders';
select public.set_store_addon(tests.fx('store_b'), 'multi_currency', false, null);
select tests.eq('add-on removed: off, row kept',
  (select format('%s %s', enabled, price) from public.store_modules
   where store_id = tests.fx('store_b') and module_code = 'multi_currency' and source = 'addon'), 'f 3.00');
update public.modules set addon_price = 3 where code = 'multi_currency';

-- Grants: free, optionally until a date.
select public.set_store_module_grant(tests.fx('store_b'), 'whatsapp_notifications', true, now() + interval '30 days',
  'Prueba de avisos', tests.fx('root'));
select tests.check('grant: the module is on', pg_temp.modules('store_b') like '%whatsapp_notifications%');
select tests.check('grant: an end date in the past is rejected', tests.throws(format(
  $$select public.set_store_module_grant(%L, 'finance', true, now() - interval '1 day', null, null)$$, tests.fx('store_b'))));
update public.store_modules set ends_at = now() - interval '1 second', starts_at = now() - interval '1 day'
where store_id = tests.fx('store_b') and module_code = 'whatsapp_notifications' and source = 'grant';
select tests.check('grant: off once it ends', pg_temp.modules('store_b') not like '%whatsapp_notifications%');

-- Limits: per-store override and usage.
update public.subscriptions set limit_overrides = '{"max_products": 2}' where store_id = tests.fx('store_b');
select tests.check('over the limit: no new products', tests.throws('select pg_temp.product(4)'));
select tests.eq('over the limit: existing products are still editable', tests.affected(format(
  $$update public.products set name = 'Producto editado' where store_id = %L and slug = 'producto-1'$$,
  tests.fx('store_b'))), 1);
select tests.eq('usage: products and team against their limits', public.store_usage(tests.fx('store_b')),
  '{"max_staff": {"used": 0, "limit": 2}, "max_products": {"used": 3, "limit": 2}}'::jsonb);
update public.subscriptions set limit_overrides = '{}' where store_id = tests.fx('store_b');
select tests.check('override removed: products again', not tests.throws('select pg_temp.product(4)'));

-- Team: max_staff counts admins and staff; roles decide who manages whom.
select tests.create_user('member_1');
select tests.create_user('member_2');
select tests.create_user('member_3');
select public.store_member_add(tests.fx('store_b'), tests.fx('member_1'), 'admin', tests.fx('owner_b'));
select tests.check('team: an admin cannot add admins', tests.throws(format(
  $$select public.store_member_add(%L, %L, 'admin', %L)$$, tests.fx('store_b'), tests.fx('member_2'), tests.fx('member_1'))));
select public.store_member_add(tests.fx('store_b'), tests.fx('member_2'), 'staff', tests.fx('member_1'));
select tests.check('team: Base allows 2 (owner not counted)', tests.throws(format(
  $$select public.store_member_add(%L, %L, 'staff', %L)$$, tests.fx('store_b'), tests.fx('member_3'), tests.fx('owner_b'))));
select tests.check('team: staff cannot manage the team', tests.throws(format(
  $$select public.store_member_remove(%L, %L, %L)$$, tests.fx('store_b'), tests.fx('member_1'), tests.fx('member_2'))));
select tests.check('team: nobody removes the owner', tests.throws(format(
  $$select public.store_member_remove(%L, %L, %L)$$, tests.fx('store_b'), tests.fx('owner_b'), tests.fx('member_1'))));
select tests.check('team: an admin cannot demote another admin', tests.throws(format(
  $$select public.store_member_update(%L, %L, 'staff', %L)$$, tests.fx('store_b'), tests.fx('member_1'), tests.fx('member_1'))));
select tests.check('team: an outsider cannot manage the team', tests.throws(format(
  $$select public.store_member_add(%L, %L, 'staff', %L)$$, tests.fx('store_b'), tests.fx('member_3'), tests.fx('owner_a'))));
select public.store_member_remove(tests.fx('store_b'), tests.fx('member_2'), tests.fx('member_1'));
select tests.check('team: a free place again', not tests.throws(format(
  $$select public.store_member_add(%L, %L, 'staff', %L)$$, tests.fx('store_b'), tests.fx('member_3'), tests.fx('owner_b'))));

select tests.login('owner_b');
select tests.check('owner: engine functions are server-only',
  tests.throws(format($$select public.change_plan(%L, 'pro', 'month', null)$$, tests.fx('store_b')))
  and tests.throws(format($$select public.set_store_addon(%L, 'vouchers', true, null)$$, tests.fx('store_b')))
  and tests.throws(format($$select public.store_member_add(%L, %L, 'staff', %L)$$,
    tests.fx('store_b'), tests.fx('member_2'), tests.fx('owner_b'))));
select tests.eq('owner: reads its effective limits', public.store_limits(tests.fx('store_b')),
  '{"max_staff": 2, "max_products": 300}'::jsonb);
select tests.logout();

select tests.login('owner_a');
select tests.eq('owner of A: no limits of B', public.store_limits(tests.fx('store_b')), '{}'::jsonb);
select tests.logout();
