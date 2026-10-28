-- R11 (admin performance): the admin boots with ONE call to /api/v1/me?storeId= instead of /me followed by the
-- StoreEntitlements pg_graphql query. The first pg_graphql query of each connection rebuilds the GraphQL schema
-- (~200 ms of CPU, 2–8 s on a throttled Nano, then 57014); this function goes through PostgREST (RPC) and returns
-- everything the admin shell needs in one statement.
--
-- security invoker: RLS decides what comes back. The staff of the store and the superadmin get the store; anyone else
-- gets empty modules, no subscription and no status (the API answers 403 before calling it anyway). Never costs.

create function public.admin_bootstrap(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'role', (select sm.role from public.store_members sm
      where sm.store_id = p_store_id and sm.user_id = (select auth.uid())),
    'isSuperadmin', (select private.is_superadmin()),
    'modules', coalesce((select jsonb_agg(jsonb_build_object(
        'code', e.module_code, 'source', e.source, 'limits', e.limits, 'endsAt', e.ends_at) order by e.module_code)
      from public.store_entitlements(p_store_id) e), '[]'::jsonb),
    'limits', public.store_limits(p_store_id),
    'subscription', (select jsonb_build_object('status', s.status, 'trialEndsAt', s.trial_ends_at)
      from public.subscriptions s where s.store_id = p_store_id limit 1),
    'storeStatus', (select st.status from public.stores st where st.id = p_store_id),
    'addonPrices', coalesce((select jsonb_object_agg(m.code, m.addon_price)
      from public.modules m where m.addon_price is not null), '{}'::jsonb),
    'toConfirm', (select count(*) from public.orders o
      where o.store_id = p_store_id and o.status = 'pending_confirmation')
  );
$$;

revoke all on function public.admin_bootstrap(uuid) from public, anon;
grant execute on function public.admin_bootstrap(uuid) to authenticated, service_role;

-- The bell of the admin (orders waiting for confirmation), read again on every order signal (Realtime) instead of the
-- whole admin_home_summary (838 calls in 81 h, p95 5.5 s in production).
create function public.admin_to_confirm(p_store_id uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer from public.orders o
  where o.store_id = p_store_id and o.status = 'pending_confirmation';
$$;

revoke all on function public.admin_to_confirm(uuid) from public, anon;
grant execute on function public.admin_to_confirm(uuid) to authenticated, service_role;
