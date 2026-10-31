-- Phase 0b: isolation between stores A and B on the platform tables, functions and storage.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('superadmin', '{"role": "superadmin"}');
select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');
select tests.create_user('outsider');
-- A customer account of store A (synthetic email, store_id claim) is not staff of anything.
select tests.create_user('customer_a', '{}');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'RLS Test A', 'rls-test-a', tests.fx('owner_a'), 'CUP', 'TA', null, 'base', 30, 'kshop.fullkod.com', tests.fx('superadmin')
)).id;

insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'RLS Test B', 'rls-test-b', tests.fx('owner_b'), 'USD', 'TB', '+5351234567', 'pro', 0, 'kshop.fullkod.com', tests.fx('superadmin')
)).id;

update auth.users
set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('store_id', tests.fx('store_a'))
where id = tests.fx('customer_a');

insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');

insert into private.store_private_config (store_id, key, value)
values (tests.fx('store_a'), 'secret', '"a"'), (tests.fx('store_b'), 'secret', '"b"');

insert into storage.objects (bucket_id, name)
values ('store-media', 'stores/' || tests.fx('store_a') || '/logo.png'),
       ('store-media', 'stores/' || tests.fx('store_b') || '/logo.png');

-- ---------------------------------------------------------------------------
-- create_store did the whole setup in one transaction
-- ---------------------------------------------------------------------------

select tests.eq('create_store: A has its primary subdomain',
  (select domain from public.store_domains where store_id = tests.fx('store_a') and is_primary), 'rls-test-a.kshop.fullkod.com');
select tests.eq('create_store: A owner is a member',
  (select role::text from public.store_members where store_id = tests.fx('store_a') and user_id = tests.fx('owner_a')), 'owner');
select tests.eq('create_store: A (base) gets 8 plan modules (themes is Pro since phase 5)',
  (select count(*) from public.store_modules where store_id = tests.fx('store_a'))::int, 8);
select tests.eq('create_store: B (pro) gets all 15 modules (vouchers since phase 5)',
  (select count(*) from public.store_modules where store_id = tests.fx('store_b'))::int, 15);
select tests.eq('create_store: A is trialing, B without trial is active',
  (select string_agg(status::text, ',' order by store_id = tests.fx('store_b')) from public.subscriptions
    where store_id in (tests.fx('store_a'), tests.fx('store_b'))), 'trialing,active');
select tests.check('create_store: reserved slug is rejected', tests.throws(format(
  $$select public.create_store('X', 'superadmin', %L, 'CUP', 'X', null, 'base', 0, 'kshop.fullkod.com', null)$$,
  tests.fx('owner_a'))));
select tests.check('create_store: duplicated slug is rejected', tests.throws(format(
  $$select public.create_store('X', 'rls-test-a', %L, 'CUP', 'X', null, 'base', 0, 'kshop.fullkod.com', null)$$,
  tests.fx('owner_a'))));

-- ---------------------------------------------------------------------------
-- anon (storefront visitor)
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.eq('anon: sees both public store cards',
  (select count(*) from public.stores where slug in ('rls-test-a', 'rls-test-b'))::int, 2);
select tests.check('anon: cannot read stores.settings', tests.throws('select settings from public.stores'));
select tests.check('anon: cannot read stores.created_by', tests.throws('select created_by from public.stores'));
select tests.check('anon: cannot read store_members', tests.throws('select * from public.store_members'));
select tests.check('anon: cannot read store_domains', tests.throws('select * from public.store_domains'));
select tests.check('anon: cannot read store_modules', tests.throws('select * from public.store_modules'));
select tests.check('anon: cannot read subscriptions', tests.throws('select * from public.subscriptions'));
select tests.check('anon: cannot read private config', tests.throws('select * from private.store_private_config'));
select tests.check('anon: reads the module catalog', (select count(*) from public.modules) = 15);
select tests.check('anon: cannot call store_entitlements',
  tests.throws(format('select * from public.store_entitlements(%L)', tests.fx('store_a'))));
select tests.check('anon: cannot call create_store', tests.throws(format(
  $$select public.create_store('X', 'anon-store', %L, 'CUP', 'X', null, 'base', 0, 'kshop.fullkod.com', null)$$,
  tests.fx('owner_a'))));
