-- store_limits reads subscriptions.limit_overrides, a column the API roles cannot select (phase 5.1): it runs as
-- definer and checks itself that the caller belongs to the store (or is the superadmin, or the server).

create or replace function public.store_limits(p_store_id uuid)
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
