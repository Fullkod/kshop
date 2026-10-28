-- Phase 8: the legacy import helpers are service_role only, the imported history stays inside its store, and the
-- import never reserves stock, moves stock or queues WhatsApp notices.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Legacy Test A', 'legacy-test-a', tests.fx('owner_a'), 'CUP', 'LA', '5351111111', 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Legacy Test B', 'legacy-test-b', tests.fx('owner_b'), 'CUP', 'LB', '5352222222', 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');

create function pg_temp.import_order(p_store text, p_legacy text, p_status text, p_pay text, p_shipping numeric)
returns jsonb
language sql as $$
  select public.import_legacy_order(tests.fx(p_store), jsonb_build_object(
    'legacy_id', p_legacy, 'legacy_number', 'KS-' || upper(right(p_legacy, 4)), 'created_at', '2026-01-07T02:20:48Z',
    'status', p_status, 'payment_status', p_pay, 'currency', 'CUP',
    'customer_name', 'Melissa', 'customer_phone', '+5358727592',
    'shipping_type', case when p_shipping is null then 'to_agree' else 'delivery' end,
    'shipping_snapshot', jsonb_build_object('zone', 'Santa Clara'), 'shipping_total', p_shipping,
    'payment_snapshot', jsonb_build_object('name', 'WhatsApp'),
    'lines', jsonb_build_array(
      jsonb_build_object('legacy_id', p_legacy || '-l1', 'product_name', 'Bolso', 'sku', 'KS-1', 'quantity', 2,
        'unit_price', 160, 'unit_list_price', 160, 'line_total', 320),
      jsonb_build_object('legacy_id', p_legacy || '-l2', 'product_name', 'Pareo', 'sku', 'KS-2', 'quantity', 1,
        'unit_price', 400, 'line_total', 400))), tests.fx('owner_a'));
$$;

insert into pg_temp.fixtures (key, id)
select 'order_a1', (pg_temp.import_order('store_a', 'legacy-a1', 'paid', 'paid', 100) ->> 'order_id')::uuid;
insert into pg_temp.fixtures (key, id)
select 'order_a2', (pg_temp.import_order('store_a', 'legacy-a2', 'pending_payment', 'unpaid', null) ->> 'order_id')::uuid;
insert into pg_temp.fixtures (key, id)
select 'order_b1', (pg_temp.import_order('store_b', 'legacy-b1', 'delivered', 'paid', 0) ->> 'order_id')::uuid;

-- ---------------------------------------------------------------------------
-- What the import writes (and does not)
-- ---------------------------------------------------------------------------

select tests.eq('numbers come from the store counter (1001, 1002)',
  (select string_agg(number::text, ',' order by number) from public.orders where store_id = tests.fx('store_a')), '1001,1002');
select tests.eq('totals: subtotal + shipping; paid orders record the payment',
  (select subtotal || '|' || total || '|' || paid_total from public.orders where id = tests.fx('order_a1')),
  '720.00|820.00|820.00');
select tests.eq('to agree: shipping and total stay null, nothing paid',
  (select coalesce(shipping_total::text, 'null') || '|' || coalesce(total::text, 'null') || '|' || paid_total
   from public.orders where id = tests.fx('order_a2')), 'null|null|0.00');
select tests.eq('one payment for the paid order, none for the unpaid',
  (select count(*) from public.payments where store_id = tests.fx('store_a'))::int, 1);
select tests.eq('events: created, imported and payment_recorded, all internal (no notices)',
  (select string_agg(type || ':' || is_internal, ',' order by type) from public.order_events where order_id = tests.fx('order_a1')),
  'created:true,imported:true,payment_recorded:true');
select tests.eq('imported orders never notify the customer',
  (select bool_or(notify_customer) from public.orders where store_id = tests.fx('store_a')), false);
select tests.eq('lines keep their order and totals',
  (select string_agg(product_name || ':' || line_total, ',' order by sort_order) from public.order_lines where order_id = tests.fx('order_a1')),
  'Bolso:320.00,Pareo:400.00');
