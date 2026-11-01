-- KSH0004: the locks of the admin menu said «PRO» on every module outside the plan. With the «Caja» plan, Entregas,
-- Ofertas or App móvil are a Base away, not a Pro: the boot now says, per module, the cheapest public plan that
-- includes it (`upgrades`: { "shipping": "Base", "finance": "Pro", … }), and both admins write that name on the lock.

create or replace function public.admin_bootstrap(p_store_id uuid)
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
    'upgrades', coalesce((select jsonb_object_agg(x.module_code, x.name) from (
        select distinct on (pm.module_code) pm.module_code, p.name
        from public.plan_modules pm join public.plans p on p.id = pm.plan_id
        where p.is_public
        order by pm.module_code, p.sort_order, p.price) x), '{}'::jsonb),
    'toConfirm', (select count(*) from public.orders o
      where o.store_id = p_store_id and o.status = 'pending_confirmation'),
    'sections', coalesce((select jsonb_object_agg(ss.section, ss.visibility)
      from public.store_section_settings ss where ss.store_id = p_store_id), '{}'::jsonb)
  );
$$;
