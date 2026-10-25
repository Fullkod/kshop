-- Phase 0b: entitlements, store creation and storage.

-- ---------------------------------------------------------------------------
-- Entitlements (read by the admin UI through pg_graphql and by the API)
-- ---------------------------------------------------------------------------

create function private.can_manage_store(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.role()) = 'service_role'
      or (select private.is_superadmin())
      or (select private.has_store_role(p_store_id, 'staff'));
$$;

revoke all on function private.can_manage_store(uuid) from public;
grant execute on function private.can_manage_store(uuid) to authenticated, service_role;

-- Active modules of a store; when a module comes from several sources the strongest wins (grant > addon > plan).
create function public.store_entitlements(p_store_id uuid)
returns table (module_code text, source public.module_source, limits jsonb, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (sm.module_code) sm.module_code, sm.source, sm.limits, sm.ends_at
  from public.store_modules sm
  where sm.store_id = p_store_id
    and (select private.can_manage_store(p_store_id))
    and (select private.store_has_module(p_store_id, sm.module_code))
    and sm.enabled
    and sm.starts_at <= now()
    and (sm.ends_at is null or sm.ends_at > now())
  order by sm.module_code, sm.source desc;
$$;

-- Plan limits of the store's current subscription, e.g. {"max_staff": 2}.
create function public.store_limits(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(pl.key, pl.value), '{}'::jsonb)
  from public.subscriptions s
  join public.plan_limits pl on pl.plan_id = s.plan_id
  where s.store_id = p_store_id
    and (select private.can_manage_store(p_store_id));
$$;

revoke all on function public.store_entitlements(uuid) from public, anon;
revoke all on function public.store_limits(uuid) from public, anon;
grant execute on function public.store_entitlements(uuid) to authenticated, service_role;
grant execute on function public.store_limits(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Store creation: one transaction for store, primary subdomain, owner, subscription and plan modules.
-- Called only by the server with the secret key (service_role); hidden from pg_graphql for other roles.
-- ---------------------------------------------------------------------------

create function public.create_store(
  p_name text,
  p_slug text,
  p_owner_id uuid,
  p_base_currency text,
  p_order_prefix text,
  p_whatsapp_phone text,
  p_plan_code text,
  p_trial_days int,
  p_platform_domain text,
  p_created_by uuid
)
returns public.stores
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_store public.stores;
begin
  select * into v_plan from public.plans where code = p_plan_code;
  if not found then
    raise exception 'Unknown plan %', p_plan_code using errcode = 'P0002';
  end if;

  insert into public.stores (slug, name, base_currency, order_prefix, whatsapp_phone, created_by)
  values (lower(p_slug), p_name, p_base_currency, upper(p_order_prefix), nullif(p_whatsapp_phone, ''), p_created_by)
  returning * into v_store;

  insert into public.store_domains (store_id, domain, type, is_primary, verified_at)
  values (v_store.id, v_store.slug || '.' || lower(p_platform_domain), 'subdomain', true, now());

  insert into public.store_members (store_id, user_id, role)
  values (v_store.id, p_owner_id, 'owner');

  insert into public.subscriptions (store_id, plan_id, status, trial_ends_at)
  values (
    v_store.id,
    v_plan.id,
    case when p_trial_days > 0 then 'trialing' else 'active' end::public.subscription_status,
    case when p_trial_days > 0 then now() + make_interval(days => p_trial_days) end
  );

  insert into public.store_modules (store_id, module_code, source, limits)
  select v_store.id, pm.module_code, 'plan', pm.limits
  from public.plan_modules pm
  where pm.plan_id = v_plan.id;

  return v_store;
end;
$$;

revoke all on function public.create_store(text, text, uuid, text, text, text, text, int, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_store(text, text, uuid, text, text, text, text, int, text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Storage: one bucket, paths stores/{store_id}/..., public read, staff of that store writes.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-media',
  'store-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
)
on conflict (id) do nothing;

create function private.storage_store_id(p_object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_object_name))[1] = 'stores'
      then private.try_uuid((storage.foldername(p_object_name))[2])
  end;
$$;

revoke all on function private.storage_store_id(text) from public;
grant execute on function private.storage_store_id(text) to anon, authenticated, service_role;

create policy "store-media: staff insert in own store"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'store-media'
  and (select private.has_store_role(private.storage_store_id(name), 'staff'))
);

create policy "store-media: staff update in own store"
on storage.objects for update
to authenticated
using (
  bucket_id = 'store-media'
  and (select private.has_store_role(private.storage_store_id(name), 'staff'))
)
with check (
  bucket_id = 'store-media'
  and (select private.has_store_role(private.storage_store_id(name), 'staff'))
);

create policy "store-media: staff delete in own store"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'store-media'
  and (select private.has_store_role(private.storage_store_id(name), 'staff'))
);

-- Listing (select) is limited to the store's staff; public files are still served by their public URL.
create policy "store-media: staff list own store"
on storage.objects for select
to authenticated
using (
  bucket_id = 'store-media'
  and (select private.has_store_role(private.storage_store_id(name), 'staff'))
);
