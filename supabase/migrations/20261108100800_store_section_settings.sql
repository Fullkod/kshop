-- R12 (superadmin v3): the superadmin decides, store by store, how its staff sees each section of the admin menu.
--   no row  = visible (default)
--   managed = the staff sees it but only the superadmin changes it («Gestionado por admin»)
--   hidden  = the staff does not see it
-- Visibility never switches a module off nor deletes data: the storefront keeps using it. The basic sections (Inicio,
-- Pedidos, Clientes, Catálogo, Plan y facturación, Equipo) are never configurable (Roberto, 2026-10-28), so only the
-- non-core modules are allowed here (keep the list in sync with CONFIGURABLE_SECTIONS in @kshop/core; a test checks it).
-- The API blocks the staff's writes in managed/hidden sections (assertStoreWritable, from api_guard); reads go on.

create type public.section_visibility as enum ('managed', 'hidden');

create table public.store_section_settings (
  store_id uuid not null references public.stores (id) on delete cascade,
  section text not null references public.modules (code) check (section in (
    'shipping', 'discounts', 'vouchers', 'whatsapp_notifications', 'excel_import', 'multi_warehouse',
    'multi_currency', 'themes', 'custom_domain', 'mobile_app', 'sales_today', 'finance')),
  visibility public.section_visibility not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (store_id, section)
);

alter table public.store_section_settings enable row level security;

-- The staff of the store (its admin draws the menu from it) and the superadmin read; only service_role writes
-- (the superadmin's API), so there is no write policy.
create policy store_section_settings_select on public.store_section_settings
for select to authenticated
using (
  store_id in (select private.my_store_ids())
  or (select private.is_superadmin())
);

revoke all on public.store_section_settings from anon, authenticated;
grant select on public.store_section_settings to authenticated;

-- A change reaches the open admin of the store (topic store:{id}) and the superadmin's panel.
create trigger store_section_settings_realtime after insert or update or delete on public.store_section_settings
for each row execute function private.realtime_signal();

-- ---------------------------------------------------------------------------
-- admin_bootstrap + sections ({ "<section>": "managed" | "hidden" }; RLS decides, so another store gets {})
-- ---------------------------------------------------------------------------

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
    'toConfirm', (select count(*) from public.orders o
      where o.store_id = p_store_id and o.status = 'pending_confirmation'),
    'sections', coalesce((select jsonb_object_agg(ss.section, ss.visibility)
      from public.store_section_settings ss where ss.store_id = p_store_id), '{}'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- api_guard + sections (the write guard needs no other query)
-- ---------------------------------------------------------------------------

create or replace function public.api_guard(p_user_id uuid, p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'role', (select sm.role from public.store_members sm
      where sm.store_id = p_store_id and sm.user_id = p_user_id),
    'storeStatus', st.status,
    'suspendedReason', st.suspended_reason,
    'sections', coalesce((select jsonb_object_agg(ss.section, ss.visibility)
      from public.store_section_settings ss where ss.store_id = p_store_id), '{}'::jsonb)
  )
  from (select 1) one
  left join public.stores st on st.id = p_store_id;
$$;

-- ---------------------------------------------------------------------------
-- Superadmin › Tiendas in one statement (was: stores + auth.admin.listUsers(perPage 1000) on every load)
-- ---------------------------------------------------------------------------

create function public.platform_stores_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.item order by s.created_at desc), '[]'::jsonb)
  from public.stores s
  cross join lateral (
    select jsonb_build_object(
      'id', s.id,
      'slug', s.slug,
      'name', s.name,
      'status', s.status,
      'suspendedReason', s.suspended_reason,
      'baseCurrency', s.base_currency,
      'createdAt', s.created_at,
      'primaryDomain', (select d.domain from public.store_domains d
        where d.store_id = s.id and d.is_primary limit 1),
      'plan', (select jsonb_build_object('code', p.code, 'name', p.name)
        from public.subscriptions sub join public.plans p on p.id = sub.plan_id
        where sub.store_id = s.id limit 1),
      'subscriptionStatus', sub.status,
      'trialEndsAt', sub.trial_ends_at,
      'currentPeriodEnd', sub.current_period_end,
      'owner', (select jsonb_build_object('id', u.id, 'email', u.email, 'lastSignInAt', u.last_sign_in_at)
        from public.store_members m join auth.users u on u.id = m.user_id
        where m.store_id = s.id and m.role = 'owner'
        order by m.created_at limit 1),
      'amountDue', coalesce((select sum(i.total - i.amount_paid) from public.platform_invoices i
        where i.store_id = s.id and i.status = 'pending'), 0),
      'nextDueAt', (select min(i.due_at) from public.platform_invoices i
        where i.store_id = s.id and i.status = 'pending'),
      'orders30d', (select count(*) from public.orders o
        where o.store_id = s.id and o.created_at > now() - interval '30 days'),
      'lastOrderAt', (select max(o.created_at) from public.orders o where o.store_id = s.id),
      'products', (select count(*) from public.products pr where pr.store_id = s.id)
    ) as item
    from (select 1) one
    left join public.subscriptions sub on sub.store_id = s.id
  ) x;
$$;

revoke all on function public.platform_stores_overview() from public, anon, authenticated;
grant execute on function public.platform_stores_overview() to service_role;
