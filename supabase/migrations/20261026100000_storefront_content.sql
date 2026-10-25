-- Phase 2: storefront content per store — home sections, banners, menus and static pages.
-- Same rules as the catalog: store_id first in every key and index, composite FKs (store_id, id) so no row
-- points to another store, public reads filtered by RLS (visibility, dates, active store), writes only
-- through /api/v1 with the service role.

create type public.home_section_type as enum (
  'hero_slider', 'banner', 'product_carousel', 'category_grid', 'brand_strip', 'rich_text'
);
create type public.link_type as enum ('product', 'category', 'collection', 'brand', 'page', 'url');
create type public.menu_location as enum ('header', 'footer');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Visible now: flag on and inside the optional [starts_at, ends_at) window.
create function private.is_scheduled_visible(p_visible boolean, p_starts timestamptz, p_ends timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_visible and (p_starts is null or p_starts <= now()) and (p_ends is null or p_ends > now());
$$;

grant execute on function private.is_scheduled_visible(boolean, timestamptz, timestamptz)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Banners
-- ---------------------------------------------------------------------------

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  title text check (char_length(title) <= 120),
  subtitle text check (char_length(subtitle) <= 240),
  cta_label text check (char_length(cta_label) <= 40),
  image_url text not null,
  image_mobile_url text,
  alt text check (char_length(alt) <= 200),
  -- Typed link: a store entity by id, or a URL (absolute http(s) or a path of the store).
  link_type public.link_type,
  link_target_id uuid,
  link_url text check (link_url ~ '^(https?://|/)'),
  sort_order int not null default 0,
  is_visible boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  check (starts_at is null or ends_at is null or starts_at < ends_at),
  check (
    (link_type is null and link_target_id is null and link_url is null)
    or (link_type = 'url' and link_url is not null and link_target_id is null)
    or (link_type <> 'url' and link_target_id is not null and link_url is null)
  )
);

create index banners_store_idx on public.banners (store_id, sort_order);

-- ---------------------------------------------------------------------------
-- Home sections
-- ---------------------------------------------------------------------------

create table public.home_sections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  type public.home_section_type not null,
  title text check (char_length(title) <= 120),
  -- Source of product_carousel (one of them); category_grid/brand_strip list what is published.
  source_collection_id uuid,
  source_category_id uuid,
  source_brand_id uuid,
  -- Per-type settings, validated with Zod in @kshop/core (number of products, columns, markdown…).
  settings jsonb not null default '{}',
  sort_order int not null default 0,
  is_visible boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  check (starts_at is null or ends_at is null or starts_at < ends_at),
  check (jsonb_typeof(settings) = 'object'),
  foreign key (store_id, source_collection_id) references public.collections (store_id, id)
    on delete set null (source_collection_id),
  foreign key (store_id, source_category_id) references public.categories (store_id, id)
    on delete set null (source_category_id),
  foreign key (store_id, source_brand_id) references public.brands (store_id, id)
    on delete set null (source_brand_id)
);

create index home_sections_store_idx on public.home_sections (store_id, sort_order);
create index home_sections_collection_idx on public.home_sections (store_id, source_collection_id)
  where source_collection_id is not null;
create index home_sections_category_idx on public.home_sections (store_id, source_category_id)
  where source_category_id is not null;
create index home_sections_brand_idx on public.home_sections (store_id, source_brand_id)
  where source_brand_id is not null;

create table public.home_section_banners (
  store_id uuid not null,
  section_id uuid not null,
  banner_id uuid not null,
  sort_order int not null default 0,
  primary key (section_id, banner_id),
  foreign key (store_id, section_id) references public.home_sections (store_id, id) on delete cascade,
  foreign key (store_id, banner_id) references public.banners (store_id, id) on delete cascade
);

create index home_section_banners_section_idx on public.home_section_banners (store_id, section_id, sort_order);
create index home_section_banners_banner_idx on public.home_section_banners (store_id, banner_id);

