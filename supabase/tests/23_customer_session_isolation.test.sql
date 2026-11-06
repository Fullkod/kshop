-- KSH0013: a customer token counts only while its Auth session exists (a password reset deletes the sessions), only
-- in its own store, and the two functions are for the API (service_role) alone.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('owner_b');
select tests.create_user('cust_a');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Sesion Test A', 'sesion-test-a', tests.fx('owner_a'), 'CUP', 'SA', '5351111111', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Sesion Test B', 'sesion-test-b', tests.fx('owner_b'), 'CUP', 'SB', '5352222222', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into public.customers (store_id, user_id, phone, first_name)
values (tests.fx('store_a'), tests.fx('cust_a'), '+5359990001', 'Sesión');
insert into pg_temp.fixtures (key, id) values ('session_1', gen_random_uuid()), ('session_2', gen_random_uuid());
insert into auth.sessions (id, user_id, created_at, updated_at) values
  (tests.fx('session_1'), tests.fx('cust_a'), now(), now()),
  (tests.fx('session_2'), tests.fx('cust_a'), now(), now());

-- ---------------------------------------------------------------------------
-- The API (service_role functions, called as the database owner like the API does)
-- ---------------------------------------------------------------------------

select tests.check('a live session reads the customer',
  public.api_customer(tests.fx('store_a'), tests.fx('cust_a'), tests.fx('session_1')) ->> 'first_name' = 'Sesión');
select tests.check('the customer is not found in another store',
  public.api_customer(tests.fx('store_b'), tests.fx('cust_a'), tests.fx('session_1')) is null);
select tests.check('another user''s session does not count',
  public.api_customer(tests.fx('store_a'), tests.fx('owner_a'), tests.fx('session_1')) is null);
select tests.check('an unknown session does not count',
  public.api_customer(tests.fx('store_a'), tests.fx('cust_a'), gen_random_uuid()) is null);

select public.auth_revoke_user_sessions(tests.fx('cust_a'));
select tests.eq('revoking deletes every session of the user',
  (select count(*) from auth.sessions where user_id = tests.fx('cust_a'))::int, 0);
select tests.check('after the revoke the old token no longer reads the customer',
  public.api_customer(tests.fx('store_a'), tests.fx('cust_a'), tests.fx('session_2')) is null);

-- ---------------------------------------------------------------------------
-- Nobody else can call them
-- ---------------------------------------------------------------------------

select tests.login('cust_a');
select tests.check('a customer cannot call api_customer',
  tests.throws(format('select public.api_customer(%L, %L, %L)', tests.fx('store_a'), tests.fx('cust_a'), tests.fx('session_1'))));
select tests.check('a customer cannot revoke sessions',
  tests.throws(format('select public.auth_revoke_user_sessions(%L)', tests.fx('owner_a'))));

select tests.login('owner_b');
select tests.check('owner B cannot revoke the sessions of A''s customer',
  tests.throws(format('select public.auth_revoke_user_sessions(%L)', tests.fx('cust_a'))));

select tests.login_anon();
select tests.check('anon cannot call api_customer',
  tests.throws(format('select public.api_customer(%L, %L, %L)', tests.fx('store_a'), tests.fx('cust_a'), tests.fx('session_1'))));
select tests.check('anon cannot revoke sessions',
  tests.throws(format('select public.auth_revoke_user_sessions(%L)', tests.fx('cust_a'))));

select tests.logout();
