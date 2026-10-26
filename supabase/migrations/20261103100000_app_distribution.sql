-- Phase 7.4 (PRP-7 D13, D14): where the APKs live and the owner's «Pedir mi app».
-- store-media only takes images up to 5 MB, so the APKs get their own public bucket: stores/{store_id}/... for a
-- store app, admin/... for the admin app. Only `pnpm app:publish` (service_role) writes there: no write policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-apps', 'store-apps', true, 52428800, array['application/vnd.android.package-archive'])
on conflict (id) do nothing;

-- One pending request per store; the superadmin sees it in Superadmin › Apps and it goes away when a build of
-- that store is published.
create table public.store_app_requests (
  store_id uuid primary key references public.stores (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now()
);

create index store_app_requests_requested_by_idx on public.store_app_requests (requested_by);

revoke all on public.store_app_requests from anon, authenticated;
grant select on public.store_app_requests to authenticated;
alter table public.store_app_requests enable row level security;

create policy "store_app_requests: store admins" on public.store_app_requests for select
to authenticated
using ((select private.is_superadmin()) or (select private.has_store_role(store_id, 'admin')));