select tests.eq('anon: cannot insert stores',
  tests.affected($$insert into public.stores (slug, name, order_prefix) values ('anon-x', 'Anon', 'X')$$), -1);
select tests.eq('anon: cannot upload to a store folder', tests.affected(format(
  $$insert into storage.objects (bucket_id, name) values ('store-media', 'stores/%s/anon.png')$$, tests.fx('store_a'))), -1);

-- ---------------------------------------------------------------------------
-- owner of A
-- ---------------------------------------------------------------------------

select tests.login('owner_a');
select tests.eq('owner A: cannot upload an import to B', tests.affected(format(
  $$insert into storage.objects (bucket_id, name) values ('store-imports', 'stores/%s/imports/intruder.xlsx')$$, tests.fx('store_b'))), -1);
select tests.eq('owner A: sees the 2 members of A',
  (select count(*) from public.store_members where store_id = tests.fx('store_a'))::int, 2);
select tests.eq('owner A: sees no members of B',
  (select count(*) from public.store_members where store_id = tests.fx('store_b'))::int, 0);
select tests.eq('owner A: sees only A domains',
  (select count(*) from public.store_domains where store_id in (tests.fx('store_a'), tests.fx('store_b')))::int, 1);
select tests.eq('owner A: sees no modules of B',
  (select count(*) from public.store_modules where store_id = tests.fx('store_b'))::int, 0);
select tests.eq('owner A: sees no subscription of B',
  (select count(*) from public.subscriptions where store_id = tests.fx('store_b'))::int, 0);
select tests.eq('owner A: entitlements of A',
  (select count(*) from public.store_entitlements(tests.fx('store_a')))::int, 8);
select tests.eq('owner A: entitlements of B are empty',
  (select count(*) from public.store_entitlements(tests.fx('store_b')))::int, 0);
select tests.eq('owner A: limits of A', public.store_limits(tests.fx('store_a')), '{"max_staff": 2, "max_products": 300}'::jsonb);
select tests.eq('owner A: limits of B are empty', public.store_limits(tests.fx('store_b')), '{}'::jsonb);
select tests.check('owner A: cannot read private config', tests.throws('select * from private.store_private_config'));
select tests.eq('owner A: cannot add members directly', tests.affected(format(
  $$insert into public.store_members (store_id, user_id, role) values (%L, %L, 'admin')$$,
  tests.fx('store_a'), tests.fx('outsider'))), -1);
select tests.eq('owner A: cannot update stores directly', tests.affected(format(
  $$update public.stores set name = 'Hacked' where id = %L$$, tests.fx('store_a'))), -1);
select tests.eq('owner A: cannot change module rows', tests.affected(format(
  $$update public.store_modules set enabled = true where store_id = %L$$, tests.fx('store_b'))), -1);
select tests.check('owner A: cannot call create_store', tests.throws(format(
  $$select public.create_store('X', 'owner-store', %L, 'CUP', 'X', null, 'base', 0, 'kshop.fullkod.com', null)$$,
  tests.fx('owner_a'))));
select tests.eq('owner A: lists only A media',
  (select count(*) from storage.objects where bucket_id = 'store-media' and name like 'stores/%')::int, 1);
select tests.eq('owner A: uploads to A folder', tests.affected(format(
  $$insert into storage.objects (bucket_id, name) values ('store-media', 'stores/%s/banner.png')$$, tests.fx('store_a'))), 1);
select tests.eq('owner A: cannot upload to B folder', tests.affected(format(
  $$insert into storage.objects (bucket_id, name) values ('store-media', 'stores/%s/evil.png')$$, tests.fx('store_b'))), -1);
select tests.eq('owner A: cannot upload outside stores/', tests.affected(
  $$insert into storage.objects (bucket_id, name) values ('store-media', 'loose/evil.png')$$), -1);
-- Storage may also block direct deletes with a trigger (-1); either way nothing of B is removed.
select tests.check('owner A: cannot delete B media', tests.affected(format(
  $$delete from storage.objects where bucket_id = 'store-media' and name = 'stores/%s/logo.png'$$, tests.fx('store_b'))) <= 0);

-- ---------------------------------------------------------------------------
-- staff of A
-- ---------------------------------------------------------------------------

