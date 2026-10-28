-- R11: the rest of the admin's RPC reads (customers, catalog, discounts, content, notice settings) run as the caller
-- (security invoker), so they show what pg_graphql would: the staff of a store see its private rows (customers,
-- vouchers, drafts, costs to admins, notice contacts), the staff of another store see none of them, anon cannot call
-- them.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Reads All A', 'reads-all-a', tests.fx('owner_a'), 'CUP', 'RA', '5351111111', 'pro', 30, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Reads All B', 'reads-all-b', tests.fx('owner_b'), 'CUP', 'RB', '5352222222', 'base', 30, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');

select tests.create_user('cust_a', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_a')));
insert into public.customers (store_id, user_id, phone, first_name, last_name)
values (tests.fx('store_a'), tests.fx('cust_a'), '+5353000001', 'Ana', 'Privada');
with t as (
  insert into public.product_types (store_id, name, slug) values (tests.fx('store_a'), 'Ropa', 'ropa') returning id
), p as (
  insert into public.products (store_id, product_type_id, name, slug, status)
  select tests.fx('store_a'), t.id, 'Borrador Secreto', 'borrador-secreto', 'draft' from t
  returning id
) insert into pg_temp.fixtures select 'product_a', id from p;
with v as (
  insert into public.product_variants (store_id, product_id, sku, price)
  values (tests.fx('store_a'), tests.fx('product_a'), 'SEC-1', 100) returning id
) insert into public.variant_costs (store_id, variant_id, cost_price, cost_currency)
select tests.fx('store_a'), id, 7, 'USD' from v;
insert into public.vouchers (store_id, code, name, scope, reward, value)
values (tests.fx('store_a'), 'SECRETO10', 'Cupón secreto', 'order', 'percent', 10);
insert into public.store_notification_contacts (store_id, name, phone)
values (tests.fx('store_a'), 'Encargada', '+5353000002');

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.check('anon: cannot call the admin reads',
  tests.throws(format('select public.admin_customers(%L, 10)', tests.fx('store_a')))
  and tests.throws(format('select public.admin_catalog_structure(%L)', tests.fx('store_a')))
  and tests.throws(format('select public.admin_products(%L, 10)', tests.fx('store_a')))
  and tests.throws(format('select public.admin_product(%L)', tests.fx('product_a')))
  and tests.throws(format('select public.admin_variant_search(%L)', tests.fx('store_a')))
  and tests.throws(format('select public.admin_promotions(%L)', tests.fx('store_a')))
  and tests.throws(format('select public.admin_vouchers(%L)', tests.fx('store_a')))
  and tests.throws(format('select public.admin_discount_targets(%L, %L)', tests.fx('store_a'), '{}'))
  and tests.throws(format('select public.admin_content(%L)', tests.fx('store_a')))
  and tests.throws(format('select public.admin_notification_settings(%L)', tests.fx('store_a'))));
select tests.logout();

select tests.login('owner_a');
select tests.eq('owner A: its customer, voucher, draft and notice contact',
  (select format('%s %s %s %s',
     public.admin_customers(tests.fx('store_a'), 10)->'customersCollection'->>'totalCount',
     jsonb_array_length(public.admin_vouchers(tests.fx('store_a'))->'vouchersCollection'->'edges'),
     public.admin_products(tests.fx('store_a'), 10)->'adminSearchProducts'->>'totalCount',
     jsonb_array_length(public.admin_notification_settings(tests.fx('store_a'))
       ->'storeNotificationContactsCollection'->'edges'))),
  '1 1 1 1');
select tests.eq('owner A: the variant cost in the product',
  (select public.admin_product(tests.fx('product_a'))
     ->'productsCollection'->'edges'->0->'node'->'productVariantsCollection'->'edges'->0->'node'
     ->'variantCosts'->>'costPrice'),
  '7.00');
select tests.eq('owner A: search a customer by name and by exact phone',
  (select format('%s %s',
     public.admin_customers(tests.fx('store_a'), 10, p_name => '%ana%')->'customersCollection'->>'totalCount',
     public.admin_customers(tests.fx('store_a'), 1, p_phone => '+5353000001')->'customersCollection'->>'totalCount')),
  '1 1');
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff A: the product, but no cost',
  (select coalesce(public.admin_product(tests.fx('product_a'))
     ->'productsCollection'->'edges'->0->'node'->'productVariantsCollection'->'edges'->0->'node'
     ->>'variantCosts', '-')),
  '-');
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B on store A: no customers, vouchers, drafts nor contacts',
  (select format('%s %s %s %s %s',
     public.admin_customers(tests.fx('store_a'), 10)->'customersCollection'->>'totalCount',
     jsonb_array_length(public.admin_vouchers(tests.fx('store_a'))->'vouchersCollection'->'edges'),
     public.admin_products(tests.fx('store_a'), 10)->'adminSearchProducts'->>'totalCount',
     jsonb_array_length(public.admin_product(tests.fx('product_a'))->'productsCollection'->'edges'),
     jsonb_array_length(public.admin_notification_settings(tests.fx('store_a'))
       ->'storeNotificationContactsCollection'->'edges'))),
  '0 0 0 0 0');
select tests.check('owner B on store A: no code nor cost anywhere',
  (select not (concat(public.admin_vouchers(tests.fx('store_a')), public.admin_product(tests.fx('product_a')),
     public.admin_variant_search(tests.fx('store_a'), 'Borrador'))::text ~* '(SECRETO10|costPrice|Borrador Secreto)')));
select tests.logout();

-- store_team (Admin › Equipo through the API): service role only, the members of that store and nothing else.
select tests.login('owner_a');
select tests.check('authenticated: cannot call store_team (e-mails of the staff)',
  tests.throws(format('select * from public.store_team(%L)', tests.fx('store_a'))));
select tests.logout();
select tests.eq('store_team: the owner and the staff of store A, with their e-mail',
  (select string_agg(role::text || ':' || (email is not null)::text, ',' order by role::text)
   from public.store_team(tests.fx('store_a'))),
  'owner:true,staff:true');
