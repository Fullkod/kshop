-- Advisors (0028/0029): public functions callable by the API roles run as the caller; the privileged part lives in
-- private definer helpers (pg_graphql does not expose the private schema).

create function private.store_limits_for(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k.key, private.store_limit(p_store_id, k.key))
    filter (where private.store_limit(p_store_id, k.key) is not null), '{}'::jsonb)
  from public.subscriptions s
  cross join lateral (
    select pl.key from public.plan_limits pl where pl.plan_id = s.plan_id
    union
    select jsonb_object_keys(s.limit_overrides)
  ) k
  where s.store_id = p_store_id
    -- No JWT (database owner, migrations) counts as the server, like service_role.
    and (coalesce((select auth.role()), 'service_role') = 'service_role' or p_store_id in (select private.my_store_ids())
      or (select private.is_superadmin()));
$$;

create or replace function public.store_limits(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.store_limits_for(p_store_id);
$$;

create or replace function public.storefront_features(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'multi_currency', private.store_has_module(p_store_id, 'multi_currency'),
    'vouchers', private.store_has_module(p_store_id, 'vouchers'))
  where private.store_is_public(p_store_id);
$$;

revoke all on function private.store_limits_for(uuid) from public;
grant execute on function private.store_limits_for(uuid) to authenticated, service_role;