select tests.eq('dated as in klauShop',
  (select created_at::date::text from public.orders where id = tests.fx('order_a1')), '2026-01-07');
select tests.eq('importing the same legacy order twice creates nothing',
  (pg_temp.import_order('store_a', 'legacy-a1', 'paid', 'paid', 100) ->> 'created'), 'false');
select tests.eq('still two orders in A', (select count(*) from public.orders where store_id = tests.fx('store_a'))::int, 2);
-- The notice trigger is deferred to commit (and tests roll back): fire it now, with notices enabled, before counting.
update private.platform_config set value = '"dry_run"'::jsonb where key = 'whatsapp_mode';
insert into public.store_notification_contacts (store_id, name, phone) values (tests.fx('store_a'), 'Tienda A', '+5351111111');
select pg_temp.import_order('store_a', 'legacy-a3', 'delivered', 'paid', 0);
set constraints all immediate;
select tests.eq('no WhatsApp notice queued (trigger fired, notices on)',
  (select count(*) from public.notification_log where store_id = tests.fx('store_a'))::int, 0);
select tests.eq('no stock reservation', (select count(*) from public.inventory_reservations where store_id = tests.fx('store_a'))::int, 0);
select tests.eq('no stock movement', (select count(*) from public.stock_movements where store_id = tests.fx('store_a'))::int, 0);
select tests.eq('legacy ids recorded (3 orders + 6 lines)',
  (select count(*) from public.legacy_ids_list(tests.fx('store_a'), 'order'))::int
  + (select count(*) from public.legacy_ids_list(tests.fx('store_a'), 'order_line'))::int, 9);

-- ---------------------------------------------------------------------------
-- Isolation and permissions
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.check('anon: cannot run the import', tests.throws(format(
  $$select public.import_legacy_order(%L, '{}'::jsonb, null)$$, tests.fx('store_a'))));
select tests.check('anon: cannot read the legacy map', tests.throws(format(
  $$select * from public.legacy_ids_list(%L, 'order')$$, tests.fx('store_a'))));
select tests.check('anon: does not see imported orders', tests.throws('select * from public.orders'));
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff A: sees the three imported orders of A and none of B',
  (select count(*) from public.orders where store_id = tests.fx('store_a'))::int
    || '|' || (select count(*) from public.orders where store_id = tests.fx('store_b'))::int, '3|0');
select tests.check('staff A: cannot run the import', tests.throws(format(
  $$select public.import_legacy_order(%L, '{}'::jsonb, null)$$, tests.fx('store_a'))));
select tests.check('staff A: cannot read the legacy map', tests.throws(format(
  $$select * from public.legacy_ids_list(%L, 'order')$$, tests.fx('store_a'))));
select tests.check('staff A: cannot write the legacy map', tests.throws(format(
  $$select public.legacy_ids_put(%L, '[]'::jsonb)$$, tests.fx('store_a'))));
select tests.check('staff A: cannot wipe a store', tests.throws(format(
  $$select public.legacy_wipe_store_data(%L)$$, tests.fx('store_a'))));
select tests.check('staff A: private.legacy_ids is out of reach', tests.throws('select * from private.legacy_ids'));
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B: sees only the imported order of B',
  (select count(*) from public.orders)::int, 1);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Wipe (rehearsals)
-- ---------------------------------------------------------------------------

select tests.eq('wipe: removes the orders and the map of A only',
  (select (public.legacy_wipe_store_data(tests.fx('store_a')) -> 'counts' ->> 'orders')::int), 3);
select tests.eq('wipe: A is empty, B untouched, the store itself stays',
  (select count(*) from public.orders where store_id = tests.fx('store_a'))::int
    || '|' || (select count(*) from public.orders where store_id = tests.fx('store_b'))::int
    || '|' || (select count(*) from public.stores where id = tests.fx('store_a'))::int
    || '|' || (select count(*) from public.legacy_ids_list(tests.fx('store_a'), 'order'))::int, '0|1|1|0');
select tests.check('wipe: refuses the Demo store', tests.throws(
  $$select public.legacy_wipe_store_data((select id from public.stores where slug = 'demo'))$$));
