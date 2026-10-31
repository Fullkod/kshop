-- POS: the counter sale is service_role only, stays inside its store, never queues WhatsApp notices, never rejects a
-- sale for stock or price, and the phone never receives a cost.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'POS Test A', 'pos-test-a', tests.fx('owner_a'), 'CUP', 'PA', '5351111111', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'POS Test B', 'pos-test-b', tests.fx('owner_b'), 'CUP', 'PB', '5352222222', 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');

create function pg_temp.seed(p_store text, p_owner text, p_prefix text) returns void
language plpgsql as $$
declare
  v_type uuid; v_product uuid;
begin
  insert into public.product_types (store_id, name, slug) values (tests.fx(p_store), 'Simple', 'simple')
    returning id into v_type;
  v_product := public.save_product(tests.fx(p_store), jsonb_build_object(
    'product_type_id', v_type, 'name', 'Arroz ' || p_prefix, 'slug', 'arroz-' || p_prefix, 'status', 'published',
    'variants', jsonb_build_array(jsonb_build_object('sku', upper(p_prefix) || '-ARROZ', 'price', 1000, 'stock', 5,
      'cost', jsonb_build_object('price', 700, 'currency', 'CUP')))),
    tests.fx(p_owner));
  insert into pg_temp.fixtures select p_prefix || '_variant', id from public.product_variants where product_id = v_product;
end;
$$;
select pg_temp.seed('store_a', 'owner_a', 'a');
select pg_temp.seed('store_b', 'owner_b', 'b');

create function pg_temp.sale(p_id uuid, p_qty int, p_price numeric, p_variant uuid, p_voided boolean default false)
returns jsonb
language sql as $$
  select jsonb_build_object('id', p_id, 'device_id', '00000000-0000-4000-8000-000000000001', 'local_number', 'C-1',
    'sold_at', now() - interval '2 days', 'voided', p_voided,
    'lines', jsonb_build_array(jsonb_build_object('variant_id', p_variant, 'quantity', p_qty, 'unit_price', p_price,
      'product_name', 'Arroz del teléfono')),
    'payments', case when p_qty * p_price > 2000 then jsonb_build_array(
      jsonb_build_object('amount', 5, 'currency', 'USD', 'rate', 400),
      jsonb_build_object('amount', p_qty * p_price - 2000, 'currency', 'CUP'))
    else jsonb_build_array(jsonb_build_object('amount', p_qty * p_price, 'currency', 'CUP')) end);
$$;

-- The notice trigger is deferred to commit (and tests roll back): notices on, then fired by hand before counting.
update private.platform_config set value = '"dry_run"'::jsonb where key = 'whatsapp_mode';
insert into public.store_notification_contacts (store_id, name, phone) values (tests.fx('store_a'), 'Tienda A', '+5351111111');

insert into pg_temp.fixtures (key, id) values ('sale_1', '11111111-1111-4111-8111-111111111111');
insert into pg_temp.fixtures (key, id)
select 'order_1', (public.pos_record_sale(tests.fx('store_a'),
  pg_temp.sale(tests.fx('sale_1'), 3, 1000, tests.fx('a_variant')), tests.fx('staff_a')) ->> 'order_id')::uuid;
set constraints all immediate;

-- ---------------------------------------------------------------------------
-- What a sale writes
-- ---------------------------------------------------------------------------

select tests.eq('entitlements: Base includes pos',
  (select count(*) from public.store_entitlements(tests.fx('store_a')) where module_code = 'pos')::int, 1);
select tests.eq('entitlements: Pro includes pos',
  (select count(*) from public.store_entitlements(tests.fx('store_b')) where module_code = 'pos')::int, 1);

select tests.eq('order: counter channel, delivered, no phone, paid',
  (select channel || ':' || status || ':' || coalesce(customer_phone, 'none') || ':' || payment_status
   from public.orders where id = tests.fx('order_1')), 'pos:delivered:none:paid');
select tests.eq('order: dated when it was sold, not when uploaded',
  (select created_at::date from public.orders where id = tests.fx('order_1')), (now() - interval '2 days')::date);
