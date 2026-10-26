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
