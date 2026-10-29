-- R12: store_section_settings (visibility of the admin menu sections), its place in admin_bootstrap and api_guard,
-- and platform_stores_overview. The staff of a store reads its own settings only; nobody but service_role writes
-- them; the basic sections cannot be configured; the store overview is service_role only.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');
select tests.create_user('root', '{"role": "superadmin"}');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Sections Test A', 'sections-test-a', tests.fx('owner_a'), 'CUP', 'SA', '5351111111', 'pro', 30, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Sections Test B', 'sections-test-b', tests.fx('owner_b'), 'CUP', 'SB', '5352222222', 'base', 30, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');
select tests.create_user('cust_a', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_a')));

insert into public.store_section_settings (store_id, section, visibility) values
  (tests.fx('store_a'), 'shipping', 'managed'),
  (tests.fx('store_a'), 'finance', 'hidden'),
  (tests.fx('store_b'), 'themes', 'hidden');

select tests.check('basic sections cannot be configured (orders, catalog)',
  tests.throws(format($$insert into public.store_section_settings (store_id, section, visibility)
    values (%L, 'orders', 'hidden')$$, tests.fx('store_a')))
  and tests.throws(format($$insert into public.store_section_settings (store_id, section, visibility)
    values (%L, 'catalog', 'managed')$$, tests.fx('store_a'))));
select tests.check('an unknown section is rejected',
  tests.throws(format($$insert into public.store_section_settings (store_id, section, visibility)
    values (%L, 'nope', 'hidden')$$, tests.fx('store_a'))));

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.check('anon: cannot read store_section_settings',
  tests.throws('select count(*) from public.store_section_settings'));
select tests.check('anon: cannot call platform_stores_overview',
  tests.throws('select public.platform_stores_overview()'));
select tests.logout();

select tests.login('owner_a');
select tests.eq('owner A: reads the 2 settings of its store and none of B',
  (select count(*) from public.store_section_settings), 2::bigint);
select tests.eq('owner A: sections in admin_bootstrap',
  (select public.admin_bootstrap(tests.fx('store_a'))->'sections'),
  '{"shipping": "managed", "finance": "hidden"}'::jsonb);
select tests.eq('owner A: no sections of store B through admin_bootstrap',
  (select public.admin_bootstrap(tests.fx('store_b'))->'sections'), '{}'::jsonb);
select tests.check('owner A: cannot call platform_stores_overview',
  tests.throws('select public.platform_stores_overview()'));
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff A: reads the settings of its store',
  (select string_agg(section || '=' || visibility, ',' order by section) from public.store_section_settings),
  'finance=hidden,shipping=managed');
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B: only the setting of its own store',
  (select string_agg(section, ',') from public.store_section_settings), 'themes');
select tests.logout();

select tests.login('cust_a');
select tests.eq('customer of A: reads no setting',
  (select count(*) from public.store_section_settings), 0::bigint);
select tests.eq('customer of A: no sections through admin_bootstrap',
  (select public.admin_bootstrap(tests.fx('store_a'))->'sections'), '{}'::jsonb);
select tests.logout();

select tests.login('root');
select tests.eq('superadmin: reads the settings of every store',
  (select count(*) from public.store_section_settings
   where store_id in (tests.fx('store_a'), tests.fx('store_b'))), 3::bigint);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Writes: only service_role (the superadmin's API)
-- ---------------------------------------------------------------------------

select tests.login('owner_a');
select tests.eq('owner A: cannot insert a setting', tests.affected(format(
  $$insert into public.store_section_settings (store_id, section, visibility) values (%L, 'vouchers', 'hidden')$$,
  tests.fx('store_a'))), -1);
select tests.eq('owner A: cannot unhide a section', tests.affected(format(
  $$delete from public.store_section_settings where store_id = %L$$, tests.fx('store_a'))), -1);
select tests.eq('owner A: cannot change a managed section', tests.affected(format(
  $$update public.store_section_settings set visibility = 'hidden' where store_id = %L$$, tests.fx('store_a'))), -1);
select tests.logout();

select tests.login('root');
select tests.eq('superadmin (as authenticated): cannot write directly either', tests.affected(format(
  $$insert into public.store_section_settings (store_id, section, visibility) values (%L, 'vouchers', 'hidden')$$,
  tests.fx('store_b'))), -1);
select tests.logout();

select tests.eq('settings untouched after the attempts',
  (select count(*) from public.store_section_settings
   where store_id in (tests.fx('store_a'), tests.fx('store_b'))), 3::bigint);

-- ---------------------------------------------------------------------------
-- api_guard and platform_stores_overview (service_role / owner)
-- ---------------------------------------------------------------------------

select tests.eq('api_guard: sections of the store',
  (select public.api_guard(tests.fx('staff_a'), tests.fx('store_a'))->'sections'),
  '{"shipping": "managed", "finance": "hidden"}'::jsonb);
select tests.eq('api_guard: unknown store has no sections',
  (select public.api_guard(tests.fx('owner_a'), gen_random_uuid())->'sections'), '{}'::jsonb);

select tests.eq('overview: store A with its owner, plan and counters',
  (select format('%s|%s|%s|%s|%s', e->'owner'->>'id', e->'plan'->>'code', e->>'products', e->>'orders30d',
     e->>'amountDue')
   from jsonb_array_elements(public.platform_stores_overview()) e where e->>'id' = tests.fx('store_a')::text),
  format('%s|pro|0|0|0', tests.fx('owner_a')));
select tests.check('overview: no cost, notes or secret field',
  (select not (public.platform_stores_overview()::text ~* '(cost|notes|encrypted_password|phone)')));
