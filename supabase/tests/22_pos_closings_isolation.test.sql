-- KSH0012: cierre de caja. What is expected (float + cash − change, methods apart, voided counted), one closing per
-- cashier and day (a second one only with new sales), the WhatsApp reckoning, and who can read closings.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('cashier_1');
select tests.create_user('cashier_2');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Cierre Test A', 'cierre-test-a', tests.fx('owner_a'), 'CUP', 'CA', '5351111111', 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Cierre Test B', 'cierre-test-b', tests.fx('owner_b'), 'CUP', 'CB', '5352222222', 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values
  (tests.fx('store_a'), tests.fx('cashier_1'), 'staff'),
  (tests.fx('store_a'), tests.fx('cashier_2'), 'staff');

update public.stores set pos_float = '{"CUP": 500}' where id = tests.fx('store_a');
with m as (
  insert into public.payment_methods (store_id, name) values (tests.fx('store_a'), 'Transferencia') returning id
)
insert into pg_temp.fixtures (key, id) select 'transfer', id from m;
with m as (
  insert into public.payment_methods (store_id, name) values (tests.fx('store_a'), 'Efectivo') returning id
)
insert into pg_temp.fixtures (key, id) select 'cash_method', id from m;

create function pg_temp.seed(p_store text, p_owner text, p_prefix text) returns void
language plpgsql as $$
declare
  v_type uuid; v_product uuid;
begin
  insert into public.product_types (store_id, name, slug) values (tests.fx(p_store), 'Simple', 'simple')
    returning id into v_type;
  v_product := public.save_product(tests.fx(p_store), jsonb_build_object(
    'product_type_id', v_type, 'name', 'Arroz ' || p_prefix, 'slug', 'arroz-' || p_prefix, 'status', 'published',
    'variants', jsonb_build_array(jsonb_build_object('sku', upper(p_prefix) || '-ARROZ', 'price', 100, 'stock', 500))),
    tests.fx(p_owner));
  insert into pg_temp.fixtures select p_prefix || '_variant', id from public.product_variants where product_id = v_product;
end;
$$;
select pg_temp.seed('store_a', 'owner_a', 'a');
select pg_temp.seed('store_b', 'owner_b', 'b');

-- A counter sale of p_qty × 100 CUP, paid with p_payments, by p_cashier.
create function pg_temp.sell(p_cashier text, p_qty int, p_payments jsonb, p_voided boolean default false) returns uuid
language sql as $$
  select (public.pos_record_sale(tests.fx('store_a'), jsonb_build_object(
    'id', gen_random_uuid(), 'device_id', '00000000-0000-4000-8000-000000000003', 'local_number', 'C-1',
    'sold_at', now(), 'voided', p_voided,
    'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx('a_variant'), 'quantity', p_qty,
      'unit_price', 100, 'product_name', 'Arroz')),
    'payments', p_payments), tests.fx(p_cashier)) ->> 'order_id')::uuid;
$$;

select pg_temp.sell('cashier_1', 10, '[{"amount": 1000}]');
select pg_temp.sell('cashier_1', 15, '[{"amount": 2000, "change_amount": 500, "change_currency": "CUP"}]');
select pg_temp.sell('cashier_1', 8, jsonb_build_array(jsonb_build_object('amount', 800, 'payment_method_id', tests.fx('transfer'))));
select pg_temp.sell('cashier_1', 2, jsonb_build_array(jsonb_build_object('amount', 200, 'payment_method_id', tests.fx('cash_method'))));
select pg_temp.sell('cashier_1', 3, '[{"amount": 300}]', true);
select pg_temp.sell('cashier_2', 3, '[{"amount": 300}]');

update private.platform_config set value = '"dry_run"'::jsonb where key = 'whatsapp_mode';
insert into public.store_notification_contacts (store_id, name, phone, notify_new_order, notify_cash_closing) values
  (tests.fx('store_a'), 'Dueño', '+5355555555', false, true),
  (tests.fx('store_a'), 'Otro', '+5355555556', false, false);

-- ---------------------------------------------------------------------------
-- Preview and closing (service_role functions, called as the database owner like the API does)
-- ---------------------------------------------------------------------------

select tests.eq('preview: cash of the whole till = cash + «Efectivo» − change, both cashiers (KSH0014)',
  public.pos_closing_preview(tests.fx('store_a'), tests.fx('cashier_1')) -> 'cash', '{"CUP": 3000}'::jsonb);
select tests.eq('preview: expected cash adds the float',
  public.pos_closing_preview(tests.fx('store_a'), tests.fx('cashier_1')) -> 'expected_cash', '{"CUP": 3500}'::jsonb);
select tests.eq('preview: transfers apart',
  public.pos_closing_preview(tests.fx('store_a'), tests.fx('cashier_1')) -> 'methods',
  '[{"name": "Transferencia", "amount": 800, "currency": "CUP"}]'::jsonb);
select tests.eq('preview: sales and voided',
  public.pos_closing_preview(tests.fx('store_a'), tests.fx('cashier_1')) -> 'sales' || (public.pos_closing_preview(tests.fx('store_a'), tests.fx('cashier_1')) -> 'voided'),
  '[5, 1]'::jsonb);