select tests.eq('order: never notifies the customer',
  (select notify_customer from public.orders where id = tests.fx('order_1')), false);
select tests.eq('order: total and paid',
  (select total || ':' || paid_total from public.orders where id = tests.fx('order_1')), '3000.00:3000.00');
select tests.eq('payments: 5 USD at 400 and the rest in CUP',
  (select string_agg(amount || ' ' || currency || '=' || applied_amount, ',' order by amount)
   from public.payments where order_id = tests.fx('order_1')), '5.00 USD=2000.00,1000.00 CUP=1000.00');
select tests.eq('payments: dated when it was sold',
  (select max(created_at)::date from public.payments where order_id = tests.fx('order_1')), (now() - interval '2 days')::date);
select tests.eq('events: all internal', (select bool_and(is_internal) from public.order_events where order_id = tests.fx('order_1')), true);
select tests.eq('no WhatsApp notice queued (trigger fired, notices on)',
  (select count(*) from public.notification_log where store_id = tests.fx('store_a'))::int, 0);
select tests.eq('stock: 3 of 5 discounted',
  (select quantity from public.stocks where variant_id = tests.fx('a_variant')), 2);
select tests.eq('cost: snapshot taken by the server',
  (select c.unit_cost from public.order_line_costs c join public.order_lines l on l.id = c.order_line_id
   where l.order_id = tests.fx('order_1')), 700.00);
select tests.eq('nothing to note', (select flags from public.pos_sales where order_id = tests.fx('order_1')), '[]'::jsonb);

select tests.eq('repeating the sale returns the same order',
  public.pos_record_sale(tests.fx('store_a'), pg_temp.sale(tests.fx('sale_1'), 3, 1000, tests.fx('a_variant')), tests.fx('staff_a')) ->> 'order_id',
  tests.fx('order_1')::text);
select tests.eq('repeating the sale creates nothing',
  (select count(*) from public.orders where store_id = tests.fx('store_a'))::int, 1);
select tests.eq('repeating the sale does not discount again',
  (select quantity from public.stocks where variant_id = tests.fx('a_variant')), 2);

-- ---------------------------------------------------------------------------
-- It already happened: stock and price never reject it
-- ---------------------------------------------------------------------------

insert into pg_temp.fixtures (key, id)
select 'order_2', (public.pos_record_sale(tests.fx('store_a'), pg_temp.sale('22222222-2222-4222-8222-222222222222', 4, 900,
  tests.fx('a_variant')), tests.fx('staff_a')) ->> 'order_id')::uuid;
select tests.eq('no stock: the sale is recorded and the shortfall noted',
  (select f ->> 'missing' from public.pos_sales s, jsonb_array_elements(s.flags) f
   where s.order_id = tests.fx('order_2') and f ->> 'type' = 'stock_shortfall'), '2');
select tests.eq('no stock: it never goes negative', (select quantity from public.stocks where variant_id = tests.fx('a_variant')), 0);
select tests.eq('another price: what was charged stays',
  (select unit_price from public.order_lines where order_id = tests.fx('order_2')), 900.00);
select tests.eq('another price: noted',
  (select count(*) from public.pos_sales s, jsonb_array_elements(s.flags) f
   where s.order_id = tests.fx('order_2') and f ->> 'type' = 'price_mismatch')::int, 1);

select public.order_cancel(tests.fx('store_a'), tests.fx('order_2'), 'Error', tests.fx('owner_a'));
select tests.eq('cancel a counter sale: the stock comes back (only what it took)',
  (select quantity from public.stocks where variant_id = tests.fx('a_variant')), 2);
select tests.eq('cancel a counter sale: the balance goes to 0',
  (select paid_total from public.orders where id = tests.fx('order_2')), 0.00);

insert into pg_temp.fixtures (key, id)
select 'order_3', (public.pos_record_sale(tests.fx('store_a'), pg_temp.sale('33333333-3333-4333-8333-333333333333', 1, 1000,
  '99999999-9999-4999-8999-999999999999'), tests.fx('staff_a')) ->> 'order_id')::uuid;
