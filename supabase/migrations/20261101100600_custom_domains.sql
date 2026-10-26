-- Phase 6.4 (PRP-6 D19–D23): custom domains.
-- A store is served on its custom domain while the domain is verified, the store is active and it has the
-- custom_domain module; otherwise everything falls back to its subdomain. Nothing is deleted when the module is
-- turned off: the domain resolves again as soon as the module comes back.
-- The subdomain row stays is_primary; the public origin is computed (D21 without flipping is_primary, so turning the
-- module off needs no data change).

-- The custom domain a store is served on right now, or null (subdomain).
create function private.store_custom_domain(p_store_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.domain
  from public.store_domains d
  join public.stores s on s.id = d.store_id
  where d.store_id = p_store_id
    and d.type = 'custom'
    and d.verified_at is not null
    and s.status = 'active'
    and private.store_has_module(p_store_id, 'custom_domain');
$$;

-- Notifications, order links: custom domain when it is live, else the subdomain (D21).
create or replace function private.store_public_url(p_store_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select 'https://' || coalesce(
    private.store_custom_domain(p_store_id),
    (select s.slug || '.kshop.fullkod.com' from public.stores s where s.id = p_store_id));
$$;

-- Proxy (anon, D19): which store a custom host belongs to. Also "www." of the domain. live = false when the store
-- lost the module or is not active: the proxy sends the visitor to the subdomain (D23). Only verified domains.
create function public.resolve_store_domain(p_host text)
returns table (slug text, domain text, live boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.slug, d.domain, private.store_custom_domain(s.id) is not null
  from public.store_domains d
  join public.stores s on s.id = d.store_id
  where d.type = 'custom'
    and d.verified_at is not null
    and s.status <> 'archived'
    and (d.domain = lower(p_host) or 'www.' || d.domain = lower(p_host))
  limit 1;
$$;

-- Proxy (anon, D21): the live custom domain of a subdomain, to redirect the storefront there.
create function public.resolve_store_custom_domain(p_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.store_custom_domain(s.id) from public.stores s where s.slug = lower(p_slug);
$$;

revoke all on function private.store_custom_domain(uuid), public.resolve_store_domain(text),
  public.resolve_store_custom_domain(text) from public;
grant execute on function private.store_custom_domain(uuid), public.resolve_store_domain(text),
  public.resolve_store_custom_domain(text) to anon, authenticated, service_role;