-- ---------------------------------------------------------------------------
-- Menus (header/footer, two levels)
-- ---------------------------------------------------------------------------

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  location public.menu_location not null,
  created_at timestamptz not null default now(),
  unique (store_id, location),
  unique (store_id, id)
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  menu_id uuid not null,
  parent_id uuid,
  label text not null check (char_length(label) between 1 and 60),
  link_type public.link_type not null,
  link_target_id uuid,
  link_url text check (link_url ~ '^(https?://|/)'),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  check (
    (link_type = 'url' and link_url is not null and link_target_id is null)
    or (link_type <> 'url' and link_target_id is not null and link_url is null)
  ),
  foreign key (store_id, menu_id) references public.menus (store_id, id) on delete cascade,
  foreign key (store_id, parent_id) references public.menu_items (store_id, id) on delete cascade
);

create index menu_items_menu_idx on public.menu_items (store_id, menu_id, sort_order);
create index menu_items_parent_idx on public.menu_items (store_id, parent_id) where parent_id is not null;

-- Two levels: a parent must be a top-level item of the same menu.
create function private.enforce_menu_item_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.menu_items p
    where p.id = new.parent_id and p.menu_id = new.menu_id and p.parent_id is null
  ) then
    raise exception 'Menu items can only be nested one level, inside the same menu'
      using errcode = 'P0001', hint = 'menu_depth';
  end if;
  return new;
end;
$$;

create trigger menu_items_depth_trigger
before insert or update of parent_id, menu_id on public.menu_items
for each row execute function private.enforce_menu_item_depth();

-- ---------------------------------------------------------------------------
-- Static pages
-- ---------------------------------------------------------------------------

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 1 and 120),
  -- Restricted Markdown (no HTML), rendered on the server.
  content text not null default '' check (char_length(content) <= 50000),
  is_published boolean not null default false,
  seo_title text check (char_length(seo_title) <= 70),
  seo_description text check (char_length(seo_description) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug),
  unique (store_id, id)
);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create trigger banners_set_updated_at before update on public.banners
for each row execute function private.set_updated_at();
create trigger home_sections_set_updated_at before update on public.home_sections
for each row execute function private.set_updated_at();
create trigger menu_items_set_updated_at before update on public.menu_items
for each row execute function private.set_updated_at();
create trigger pages_set_updated_at before update on public.pages
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants and RLS: read-only for anon/authenticated, writes only with the service role
-- ---------------------------------------------------------------------------

revoke all on public.banners, public.home_sections, public.home_section_banners, public.menus,
  public.menu_items, public.pages from anon, authenticated;
grant select on public.banners, public.home_sections, public.home_section_banners, public.menus,
  public.menu_items, public.pages to anon, authenticated;

alter table public.banners enable row level security;
alter table public.home_sections enable row level security;
alter table public.home_section_banners enable row level security;
alter table public.menus enable row level security;
alter table public.menu_items enable row level security;
alter table public.pages enable row level security;

create policy "banners: scheduled in active stores, all for staff" on public.banners for select
to anon, authenticated
using ((private.is_scheduled_visible(is_visible, starts_at, ends_at) and (select private.store_is_public(store_id)))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "home_sections: scheduled in active stores, all for staff" on public.home_sections for select
to anon, authenticated
using ((private.is_scheduled_visible(is_visible, starts_at, ends_at) and (select private.store_is_public(store_id)))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

-- The banners themselves are filtered by their own policy.
create policy "home_section_banners: active stores, all for staff" on public.home_section_banners for select
to anon, authenticated
using ((select private.store_is_public(store_id))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "menus: active stores, all for staff" on public.menus for select
to anon, authenticated
using ((select private.store_is_public(store_id))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "menu_items: active stores, all for staff" on public.menu_items for select
to anon, authenticated
using ((select private.store_is_public(store_id))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "pages: published in active stores, all for staff" on public.pages for select
to anon, authenticated
using ((is_published and (select private.store_is_public(store_id)))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));