select tests.login('staff_a');
select tests.eq('staff A: sees members of A',
  (select count(*) from public.store_members where store_id = tests.fx('store_a'))::int, 2);
select tests.eq('staff A: sees nothing of B',
  (select count(*) from public.store_members where store_id = tests.fx('store_b'))::int
  + (select count(*) from public.store_modules where store_id = tests.fx('store_b'))::int, 0);
select tests.eq('staff A: uploads to A folder', tests.affected(format(
  $$insert into storage.objects (bucket_id, name) values ('store-media', 'stores/%s/staff.png')$$, tests.fx('store_a'))), 1);

-- ---------------------------------------------------------------------------
-- signed-in users that are not staff
-- ---------------------------------------------------------------------------

select tests.login('outsider');
select tests.eq('outsider: sees no members, domains, modules or subscriptions',
  (select count(*) from public.store_members)::int
  + (select count(*) from public.store_domains)::int
  + (select count(*) from public.store_modules)::int
  + (select count(*) from public.subscriptions)::int, 0);
select tests.eq('outsider: entitlements of A are empty',
  (select count(*) from public.store_entitlements(tests.fx('store_a')))::int, 0);
select tests.eq('outsider: cannot upload to A folder', tests.affected(format(
  $$insert into storage.objects (bucket_id, name) values ('store-media', 'stores/%s/x.png')$$, tests.fx('store_a'))), -1);

select tests.login('customer_a');
select tests.eq('customer of A: is not staff of A',
  (select count(*) from public.store_members where store_id = tests.fx('store_a'))::int
  + (select count(*) from public.store_entitlements(tests.fx('store_a')))::int, 0);
select tests.eq('customer of A: cannot upload to A folder', tests.affected(format(
  $$insert into storage.objects (bucket_id, name) values ('store-media', 'stores/%s/x.png')$$, tests.fx('store_a'))), -1);

-- ---------------------------------------------------------------------------
-- superadmin
-- ---------------------------------------------------------------------------

select tests.login('superadmin');
select tests.eq('superadmin: sees members of A and B',
  (select count(*) from public.store_members where store_id in (tests.fx('store_a'), tests.fx('store_b')))::int, 3);
select tests.eq('superadmin: sees both subscriptions',
  (select count(*) from public.subscriptions where store_id in (tests.fx('store_a'), tests.fx('store_b')))::int, 2);
select tests.eq('superadmin: entitlements of B',
  (select count(*) from public.store_entitlements(tests.fx('store_b')))::int, 15);
select tests.eq('superadmin: uploads to the folder of any store', tests.affected(format(
  $$insert into storage.objects (bucket_id, name) values ('store-media', 'stores/%s/platform.png')$$, tests.fx('store_b'))), 1);
select tests.eq('superadmin: cannot upload outside stores/', tests.affected(
  $$insert into storage.objects (bucket_id, name) values ('store-media', 'loose/platform.png')$$), -1);
select tests.eq('superadmin: uploads an import to any store', tests.affected(format(
  $$insert into storage.objects (bucket_id, name) values ('store-imports', 'stores/%s/imports/platform.xlsx')$$, tests.fx('store_b'))), 1);
select tests.eq('superadmin: an import only goes in the imports folder', tests.affected(format(
  $$insert into storage.objects (bucket_id, name) values ('store-imports', 'stores/%s/other/platform.xlsx')$$, tests.fx('store_b'))), -1);
select tests.check('superadmin: still cannot read private config via API roles',
  tests.throws('select * from private.store_private_config'));

select tests.logout();
select tests.eq('B media is still there',
  (select count(*) from storage.objects where name = 'stores/' || tests.fx('store_b') || '/logo.png')::int, 1);

-- ---------------------------------------------------------------------------
-- Disabling a module hides it without deleting data
-- ---------------------------------------------------------------------------

update public.store_modules set enabled = false where store_id = tests.fx('store_a') and module_code = 'discounts';
select tests.login('owner_a');
select tests.eq('module off: discounts leaves A entitlements',
  (select count(*) from public.store_entitlements(tests.fx('store_a')) where module_code = 'discounts')::int, 0);
select tests.logout();
select tests.eq('module off: the store_modules row is kept',
  (select count(*) from public.store_modules where store_id = tests.fx('store_a') and module_code = 'discounts')::int, 1);
