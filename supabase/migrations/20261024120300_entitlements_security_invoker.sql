-- Entitlement readers run as the caller: RLS on store_modules/subscriptions already limits them to the
-- store's members and the superadmin, so security definer is not needed (and the advisor flags it).
-- store_entitlements now returns store_modules rows so pg_graphql exposes it as a query field.

drop function public.store_entitlements(uuid);

create function public.store_entitlements(p_store_id uuid)
returns setof public.store_modules
language sql
stable
security invoker
set search_path = ''
as $$
  -- When a module comes from several sources the strongest wins (grant > addon > plan).
  select distinct on (sm.module_code) sm.*
  from public.store_modules sm
  where sm.store_id = p_store_id
    and (select private.store_has_module(p_store_id, sm.module_code))
    and sm.enabled
    and sm.starts_at <= now()
    and (sm.ends_at is null or sm.ends_at > now())
  order by sm.module_code, sm.source desc;
$$;

create or replace function public.store_limits(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(pl.key, pl.value), '{}'::jsonb)
  from public.subscriptions s
  join public.plan_limits pl on pl.plan_id = s.plan_id
  where s.store_id = p_store_id;
$$;

revoke all on function public.store_entitlements(uuid) from public, anon;
grant execute on function public.store_entitlements(uuid) to authenticated, service_role;

-- No longer used by any function.
drop function private.can_manage_store(uuid);
