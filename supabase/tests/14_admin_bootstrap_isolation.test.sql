-- R11: admin_bootstrap and admin_to_confirm (the admin boots through PostgREST, not pg_graphql). The staff of a store
-- get its role, modules, limits, subscription and status; the staff of another store, customers get nothing of it;
-- anon cannot call them.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');
select tests.create_user('root', '{"role": "superadmin"}');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Bootstrap Test A', 'bootstrap-test-a', tests.fx('owner_a'), 'CUP', 'TA', '5351111111', 'pro', 30, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Bootstrap Test B', 'bootstrap-test-b', tests.fx('owner_b'), 'CUP', 'TB', '5352222222', 'base', 30, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');
select tests.create_user('cust_a', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_a')));

-- What the owner should see, read as the database owner.
create temp table expected as
select (select count(distinct sm.module_code) from public.store_modules sm
        where sm.store_id = tests.fx('store_a') and sm.enabled
          and sm.starts_at <= now() and (sm.ends_at is null or sm.ends_at > now())) as modules,
       (select count(*) from public.orders o
        where o.store_id = tests.fx('store_a') and o.status = 'pending_confirmation') as to_confirm;
grant select on pg_temp.expected to public;

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.check('anon: cannot call admin_bootstrap nor admin_to_confirm',
  tests.throws(format('select public.admin_bootstrap(%L)', tests.fx('store_a')))
  and tests.throws(format('select public.admin_to_confirm(%L)', tests.fx('store_a'))));
select tests.logout();

select tests.login('owner_a');
select tests.eq('owner A: role, status and subscription of its store',
  (select format('%s %s %s', b->>'role', b->>'storeStatus', b->'subscription'->>'status')
   from (select public.admin_bootstrap(tests.fx('store_a')) b) x),
  'owner active trialing');
select tests.check('owner A: its modules (plan Pro) and limits',
  (select jsonb_array_length(b->'modules') = (select modules from pg_temp.expected)
     and jsonb_array_length(b->'modules') > 0 and jsonb_typeof(b->'limits') = 'object'
   from (select public.admin_bootstrap(tests.fx('store_a')) b) x));
select tests.eq('owner A: not superadmin',
  (select (public.admin_bootstrap(tests.fx('store_a'))->>'isSuperadmin')::boolean), false);
select tests.eq('owner A: orders to confirm',
  (select (public.admin_bootstrap(tests.fx('store_a'))->>'toConfirm')::bigint), (select to_confirm from pg_temp.expected));
select tests.eq('owner A: admin_to_confirm agrees',
  public.admin_to_confirm(tests.fx('store_a'))::bigint, (select to_confirm from pg_temp.expected));
select tests.check('owner A: addon prices of the catalog',
  (select jsonb_typeof(public.admin_bootstrap(tests.fx('store_a'))->'addonPrices') = 'object'));
select tests.check('owner A: no cost or secret field in the bootstrap',
  (select not (public.admin_bootstrap(tests.fx('store_a'))::text ~* '(cost|price_override|notes|limit_overrides)')));
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff A: its role in store A',
  (select public.admin_bootstrap(tests.fx('store_a'))->>'role'), 'staff');
select tests.logout();

select tests.login('owner_b');
-- The status of an active store is public (its storefront card); nothing else is.
select tests.eq('owner B on store A: no role, modules nor subscription (status is public)',
  (select format('%s|%s|%s|%s', coalesce(b->>'role', '-'), jsonb_array_length(b->'modules'),
     coalesce(b->'subscription'->>'status', '-'), coalesce(b->>'storeStatus', '-'))
   from (select public.admin_bootstrap(tests.fx('store_a')) b) x),
  '-|0|-|active');
select tests.eq('owner B on store A: limits empty', (select public.admin_bootstrap(tests.fx('store_a'))->'limits'),
  '{}'::jsonb);
select tests.eq('owner B on store A: 0 orders to confirm', public.admin_to_confirm(tests.fx('store_a')), 0);
select tests.logout();

select tests.login('cust_a');
select tests.eq('customer of A: no role, modules nor subscription',
  (select format('%s|%s|%s', coalesce(b->>'role', '-'), jsonb_array_length(b->'modules'),
     coalesce(b->'subscription'->>'status', '-'))
   from (select public.admin_bootstrap(tests.fx('store_a')) b) x),
  '-|0|-');
select tests.logout();

select tests.login('root');
select tests.eq('superadmin: sees store A without being a member',
  (select format('%s %s %s', coalesce(b->>'role', '-'), b->>'isSuperadmin', b->>'storeStatus')
   from (select public.admin_bootstrap(tests.fx('store_a')) b) x),
  '- true active');
select tests.logout();

-- ---------------------------------------------------------------------------
-- api_guard: the API's role + store status check, service_role only
-- ---------------------------------------------------------------------------

select tests.login('owner_a');
select tests.check('authenticated: cannot call api_guard',
  tests.throws(format('select public.api_guard(%L, %L)', tests.fx('owner_a'), tests.fx('store_a'))));
select tests.logout();

select tests.login_anon();
select tests.check('anon: cannot call api_guard',
  tests.throws(format('select public.api_guard(%L, %L)', tests.fx('owner_a'), tests.fx('store_a'))));
select tests.logout();

select tests.eq('api_guard: role and status of a member',
  (select format('%s %s', g->>'role', g->>'storeStatus')
   from (select public.api_guard(tests.fx('staff_a'), tests.fx('store_a')) g) x),
  'staff active');
select tests.eq('api_guard: no role in another store',
  (select coalesce(g->>'role', '-') || ' ' || (g->>'storeStatus')
   from (select public.api_guard(tests.fx('owner_b'), tests.fx('store_a')) g) x),
  '- active');
select tests.eq('api_guard: unknown store',
  (select coalesce(g->>'role', '-') || ' ' || coalesce(g->>'storeStatus', '-')
   from (select public.api_guard(tests.fx('owner_a'), gen_random_uuid()) g) x),
  '- -');
