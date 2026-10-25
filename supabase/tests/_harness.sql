-- Minimal SQL test harness for RLS tests (prepended to every *.test.sql by scripts/db.mjs).
-- Tests run through the Management API inside a transaction that is always rolled back.
-- Results go to pg_temp.results; the runner reads them before the rollback.

create temp table results (seq serial, name text not null, ok boolean not null, detail text);
grant select, insert on pg_temp.results to public;
grant usage on sequence pg_temp.results_seq_seq to public;

-- Named fixtures (users, stores) so tests can refer to them after switching roles.
create temp table fixtures (key text primary key, id uuid not null);
grant select on pg_temp.fixtures to public;

create schema tests;
grant usage on schema tests to public;

create function tests.fx(p_key text)
returns uuid
language sql
stable
as $$
  select id from pg_temp.fixtures where key = p_key;
$$;

create function tests.check(p_name text, p_ok boolean, p_detail text default null)
returns void
language sql
as $$
  insert into pg_temp.results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail);
$$;

-- Equality check that reports both values on failure.
create function tests.eq(p_name text, p_actual anyelement, p_expected anyelement)
returns void
language sql
as $$
  select tests.check(
    p_name,
    p_actual is not distinct from p_expected,
    format('got %s, expected %s', p_actual, p_expected)
  );
$$;

-- True when the statement raises (permission denied, RLS violation, check failure...).
create function tests.throws(p_sql text)
returns boolean
language plpgsql
as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;

-- Rows affected by a statement, or -1 when it raises.
create function tests.affected(p_sql text)
returns int
language plpgsql
as $$
declare
  v_count int;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
exception when others then
  return -1;
end;
$$;

create function tests.create_user(p_key text, p_app_metadata jsonb default '{}')
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_key || '-' || left(v_id::text, 8) || '@rls-tests.kshop.invalid',
    '{"provider": "email"}'::jsonb || p_app_metadata,
    '{}'::jsonb,
    now(),
    now()
  );
  insert into pg_temp.fixtures (key, id) values (p_key, v_id);
  return v_id;
end;
$$;

-- Acts as a signed-in user: same claims PostgREST/pg_graphql would set from the JWT.
create function tests.login(p_key text)
returns void
language plpgsql
as $$
declare
  v_user auth.users;
begin
  reset role;
  select * into v_user from auth.users where id = tests.fx(p_key);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_user.id,
      'role', 'authenticated',
      'email', v_user.email,
      'app_metadata', v_user.raw_app_meta_data
    )::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

create function tests.login_anon()
returns void
language plpgsql
as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

create function tests.logout()
returns void
language plpgsql
as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

grant execute on all functions in schema tests to public;