select tests.eq('product gone: the sale keeps the name on the phone',
  (select product_name from public.order_lines where order_id = tests.fx('order_3')), 'Arroz del teléfono');

insert into pg_temp.fixtures (key, id)
select 'order_4', (public.pos_record_sale(tests.fx('store_a'), pg_temp.sale('44444444-4444-4444-8444-444444444444', 1, 1000,
  tests.fx('a_variant'), true), tests.fx('staff_a')) ->> 'order_id')::uuid;
select tests.eq('voided: arrives cancelled, without money',
  (select status || ':' || paid_total from public.orders where id = tests.fx('order_4')), 'cancelled:0.00');
select tests.eq('voided: no stock taken', (select quantity from public.stocks where variant_id = tests.fx('a_variant')), 2);

select tests.eq('a variant of another store is not sold nor discounted',
  (select variant_id from public.order_lines where order_id = (public.pos_record_sale(tests.fx('store_a'),
    pg_temp.sale('55555555-5555-4555-8555-555555555555', 1, 1000, tests.fx('b_variant')), tests.fx('staff_a')) ->> 'order_id')::uuid), null::uuid);
select tests.eq('... and B keeps its stock', (select quantity from public.stocks where variant_id = tests.fx('b_variant')), 5);

-- ---------------------------------------------------------------------------
-- Other ways of paying
-- ---------------------------------------------------------------------------

select tests.eq('the sale of another store with the same id is another order',
  public.pos_record_sale(tests.fx('store_b'), pg_temp.sale(tests.fx('sale_1'), 1, 1000, tests.fx('b_variant')), tests.fx('owner_b')) ->> 'created', 'true');
select tests.eq('a phone with the wrong time does not move the sale',
  (public.pos_record_sale(tests.fx('store_a'), pg_temp.sale('66666666-6666-4666-8666-666666666666', 1, 1000, tests.fx('a_variant'))
    || jsonb_build_object('sold_at', now() + interval '3 days'), tests.fx('staff_a')) -> 'flags' -> 0 ->> 'type'), 'clock_skew');
select tests.check('a sale without lines is refused',
  tests.throws($$select public.pos_record_sale(tests.fx('store_a'), jsonb_build_object('id', gen_random_uuid(),
    'device_id', gen_random_uuid(), 'local_number', 'C-9', 'sold_at', now(), 'lines', '[]'::jsonb), tests.fx('staff_a'))$$));

-- ---------------------------------------------------------------------------
-- The catalog: no costs
-- ---------------------------------------------------------------------------

select tests.eq('catalog: one variant of A',
  jsonb_array_length(public.pos_catalog(tests.fx('store_a'), null, 500) -> 'items'), 1);
select tests.check('catalog: no cost anywhere',
  public.pos_catalog(tests.fx('store_a'), null, 500)::text !~* 'cost');
select tests.eq('catalog: A does not bring variants of B',
  public.pos_catalog(tests.fx('store_a'), null, 500) -> 'items' -> 0 ->> 'sku', 'A-ARROZ');

-- ---------------------------------------------------------------------------
-- As the API roles
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.check('anon: cannot record a sale',
  tests.throws(format('select public.pos_record_sale(%L, ''{}''::jsonb, %L)', tests.fx('store_a'), tests.fx('owner_a'))));
select tests.check('anon: cannot read the catalog',
  tests.throws(format('select public.pos_catalog(%L, null, 10)', tests.fx('store_a'))));
select tests.eq('anon: no counter sales', (select count(*) from public.pos_sales)::int, 0);

select tests.login('staff_a');
select tests.check('staff A: cannot record a sale directly (only through the API)',
  tests.throws(format('select public.pos_record_sale(%L, ''{}''::jsonb, %L)', tests.fx('store_a'), tests.fx('staff_a'))));
select tests.check('staff A: cannot read the catalog directly',
  tests.throws(format('select public.pos_catalog(%L, null, 10)', tests.fx('store_a'))));
