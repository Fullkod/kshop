-- Phase 7: app builds. Owner/admin read the builds of their store, the superadmin all (also the admin app's);
-- staff, customers, other stores and anon nothing. Anyone reads app_info: availability and the latest published build.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');
select tests.create_user('root', '{"role": "superadmin"}');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Apps Test A', 'apps-test-a', tests.fx('owner_a'), 'CUP', 'AA', '5351111111', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Apps Test B', 'apps-test-b', tests.fx('owner_b'), 'CUP', 'AB', '5352222222', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');
select tests.create_user('cust_a', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_a')));

insert into public.store_app_builds (store_id, app_id, version_code, version_name, apk_path, size_bytes, published)
values
  (tests.fx('store_a'), 'com.fullkod.kshop.apps_test_a', 1, '1.0.0', 'stores/a/app/v1.apk', 6000000, true),
  (tests.fx('store_a'), 'com.fullkod.kshop.apps_test_a', 2, '1.1.0', 'stores/a/app/v2.apk', 6100000, true),
  (tests.fx('store_a'), 'com.fullkod.kshop.apps_test_a', 3, '1.2.0-beta', 'stores/a/app/v3.apk', null, false),
  (tests.fx('store_b'), 'com.fullkod.kshop.apps_test_b', 1, '1.0.0', 'stores/b/app/v1.apk', null, true),
  (null, 'com.fullkod.kshop.admin', 7, '0.7.0', 'platform/admin/v7.apk', null, true);
insert into public.store_app_requests (store_id, requested_by)
values (tests.fx('store_a'), tests.fx('owner_a')), (tests.fx('store_b'), tests.fx('owner_b'));

-- ---------------------------------------------------------------------------
-- Schema rules
-- ---------------------------------------------------------------------------

select tests.check('a version code is unique per app', tests.throws(format(
  $$insert into public.store_app_builds (store_id, app_id, version_code, version_name, apk_path)
    values (%L, 'com.fullkod.kshop.apps_test_a', 2, 'x', 'p')$$, tests.fx('store_a'))));
select tests.check('the admin app has no store and a store app has one', tests.throws(format(
  $$insert into public.store_app_builds (store_id, app_id, version_code, version_name, apk_path)
    values (%L, 'com.fullkod.kshop.admin', 9, 'x', 'p')$$, tests.fx('store_a')))
  and tests.throws($$insert into public.store_app_builds (store_id, app_id, version_code, version_name, apk_path)
    values (null, 'com.fullkod.kshop.otra', 1, 'x', 'p')$$));
select tests.check('the app id follows com.fullkod.kshop.<name>', tests.throws(format(
  $$insert into public.store_app_builds (store_id, app_id, version_code, version_name, apk_path)
    values (%L, 'com.otra.app', 1, 'x', 'p')$$, tests.fx('store_a'))));

-- ---------------------------------------------------------------------------
-- app_info: availability (D15) and the latest published build (D10)
-- ---------------------------------------------------------------------------

select tests.eq('app_info: the store app is available on Base and offers the latest published build',
  (select format('%s|%s|%s', i ->> 'available', i -> 'latest' ->> 'version_code', i -> 'latest' ->> 'version_name')
   from public.app_info(tests.fx('store_a')) i), 'true|2|1.1.0');
select tests.eq('app_info: the admin app', (public.app_info() -> 'latest' ->> 'version_code'), '7');
select tests.eq('app_info: an unknown store is not available',
  public.app_info(gen_random_uuid()) ->> 'available', 'false');

update public.stores set status = 'suspended' where id = tests.fx('store_a');
select tests.eq('app_info: a suspended store says so and is not available',
  (select (i ->> 'available') || '|' || (i ->> 'store_status') from public.app_info(tests.fx('store_a')) i),
  'false|suspended');
update public.stores set status = 'active' where id = tests.fx('store_a');

update public.store_modules set enabled = false where store_id = tests.fx('store_b') and module_code = 'mobile_app';
select tests.eq('app_info: without mobile_app the app is not available and offers no download',
  (select (i ->> 'available') || '|' || coalesce(i ->> 'latest', '-') from public.app_info(tests.fx('store_b')) i),
  'false|-');
update public.store_modules set enabled = true where store_id = tests.fx('store_b') and module_code = 'mobile_app';

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.check('anon: no builds', tests.throws('select count(*) from public.store_app_builds'));
select tests.check('anon: no app requests', tests.throws('select count(*) from public.store_app_requests'));
select tests.eq('anon: app_info works', public.app_info(tests.fx('store_a')) ->> 'available', 'true');
select tests.logout();

select tests.login('cust_a');
select tests.eq('customer: no builds', (select count(*) from public.store_app_builds)::int, 0);
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff A: no builds', (select count(*) from public.store_app_builds)::int, 0);
select tests.eq('staff A: no app requests', (select count(*) from public.store_app_requests)::int, 0);
select tests.logout();

select tests.login('owner_a');
select tests.eq('owner A: the builds of A only (also unpublished)', (select count(*) from public.store_app_builds)::int, 3);
select tests.eq('owner A: only the app request of A', (select count(*) from public.store_app_requests)::int, 1);
select tests.eq('owner A: cannot write app requests', tests.affected(format(
  $$delete from public.store_app_requests where store_id = %L$$, tests.fx('store_a'))), -1);
select tests.eq('owner A: cannot write builds', tests.affected(format(
  $$update public.store_app_builds set published = true where store_id = %L$$, tests.fx('store_a'))), -1);
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B: nothing of A',
  (select count(*) from public.store_app_builds where store_id = tests.fx('store_a'))::int, 0);
select tests.logout();

select tests.login('root');
select tests.eq('superadmin: every build of these stores and the admin app',
  (select count(*) from public.store_app_builds
   where store_id in (tests.fx('store_a'), tests.fx('store_b')) or store_id is null)::int >= 5, true);
select tests.eq('superadmin: every app request of these stores',
  (select count(*) from public.store_app_requests
   where store_id in (tests.fx('store_a'), tests.fx('store_b')))::int, 2);
select tests.logout();
