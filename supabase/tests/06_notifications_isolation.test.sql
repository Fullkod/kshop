-- Phase 4: WhatsApp notices. Queued at commit from order events (here forced with "set constraints all immediate",
-- the test transaction never commits), rendered with the store template or the platform default, never twice,
-- only with the whatsapp_notifications module and the customer's consent; contacts, templates and the log are
-- isolated between stores and the platform settings are not readable by any API role.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

-- A is Pro (whatsapp_notifications), B is Base (no notices).
insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Notif Test A', 'notif-test-a', tests.fx('owner_a'), 'CUP', 'NA', '5351111111', 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Notif Test B', 'notif-test-b', tests.fx('owner_b'), 'CUP', 'NB', '5352222222', 'base', 30, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');
update private.platform_config set value = '"dry_run"' where key = 'whatsapp_mode';

select tests.create_user('cust_a', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_a')));
with x as (
  insert into public.customers (store_id, user_id, phone, first_name)
  values (tests.fx('store_a'), tests.fx('cust_a'), '+5353000009', 'Ana') returning id
) insert into pg_temp.fixtures select 'c_a', id from x;

create function pg_temp.seed(p_prefix text, p_store text, p_owner text) returns void
language plpgsql as $$
declare
  v_type uuid; v_product uuid; v_zone uuid; v_method uuid;
begin
  insert into public.product_types (store_id, name, slug) values (tests.fx(p_store), 'Simple', 'simple') returning id into v_type;
  v_product := public.save_product(tests.fx(p_store), jsonb_build_object(
    'product_type_id', v_type, 'name', 'Bolso *Lujo*', 'slug', 'bolso', 'status', 'published',
    'variants', jsonb_build_array(jsonb_build_object('sku', upper(p_prefix) || 'B', 'price', 1000, 'stock', 50))),
    tests.fx(p_owner));
  insert into pg_temp.fixtures select p_prefix || 'variant', id from public.product_variants where product_id = v_product;
  insert into public.shipping_zones (store_id, name) values (tests.fx(p_store), 'Centro') returning id into v_zone;
  insert into public.shipping_methods (store_id, zone_id, type, name, price)
  values (tests.fx(p_store), v_zone, 'delivery', 'Mensajería', 200) returning id into v_method;
  insert into pg_temp.fixtures values (p_prefix || 'zone', v_zone), (p_prefix || 'method', v_method);
  insert into public.store_notification_contacts (store_id, name, phone, notify_payment_recorded)
  values (tests.fx(p_store), 'Dueña ' || p_prefix, '+5355555' || case p_prefix when 'a_' then '001' else '002' end, true);
end $$;

select pg_temp.seed('a_', 'store_a', 'owner_a');
select pg_temp.seed('b_', 'store_b', 'owner_b');

create function pg_temp.checkout(p_store text, p_prefix text, p_key text, p_extra jsonb default '{}') returns uuid
language sql as $$
  select (public.checkout_create_order(tests.fx(p_store), jsonb_build_object(
    'idempotency_key', p_key, 'currency', 'CUP',
    'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx(p_prefix || 'variant'), 'quantity', 2)),
    'customer', jsonb_build_object('name', 'Invitada', 'phone', '+5353123456'),
    'shipping', jsonb_build_object('method_id', tests.fx(p_prefix || 'method'), 'zone_id', tests.fx(p_prefix || 'zone'),
      'address', 'Calle 5')) || p_extra) ->> 'order_id')::uuid;
$$;

create function pg_temp.notices(p_order text) returns text language sql as $$
  select coalesce(string_agg(format('%s:%s:%s', audience, event, status), ' ' order by audience, event), '')
  from public.notification_log where order_id = tests.fx(p_order);
$$;

-- ---------------------------------------------------------------------------
-- Queue (dry_run)
-- ---------------------------------------------------------------------------

insert into pg_temp.fixtures values ('o1', pg_temp.checkout('store_a', 'a_', 'key-notif-0001'));
select tests.eq('nothing is queued before the commit (deferred trigger)', pg_temp.notices('o1'), '');
set constraints all immediate;
set constraints all deferred;
select tests.eq('new order: notice to the store contact and to the customer, simulated in dry_run',
  pg_temp.notices('o1'), 'store:order_created:simulated customer:order_created:simulated');
select tests.check('customer notice: store name first, lines, total, automatic notice and contacts', (
  select message like '*Notif Test A*%' and message like '%2 × Bolso Lujo%' and message like '%Total: 2200 CUP%'
    and message like '%no respondas a este número%' and message like '%Consultas: Dueña a +5355555001%'
  from public.notification_log where order_id = tests.fx('o1') and audience = 'customer'));
select tests.check('guest customer: link to the public order page', (
  select message like '%https://notif-test-a.kshop.fullkod.com/order/%' from public.notification_log
  where order_id = tests.fx('o1') and audience = 'customer'));
select tests.check('store notice: link to the admin, no customer footer', (
  select message like '%/admin/orders/%' and message not like '%Consultas%' from public.notification_log
  where order_id = tests.fx('o1') and audience = 'store'));

select private.queue_notification(tests.fx('store_a'), tests.fx('o1'), 'customer', 'order_created', '+5353123456', '{}');
select tests.eq('the same notice is never queued twice',
  (select count(*) from public.notification_log where order_id = tests.fx('o1'))::int, 2);

-- Status changes and the store's own template.
insert into public.whatsapp_templates (store_id, event, audience, body)
values (tests.fx('store_a'), 'paid', 'customer', 'Pago de {{numero}} recibido{{desconocida}}.');
select public.order_transition(tests.fx('store_a'), tests.fx('o1'), 'pending_payment', null);
select public.order_transition(tests.fx('store_a'), tests.fx('o1'), 'paid', null);
set constraints all immediate;
set constraints all deferred;
select tests.eq('status changes notify the customer (payment also notifies the contact that asked)',
  pg_temp.notices('o1'),
  'store:order_created:simulated store:payment_recorded:simulated customer:order_created:simulated customer:paid:simulated customer:pending_payment:simulated');
select tests.check('the store template overrides the platform one; unknown variables disappear', (
  select message like e'*Notif Test A*\nPago de NA-% recibido.%' from public.notification_log
  where order_id = tests.fx('o1') and event = 'paid'));

-- Opt-out, customer accounts, module and mode.
insert into pg_temp.fixtures values ('o_optout', pg_temp.checkout('store_a', 'a_', 'key-notif-0002', '{"notify_customer": false}'));
insert into pg_temp.fixtures values ('o_account', pg_temp.checkout('store_a', 'a_', 'key-notif-0003',
  jsonb_build_object('customer_id', tests.fx('c_a'))));
insert into pg_temp.fixtures values ('o_b', pg_temp.checkout('store_b', 'b_', 'key-notif-0004'));
set constraints all immediate;
set constraints all deferred;
select tests.eq('opt-out: only the store is notified', pg_temp.notices('o_optout'), 'store:order_created:simulated');
select tests.check('customer with an account: link to the order in its profile', (
  select message like '%/account/orders/' || tests.fx('o_account') || '%' from public.notification_log
  where order_id = tests.fx('o_account') and audience = 'customer'));
select tests.eq('store without the whatsapp_notifications module: nothing', pg_temp.notices('o_b'), '');
update private.platform_config set value = '"off"' where key = 'whatsapp_mode';
insert into pg_temp.fixtures values ('o_off', pg_temp.checkout('store_a', 'a_', 'key-notif-0005'));
set constraints all immediate;
set constraints all deferred;
select tests.eq('mode off: nothing is queued', pg_temp.notices('o_off'), '');
update private.platform_config set value = '"dry_run"' where key = 'whatsapp_mode';

-- Retry and preview.
update public.notification_log set status = 'failed', error = 'HTTP 500'
where order_id = tests.fx('o1') and event = 'order_created' and audience = 'store';
select tests.eq('retry: a failed notice is simulated again in dry_run', (
  select format('%s %s', r.status, coalesce(r.error, '-')) from public.notification_retry(tests.fx('store_a'), (
    select id from public.notification_log where order_id = tests.fx('o1') and event = 'order_created' and audience = 'store')) r),
  'simulated -');
select tests.check('retry: only failed notices', tests.throws(format(
  $$select public.notification_retry(%L, (select id from public.notification_log where order_id = %L and event = 'paid'))$$,
  tests.fx('store_a'), tests.fx('o1'))));
select tests.check('preview renders with a real order', public.notification_preview(tests.fx('store_a'),
  'Hola {{cliente}} {{numero}}', 'customer', tests.fx('o1')) like e'*Notif Test A*\nHola Invitada NA-%');
select tests.check('dispatcher in dry_run sends nothing and does not fail', not tests.throws('select private.dispatch_notifications()'));

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.check('anon: cannot read the log, contacts or templates',
  tests.throws('select count(*) from public.notification_log')
  and tests.throws('select count(*) from public.store_notification_contacts')
  and tests.throws('select count(*) from public.whatsapp_templates'));
select tests.logout();

select tests.login('cust_a');
select tests.eq('customer: no log, contacts or templates',
  (select count(*) from public.notification_log)::int + (select count(*) from public.store_notification_contacts)::int
  + (select count(*) from public.whatsapp_templates)::int, 0);
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff A: reads the log of A only',
  (select count(*) from public.notification_log where store_id = tests.fx('store_b'))::int, 0);
select tests.check('staff A: reads the log of A', (select count(*) from public.notification_log)::int >= 6);
select tests.eq('staff A: platform defaults and its own template', (
  select count(*) filter (where store_id is null)::text || '+' || count(*) filter (where store_id is not null)
  from public.whatsapp_templates), '11+1');
select tests.eq('staff A: one contact (its own)', (select count(*) from public.store_notification_contacts)::int, 1);
select tests.eq('staff A: cannot write contacts directly', tests.affected(format(
  $$insert into public.store_notification_contacts (store_id, name, phone) values (%L, 'X', '+5355555999')$$,
  tests.fx('store_a'))), -1);
select tests.check('staff A: cannot read the platform settings', tests.throws('select * from private.platform_config'));
select tests.check('staff A: cannot call notification_retry', tests.throws(format(
  $$select public.notification_retry(%L, gen_random_uuid())$$, tests.fx('store_a'))));
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B: nothing of A',
  (select count(*) from public.notification_log where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.store_notification_contacts where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.whatsapp_templates where store_id = tests.fx('store_a'))::int, 0);
select tests.check('owner B: cannot send test messages', tests.throws($$select public.notification_send_test('+5355555000', 'x')$$));
select tests.logout();