select tests.check('staff A: reads the counter sales of A',
  (select count(*) from public.pos_sales where store_id = tests.fx('store_a')) > 0);
select tests.eq('staff A: reads nothing of B',
  (select count(*) from public.pos_sales where store_id = tests.fx('store_b'))::int, 0);
select tests.check('staff A: cannot write counter sales',
  tests.throws(format($$update public.pos_sales set flags = '[]' where order_id = %L$$, tests.fx('order_1'))));

select tests.eq('filter: only the counter of A',
  (public.admin_orders(tests.fx('store_a'), 50, p_channel => 'pos') -> 'ordersCollection' ->> 'totalCount')::int,
  (select count(*) from public.orders where store_id = tests.fx('store_a'))::int);
select tests.eq('filter: another channel brings nothing',
  (public.admin_orders(tests.fx('store_a'), 50, p_channel => 'web') -> 'ordersCollection' ->> 'totalCount')::int, 0);
select tests.eq('sale: the note says the product, not its id',
  (select f ->> 'name' from jsonb_array_elements(public.admin_pos_sale(tests.fx('order_2')) -> 'flags') f
   where f ->> 'type' = 'stock_shortfall'), 'Arroz a');
select tests.eq('sale: nothing to note is an empty list',
  public.admin_pos_sale(tests.fx('order_1')) -> 'flags', '[]'::jsonb);
select tests.eq('overview: what was not cancelled, in the period',
  (public.admin_pos_overview(tests.fx('store_a'), 7) ->> 'count')::int, 4);
select tests.eq('overview: only today (the sale of 2 days ago stays out)',
  (public.admin_pos_overview(tests.fx('store_a'), 1) ->> 'count')::int, 1);
select tests.eq('overview: cancelled apart',
  (public.admin_pos_overview(tests.fx('store_a'), 7) ->> 'cancelled')::int, 2);
select tests.eq('overview: the till per currency, cancelled sales out',
  public.admin_pos_overview(tests.fx('store_a'), 7) -> 'cash',
  '[{"currency": "CUP", "amount": 4000.00}, {"currency": "USD", "amount": 5.00}]'::jsonb);
select tests.eq('overview: the rate used',
  public.admin_pos_overview(tests.fx('store_a'), 7) -> 'rates',
  '[{"currency": "USD", "orderCurrency": "CUP", "rateToOrder": 400.00000000, "payments": 1}]'::jsonb);
select tests.eq('overview: what needs a look',
  (public.admin_pos_overview(tests.fx('store_a'), 7) ->> 'flaggedCount')::int, 3);
select tests.check('overview: no cost anywhere',
  public.admin_pos_overview(tests.fx('store_a'), 7)::text !~* 'cost');

select tests.login_anon();
select tests.check('anon: cannot read the overview',
  tests.throws(format('select public.admin_pos_overview(%L, 7)', tests.fx('store_a'))));
select tests.check('anon: cannot read a sale',
  tests.throws(format('select public.admin_pos_sale(%L)', tests.fx('order_1'))));

select tests.login('owner_b');
select tests.eq('owner B: does not see the sales of A',
  (select count(*) from public.pos_sales where store_id = tests.fx('store_a'))::int, 0);
select tests.eq('owner B: does not see the orders of A',
  (select count(*) from public.orders where id = tests.fx('order_1'))::int, 0);
select tests.eq('owner B: the overview of A is empty',
  public.admin_pos_overview(tests.fx('store_a'), 90),
  '{"count": 0, "cancelled": 0, "cash": [], "rates": [], "flaggedCount": 0, "flagged": []}'::jsonb);
select tests.check('owner B: a sale of A does not exist',
  public.admin_pos_sale(tests.fx('order_1')) is null);
select tests.eq('owner B: the counter filter of A is empty',
  (public.admin_orders(tests.fx('store_a'), 50, p_channel => 'pos') -> 'ordersCollection' ->> 'totalCount')::int, 0);

select tests.logout();
