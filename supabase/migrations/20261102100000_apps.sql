-- Phase 7 (PRP-7 D10, D13, D15): Android builds of the store apps and of the admin app.
-- GitHub Actions compiles and signs; `pnpm app:publish` uploads the APK to store-media and registers it here.
-- The apps ask app_info() when they open: whether the store app may be used and the latest published version.

create table public.store_app_builds (
  id uuid primary key default gen_random_uuid(),
  -- null = the admin app (com.fullkod.kshop.admin).
  store_id uuid references public.stores (id) on delete cascade,
  app_id text not null check (app_id ~ '^com\.fullkod\.kshop\.[a-z][a-z0-9_]*$'),
  version_code integer not null check (version_code > 0),
  version_name text not null check (char_length(version_name) between 1 and 40),
  apk_path text not null check (char_length(apk_path) between 1 and 300),
  size_bytes bigint check (size_bytes is null or size_bytes > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  notes text check (notes is null or char_length(notes) <= 500),
  published boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (app_id, version_code),
  -- A store app is named after its store; the admin app has no store.
  check ((store_id is null) = (app_id = 'com.fullkod.kshop.admin'))
);

create index store_app_builds_store_idx on public.store_app_builds (store_id, created_at desc);
create index store_app_builds_latest_idx on public.store_app_builds (app_id, version_code desc) where published;
create index store_app_builds_created_by_idx on public.store_app_builds (created_by);

revoke all on public.store_app_builds from anon, authenticated;
grant select on public.store_app_builds to authenticated;
alter table public.store_app_builds enable row level security;

-- Owner/admin see the builds of their store; the admin app's builds only the superadmin.
create policy "store_app_builds: store admins" on public.store_app_builds for select
to authenticated
using ((select private.is_superadmin()) or (store_id is not null and private.has_store_role(store_id, 'admin')));

-- What an app needs when it opens (anon): null store = the admin app.
--   { available, store_status, latest: { version_code, version_name, apk_path, size_bytes } | null }
-- A store app is available while the store is active and has mobile_app (D15); a suspended store says so.
create function public.app_info(p_store_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with store as (
    select s.status from public.stores s where s.id = p_store_id
  ), latest as (
    select b.version_code, b.version_name, b.apk_path, b.size_bytes
    from public.store_app_builds b
    where b.published and b.store_id is not distinct from p_store_id
    order by b.version_code desc
    limit 1
  )
  select case
    when p_store_id is null then jsonb_build_object(
      'available', true, 'store_status', null, 'latest', (select to_jsonb(l) from latest l))
    when not exists (select 1 from store) or (select status from store) = 'archived' then
      jsonb_build_object('available', false, 'store_status', null, 'latest', null)
    else jsonb_build_object(
      'available', (select status from store) = 'active' and private.store_has_module(p_store_id, 'mobile_app'),
      'store_status', (select status from store),
      'latest', case when private.store_has_module(p_store_id, 'mobile_app')
        then (select to_jsonb(l) from latest l) end)
  end;
$$;

revoke all on function public.app_info(uuid) from public;
grant execute on function public.app_info(uuid) to anon, authenticated, service_role;