select tests.eq('preview: cashier 2 sees the same till',
  public.pos_closing_preview(tests.fx('store_a'), tests.fx('cashier_2')) -> 'cash', '{"CUP": 3000}'::jsonb);
select tests.eq('preview: what each cashier sold',
  (select jsonb_agg(jsonb_build_array(c -> 'sales', c -> 'cash') order by (c ->> 'sales')::int desc)
   from jsonb_array_elements(public.pos_closing_preview(tests.fx('store_a'), tests.fx('cashier_2')) -> 'by_cashier') c),
  '[[4, {"CUP": 2700}], [1, {"CUP": 300}]]'::jsonb);

insert into pg_temp.fixtures (key, id)
select 'closing_1', (public.pos_close_day(tests.fx('store_a'), tests.fx('cashier_1'),
  '{"counted": {"CUP": 3150}, "note": "faltó cambio"}') ->> 'id')::uuid;

select tests.eq('close: the difference is counted − expected',
  (select counted from public.pos_closings where id = tests.fx('closing_1')), '{"CUP": 3150}'::jsonb);
select tests.eq('close: the 6 sales of both cashiers are inside it, none left open',
  (select jsonb_build_array(
    (select count(*) from public.pos_sales where closing_id = tests.fx('closing_1')),
    (select count(*) from public.pos_sales where cashier_id = tests.fx('cashier_2') and closing_id is null))),
  '[6, 0]'::jsonb);
select tests.eq('close: the WhatsApp goes only to the contact that asked for it',
  (select jsonb_agg(recipient) from public.notification_log
   where store_id = tests.fx('store_a') and event = 'cash_closing'), '["+5355555555"]'::jsonb);
select tests.check('close: the message says what is missing',
  (select message from public.notification_log where store_id = tests.fx('store_a') and event = 'cash_closing') ~ 'Faltan 350');
select tests.check('close: the message lists the transfers',
  (select message from public.notification_log where store_id = tests.fx('store_a') and event = 'cash_closing') ~ 'Transferencia');

select tests.check('close again without new sales: refused',
  tests.throws(format('select public.pos_close_day(%L, %L, %L)', tests.fx('store_a'), tests.fx('cashier_1'),
    '{"counted": {"CUP": 0}}')));
select tests.check('close: a currency the store does not have is refused',
  tests.throws(format('select public.pos_close_day(%L, %L, %L)', tests.fx('store_a'), tests.fx('cashier_2'),
    '{"counted": {"XXX": 5}}')));

select pg_temp.sell('cashier_1', 1, '[{"amount": 100}]');
select tests.eq('second closing of the day: only the new sale, with the float again',
  public.pos_close_day(tests.fx('store_a'), tests.fx('cashier_1'), '{"counted": {"CUP": 600}}')
    -> 'expected' -> 'expected_cash', '{"CUP": 600}'::jsonb);

-- ---------------------------------------------------------------------------
-- Who reads closings
-- ---------------------------------------------------------------------------

select tests.login('cashier_1');
select tests.eq('cashier 1: sees its 2 closings',
  jsonb_array_length(public.admin_pos_closings(tests.fx('store_a'), 7) -> 'closings'), 2);
select tests.check('cashier 1: cannot call the closing directly',
  tests.throws(format('select public.pos_close_day(%L, %L, %L)', tests.fx('store_a'), tests.fx('cashier_1'),
    '{"counted": {"CUP": 0}}')));
select tests.check('cashier 1: cannot change the float',
  tests.throws(format('update public.stores set pos_float = %L where id = %L', '{"CUP": 1}', tests.fx('store_a'))));

select tests.login('cashier_2');
select tests.eq('cashier 2: sees the closings of the till',
  jsonb_array_length(public.admin_pos_closings(tests.fx('store_a'), 7) -> 'closings'), 2);

select tests.login('owner_a');
select tests.eq('owner A: sees every closing, with the cashier and its orders',
  (select jsonb_build_array(jsonb_array_length(c -> 'closings'), jsonb_array_length(c -> 'closings' -> 1 -> 'orders'),
    (c -> 'closings' -> 1 ->> 'cashier') is not null)
   from (select public.admin_pos_closings(tests.fx('store_a'), 7) as c) x),
  '[2, 6, true]'::jsonb);
select tests.eq('owner A: reads the float', public.admin_pos_closings(tests.fx('store_a'), 7) -> 'float', '{"CUP": 500}'::jsonb);

select tests.login('owner_b');
select tests.eq('owner B: no closings of A',
  jsonb_array_length(public.admin_pos_closings(tests.fx('store_a'), 7) -> 'closings'), 0);
select tests.eq('owner B: no closings of A in the table',
  (select count(*) from public.pos_closings where store_id = tests.fx('store_a'))::int, 0);
select tests.check('owner B: the email of a cashier of A is hidden',
  private.member_email(tests.fx('store_a'), tests.fx('cashier_1')) is null);

select tests.login_anon();
select tests.check('anon: cannot read closings',
  tests.throws(format('select public.admin_pos_closings(%L, 7)', tests.fx('store_a'))));
select tests.check('anon: cannot preview',
  tests.throws(format('select public.pos_closing_preview(%L, %L)', tests.fx('store_a'), tests.fx('cashier_1'))));

select tests.logout();
