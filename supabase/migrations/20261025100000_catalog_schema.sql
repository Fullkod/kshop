-- Phase 1: catalog schema (Saleor/dcabellos model). Every table carries store_id; parents expose
-- unique (store_id, id) and children reference them with composite FKs, so no row can point to another store.
-- Reads: RLS (published content of active stores for everyone, everything of the store for its staff).
-- Writes: only service_role (API + SQL functions). Cost lives in variant_costs, never readable by anon.

create extension if not exists ltree with schema extensions;
create extension if not exists unaccent with schema extensions;

create type public.attribute_input_type as enum ('dropdown', 'multiselect', 'swatch', 'boolean', 'numeric', 'text', 'date');
create type public.attribute_scope as enum ('product', 'variant');
create type public.product_status as enum ('draft', 'published', 'archived');
create type public.media_type as enum ('image', 'video');
create type public.stock_movement_type as enum (
  'adjustment', 'sale', 'cancel', 'refund', 'transfer_in', 'transfer_out', 'purchase', 'import'
);

-- ---------------------------------------------------------------------------
-- Helpers for public visibility
-- ---------------------------------------------------------------------------

create function private.store_is_public(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.stores s where s.id = p_store_id and s.status = 'active');
$$;

-- ---------------------------------------------------------------------------
-- Currencies (decisions 4, 17, 18)
-- ---------------------------------------------------------------------------

create table public.store_currencies (
  store_id uuid not null references public.stores (id) on delete cascade,
  currency public.currency_code not null,
  is_base boolean not null default false,
  -- Sale currency shown in the storefront. Extra sale currencies need the multi_currency module.
  sells boolean not null default false,
  -- 1 unit of this currency = rate_to_base units of the base currency (manual, set by the store).
  rate_to_base numeric(18, 6) not null default 1 check (rate_to_base > 0),
  rounding numeric(12, 2) check (rounding is null or rounding > 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (store_id, currency),
  check (not is_base or (sells and rate_to_base = 1))
);

create unique index store_currencies_one_base_idx on public.store_currencies (store_id) where is_base;
create index store_currencies_updated_by_idx on public.store_currencies (updated_by);

create table public.currency_rate_history (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  currency public.currency_code not null,
  rate numeric(18, 6) not null check (rate > 0),
  set_by uuid references auth.users (id) on delete set null,
  set_at timestamptz not null default now(),
  foreign key (store_id, currency) references public.store_currencies (store_id, currency) on delete cascade
);

create index currency_rate_history_store_idx on public.currency_rate_history (store_id, currency, set_at desc);
create index currency_rate_history_set_by_idx on public.currency_rate_history (set_by);

-- ---------------------------------------------------------------------------
-- Attributes and product types
-- ---------------------------------------------------------------------------

create table public.attributes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  input_type public.attribute_input_type not null default 'dropdown',
  unit text,
  value_required boolean not null default false,
  visible_in_storefront boolean not null default true,
  filterable_in_storefront boolean not null default false,
  filterable_in_dashboard boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug),
  unique (store_id, id)
);

create table public.attribute_values (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  attribute_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  -- Swatch color (#RRGGBB) or other machine value.
  value text check (value is null or char_length(value) <= 100),
  file_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (store_id, attribute_id, slug),
  unique (store_id, id),
  unique (store_id, attribute_id, id),
  foreign key (store_id, attribute_id) references public.attributes (store_id, id) on delete cascade
);

create table public.product_types (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  has_variants boolean not null default false,
  is_shipping_required boolean not null default true,
  weight numeric(10, 3) check (weight is null or weight >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug),
  unique (store_id, id)
);

create table public.product_type_attributes (
  store_id uuid not null,
  product_type_id uuid not null,
  attribute_id uuid not null,
  scope public.attribute_scope not null,
  -- Variant attributes that the shopper picks (size, color) vs. informative ones.
  variant_selection boolean not null default false,
  sort_order int not null default 0,
  primary key (product_type_id, attribute_id),
  check (scope = 'variant' or not variant_selection),
  foreign key (store_id, product_type_id) references public.product_types (store_id, id) on delete cascade,
  foreign key (store_id, attribute_id) references public.attributes (store_id, id) on delete cascade
);

create index product_type_attributes_attribute_idx on public.product_type_attributes (store_id, attribute_id);
create index product_type_attributes_type_idx on public.product_type_attributes (store_id, product_type_id);

-- ---------------------------------------------------------------------------
-- Categories (tree), brands, collections
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  image_url text,
  sort_order int not null default 0,
  -- Materialized path of ids without dashes (ltree labels cannot contain '-'); maintained by trigger.
  path extensions.ltree not null,
  depth int not null default 1 check (depth between 1 and 3),
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug),
  unique (store_id, id),
  check (parent_id is null or parent_id <> id),
  -- A category with children cannot be deleted (move or delete the children first).
  foreign key (store_id, parent_id) references public.categories (store_id, id) on delete restrict
);

create index categories_parent_idx on public.categories (store_id, parent_id);
create index categories_path_idx on public.categories using gist (path);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  logo_url text,
  description text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug),
  unique (store_id, id)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  image_url text,
  is_published boolean not null default true,
  sort_order int not null default 0,
  -- Automatic collections are resolved in Phase 2; manual ones use collection_products.
  rules jsonb,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug),
  unique (store_id, id)
);

-- ---------------------------------------------------------------------------
-- Products and variants
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  product_type_id uuid not null,
  category_id uuid,
  brand_id uuid,
  name text not null check (char_length(name) between 1 and 200),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description jsonb not null default '{}',
  description_plain text not null default '',
  status public.product_status not null default 'draft',
  published_at timestamptz,
  featured boolean not null default false,
  badge text check (badge is null or char_length(badge) <= 30),
  seo_title text,
  seo_description text,
  metadata jsonb not null default '{}',
  -- Denormalized for listings (maintained by private.refresh_product_summary); prices in base currency.
  min_price numeric(12, 2),
  max_price numeric(12, 2),
  in_stock boolean not null default false,
  primary_media_url text,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug),
  unique (store_id, id),
  foreign key (store_id, product_type_id) references public.product_types (store_id, id) on delete restrict,
  foreign key (store_id, category_id) references public.categories (store_id, id) on delete set null (category_id),
  foreign key (store_id, brand_id) references public.brands (store_id, id) on delete set null (brand_id)
);

create index products_store_status_idx on public.products (store_id, status, published_at desc);
create index products_type_idx on public.products (store_id, product_type_id);
create index products_category_idx on public.products (store_id, category_id);
create index products_brand_idx on public.products (store_id, brand_id);
create index products_search_idx on public.products using gin (search_vector);

create table public.collection_products (
  store_id uuid not null,
  collection_id uuid not null,
  product_id uuid not null,
  sort_order int not null default 0,
  primary key (collection_id, product_id),
  foreign key (store_id, collection_id) references public.collections (store_id, id) on delete cascade,
  foreign key (store_id, product_id) references public.products (store_id, id) on delete cascade
);

create index collection_products_product_idx on public.collection_products (store_id, product_id);
create index collection_products_collection_idx on public.collection_products (store_id, collection_id, sort_order);

create table public.product_tags (
  store_id uuid not null,
  product_id uuid not null,
  tag text not null check (char_length(tag) between 1 and 40),
  primary key (product_id, tag),
  foreign key (store_id, product_id) references public.products (store_id, id) on delete cascade
);

create index product_tags_store_tag_idx on public.product_tags (store_id, tag);
create index product_tags_product_idx on public.product_tags (store_id, product_id);

create table public.product_attribute_values (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  attribute_id uuid not null,
  value_id uuid,
  value_text text,
  value_numeric numeric,
  value_boolean boolean,
  value_date date,
  foreign key (store_id, product_id) references public.products (store_id, id) on delete cascade,
  foreign key (store_id, attribute_id) references public.attributes (store_id, id) on delete cascade,
  -- The value must belong to that attribute (and store).
  foreign key (store_id, attribute_id, value_id) references public.attribute_values (store_id, attribute_id, id)
    on delete cascade
);

create index product_attribute_values_product_idx on public.product_attribute_values (store_id, product_id);
create index product_attribute_values_attribute_idx on public.product_attribute_values (store_id, attribute_id, value_id);
create unique index product_attribute_values_unique_idx
  on public.product_attribute_values (product_id, attribute_id, coalesce(value_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  sku text not null check (sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
  name text not null default '',
  sort_order int not null default 0,
  -- Products without variants have exactly one default variant.
  is_default boolean not null default false,
  track_inventory boolean not null default true,
  weight numeric(10, 3) check (weight is null or weight >= 0),
  -- Sale price in the store's base currency; per-currency overrides in variant_prices (multi_currency).
  price numeric(12, 2) not null default 0 check (price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price is null or compare_at_price >= 0),
  -- Sum of available stock over active warehouses (maintained by trigger). Public, unlike stocks.
  stock_available int not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, sku),
  unique (store_id, id),
  foreign key (store_id, product_id) references public.products (store_id, id) on delete cascade
);

create index product_variants_product_idx on public.product_variants (store_id, product_id, sort_order);
create unique index product_variants_one_default_idx on public.product_variants (product_id) where is_default;

create table public.variant_attribute_values (
  store_id uuid not null,
  variant_id uuid not null,
  attribute_id uuid not null,
  value_id uuid not null,
  primary key (variant_id, attribute_id),
  foreign key (store_id, variant_id) references public.product_variants (store_id, id) on delete cascade,
  foreign key (store_id, attribute_id, value_id) references public.attribute_values (store_id, attribute_id, id)
    on delete cascade
);

create index variant_attribute_values_value_idx on public.variant_attribute_values (store_id, attribute_id, value_id);
create index variant_attribute_values_variant_idx on public.variant_attribute_values (store_id, variant_id);

-- Per-currency price overrides (multi_currency). Without a row the price is converted with the store rate.
create table public.variant_prices (
  store_id uuid not null,
  variant_id uuid not null,
  currency public.currency_code not null,
  price numeric(12, 2) not null check (price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price is null or compare_at_price >= 0),
  primary key (variant_id, currency),
  foreign key (store_id, variant_id) references public.product_variants (store_id, id) on delete cascade,
  foreign key (store_id, currency) references public.store_currencies (store_id, currency) on delete cascade
);

create index variant_prices_store_idx on public.variant_prices (store_id, variant_id);
create index variant_prices_currency_idx on public.variant_prices (store_id, currency);

-- Private: cost price (decisions 18, 20; D5). No grant to anon at all.
create table public.variant_costs (
  store_id uuid not null,
  variant_id uuid primary key,
  cost_price numeric(12, 2) not null check (cost_price >= 0),
  cost_currency public.currency_code not null,
  updated_at timestamptz not null default now(),
  foreign key (store_id, variant_id) references public.product_variants (store_id, id) on delete cascade
);

create index variant_costs_store_idx on public.variant_costs (store_id, variant_id);

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  -- Path inside the store-media bucket: stores/{store_id}/products/...
  storage_key text,
  url text not null,
  thumb_url text,
  alt text,
  type public.media_type not null default 'image',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, product_id) references public.products (store_id, id) on delete cascade
);

create index product_media_product_idx on public.product_media (store_id, product_id, sort_order);

create table public.variant_media (
  store_id uuid not null,
  variant_id uuid not null,
  media_id uuid not null,
  primary key (variant_id, media_id),
  foreign key (store_id, variant_id) references public.product_variants (store_id, id) on delete cascade,
  foreign key (store_id, media_id) references public.product_media (store_id, id) on delete cascade
);

create index variant_media_media_idx on public.variant_media (store_id, media_id);
create index variant_media_variant_idx on public.variant_media (store_id, variant_id);

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  address text,
  phone text,
  is_default boolean not null default false,
  is_pickup_point boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  check (not is_default or is_active)
);

create unique index warehouses_one_default_idx on public.warehouses (store_id) where is_default;

create table public.stocks (
  store_id uuid not null,
  variant_id uuid not null,
  warehouse_id uuid not null,
  quantity int not null default 0 check (quantity >= 0),
  -- Reserved by open orders (Phase 3). Never above quantity.
  quantity_allocated int not null default 0 check (quantity_allocated >= 0),
  low_stock_threshold int check (low_stock_threshold is null or low_stock_threshold >= 0),
  updated_at timestamptz not null default now(),
  primary key (variant_id, warehouse_id),
  check (quantity_allocated <= quantity),
  foreign key (store_id, variant_id) references public.product_variants (store_id, id) on delete cascade,
  foreign key (store_id, warehouse_id) references public.warehouses (store_id, id) on delete cascade
);

create index stocks_warehouse_idx on public.stocks (store_id, warehouse_id);
create index stocks_variant_idx on public.stocks (store_id, variant_id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  variant_id uuid not null,
  warehouse_id uuid not null,
  type public.stock_movement_type not null,
  -- Signed delta applied to stocks.quantity.
  quantity int not null,
  order_id uuid,
  import_job_id uuid,
  note text,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (store_id, variant_id) references public.product_variants (store_id, id) on delete cascade,
  foreign key (store_id, warehouse_id) references public.warehouses (store_id, id) on delete cascade
);

create index stock_movements_variant_idx on public.stock_movements (store_id, variant_id, created_at desc);
create index stock_movements_warehouse_idx on public.stock_movements (store_id, warehouse_id);
create index stock_movements_user_idx on public.stock_movements (user_id);
create index stock_movements_import_idx on public.stock_movements (import_job_id) where import_job_id is not null;

-- ---------------------------------------------------------------------------
-- Triggers: updated_at, category path, denormalized product summary, stock totals
-- ---------------------------------------------------------------------------

create trigger attributes_set_updated_at before update on public.attributes
for each row execute function private.set_updated_at();
create trigger product_types_set_updated_at before update on public.product_types
for each row execute function private.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
for each row execute function private.set_updated_at();
create trigger brands_set_updated_at before update on public.brands
for each row execute function private.set_updated_at();
create trigger collections_set_updated_at before update on public.collections
for each row execute function private.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function private.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants
for each row execute function private.set_updated_at();
create trigger warehouses_set_updated_at before update on public.warehouses
for each row execute function private.set_updated_at();
create trigger stocks_set_updated_at before update on public.stocks
for each row execute function private.set_updated_at();
create trigger variant_costs_set_updated_at before update on public.variant_costs
for each row execute function private.set_updated_at();

-- Category path/depth from the parent; moving a branch rewrites its descendants.
create function private.categories_set_path()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_path extensions.ltree;
  v_label extensions.ltree := replace(new.id::text, '-', '')::extensions.ltree;
begin
  if new.parent_id is null then
    new.path := v_label;
  else
    select c.path into v_parent_path
    from public.categories c
    where c.store_id = new.store_id and c.id = new.parent_id;
    if v_parent_path is null then
      raise exception 'Parent category not found' using errcode = '23503';
    end if;
    if v_parent_path operator(extensions.<@) (
      select c.path from public.categories c where c.id = new.id and tg_op = 'UPDATE'
    ) then
      raise exception 'A category cannot be moved inside itself' using errcode = '23514';
    end if;
    new.path := v_parent_path operator(extensions.||) v_label;
  end if;
  new.depth := extensions.nlevel(new.path);
  return new;
end;
$$;

create trigger categories_set_path_trigger
before insert or update of parent_id on public.categories
for each row execute function private.categories_set_path();

create function private.categories_move_descendants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.path is distinct from old.path then
    update public.categories c
    set path = new.path operator(extensions.||) extensions.subpath(c.path, extensions.nlevel(old.path)),
        depth = extensions.nlevel(new.path) + extensions.nlevel(c.path) - extensions.nlevel(old.path)
    where c.store_id = new.store_id
      and c.path operator(extensions.<@) old.path
      and c.id <> new.id;
  end if;
  return null;
end;
$$;

create trigger categories_move_descendants_trigger
after update of parent_id on public.categories
for each row execute function private.categories_move_descendants();

-- Full-text vector (Spanish, accent-insensitive). unaccent is not immutable, so it is set by trigger.
create function private.products_set_search_vector()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_skus text;
  v_tags text;
begin
  select string_agg(v.sku, ' ') into v_skus from public.product_variants v where v.product_id = new.id;
  select string_agg(t.tag, ' ') into v_tags from public.product_tags t where t.product_id = new.id;
  new.search_vector :=
    setweight(to_tsvector('spanish'::regconfig, extensions.unaccent(coalesce(new.name, ''))), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(v_skus, '')), 'A')
    || setweight(to_tsvector('spanish'::regconfig, extensions.unaccent(coalesce(v_tags, ''))), 'B')
    || setweight(to_tsvector('spanish'::regconfig, extensions.unaccent(coalesce(new.description_plain, ''))), 'C');
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

create trigger products_set_search_vector_trigger
before insert or update on public.products
for each row execute function private.products_set_search_vector();

create function private.refresh_product_summary(p_product_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.products p
  set min_price = s.min_price,
      max_price = s.max_price,
      in_stock = coalesce(s.in_stock, false),
      primary_media_url = (
        select coalesce(m.thumb_url, m.url) from public.product_media m
        where m.product_id = p.id order by m.sort_order, m.created_at limit 1
      )
  from (
    select min(v.price) as min_price, max(v.price) as max_price,
           bool_or(not v.track_inventory or v.stock_available > 0) as in_stock
    from public.product_variants v
    where v.product_id = p_product_id
  ) s
  where p.id = p_product_id;
$$;

create function private.product_children_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.refresh_product_summary(old.product_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.product_id is distinct from old.product_id) then
    perform private.refresh_product_summary(new.product_id);
  end if;
  return null;
end;
$$;

create trigger product_variants_summary_trigger
after insert or update or delete on public.product_variants
for each row execute function private.product_children_changed();
create trigger product_media_summary_trigger
after insert or update or delete on public.product_media
for each row execute function private.product_children_changed();
create trigger product_tags_summary_trigger
after insert or update or delete on public.product_tags
for each row execute function private.product_children_changed();

-- product_variants.stock_available = sum over active warehouses of (quantity - allocated).
create function private.refresh_variant_stock(p_variant_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.product_variants v
  set stock_available = coalesce((
    select sum(s.quantity - s.quantity_allocated)
    from public.stocks s
    join public.warehouses w on w.id = s.warehouse_id
    where s.variant_id = v.id and w.is_active
  ), 0)
  where v.id = p_variant_id;
$$;

create function private.stocks_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.refresh_variant_stock(old.variant_id);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.variant_id is distinct from old.variant_id) then
    perform private.refresh_variant_stock(new.variant_id);
  end if;
  return null;
end;
$$;

create trigger stocks_changed_trigger
after insert or update or delete on public.stocks
for each row execute function private.stocks_changed();

create function private.warehouses_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_active is distinct from old.is_active then
    perform private.refresh_variant_stock(s.variant_id)
    from public.stocks s where s.warehouse_id = new.id;
  end if;
  return null;
end;
$$;

create trigger warehouses_changed_trigger
after update of is_active on public.warehouses
for each row execute function private.warehouses_changed();

-- ---------------------------------------------------------------------------
-- Module and plan limits enforced in the database (third layer after UI and API)
-- ---------------------------------------------------------------------------

create function private.store_limit(p_store_id uuid, p_key text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select pl.value
  from public.subscriptions s
  join public.plan_limits pl on pl.plan_id = s.plan_id and pl.key = p_key
  where s.store_id = p_store_id;
$$;

create function private.enforce_product_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_limit int := private.store_limit(new.store_id, 'max_products');
  v_count int;
begin
  if v_limit is null or new.status = 'archived' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'archived' then
    return new;
  end if;
  select count(*) into v_count
  from public.products p
  where p.store_id = new.store_id and p.status <> 'archived' and p.id <> new.id;
  if v_count >= v_limit then
    raise exception 'Product limit reached (%)', v_limit using errcode = 'P0001', hint = 'max_products';
  end if;
  return new;
end;
$$;

create trigger products_enforce_limit_trigger
before insert or update of status on public.products
for each row execute function private.enforce_product_limit();

create function private.enforce_warehouse_module()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.warehouses w where w.store_id = new.store_id and w.id <> new.id)
     and not private.store_has_module(new.store_id, 'multi_warehouse') then
    raise exception 'Module multi_warehouse is not enabled' using errcode = 'P0001', hint = 'module_not_enabled';
  end if;
  return new;
end;
$$;

create trigger warehouses_enforce_module_trigger
before insert on public.warehouses
for each row execute function private.enforce_warehouse_module();

create function private.enforce_currency_module()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sells and not new.is_base and not private.store_has_module(new.store_id, 'multi_currency') then
    raise exception 'Module multi_currency is not enabled' using errcode = 'P0001', hint = 'module_not_enabled';
  end if;
  return new;
end;
$$;

create trigger store_currencies_enforce_module_trigger
before insert or update of sells on public.store_currencies
for each row execute function private.enforce_currency_module();

create function private.enforce_variant_price_module()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.store_has_module(new.store_id, 'multi_currency') then
    raise exception 'Module multi_currency is not enabled' using errcode = 'P0001', hint = 'module_not_enabled';
  end if;
  return new;
end;
$$;

create trigger variant_prices_enforce_module_trigger
before insert or update on public.variant_prices
for each row execute function private.enforce_variant_price_module();

revoke all on all functions in schema private from public;
-- Triggers run as the writing role (service_role) and call these helpers.
grant execute on all functions in schema private to service_role;
grant execute on function private.store_is_public(uuid) to anon, authenticated, service_role;

-- Decision D4 (provisional): Base plan up to 300 products; Pro without limit (no row).
insert into public.plan_limits (plan_id, key, value)
select p.id, 'max_products', 300 from public.plans p where p.code = 'base'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.store_currencies, public.currency_rate_history, public.attributes, public.attribute_values,
  public.product_types, public.product_type_attributes, public.categories, public.brands, public.collections,
  public.products, public.collection_products, public.product_tags, public.product_attribute_values,
  public.product_variants, public.variant_attribute_values, public.variant_prices, public.variant_costs,
  public.product_media, public.variant_media, public.warehouses, public.stocks, public.stock_movements
  from anon, authenticated;

-- Storefront-readable (rows filtered by RLS).
grant select on public.store_currencies, public.attributes, public.attribute_values, public.product_types,
  public.product_type_attributes, public.categories, public.brands, public.collections, public.collection_products,
  public.product_tags, public.product_attribute_values, public.product_variants, public.variant_attribute_values,
  public.variant_prices, public.product_media, public.variant_media
  to anon, authenticated;
-- search_vector is internal (used by search functions).
grant select (id, store_id, product_type_id, category_id, brand_id, name, slug, description, description_plain,
  status, published_at, featured, badge, seo_title, seo_description, metadata, min_price, max_price, in_stock,
  primary_media_url, created_at, updated_at)
  on public.products to anon, authenticated;
-- Staff only (RLS restricts to their store).
grant select on public.currency_rate_history, public.variant_costs, public.warehouses, public.stocks,
  public.stock_movements
  to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.store_currencies enable row level security;
alter table public.currency_rate_history enable row level security;
alter table public.attributes enable row level security;
alter table public.attribute_values enable row level security;
alter table public.product_types enable row level security;
alter table public.product_type_attributes enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.collections enable row level security;
alter table public.products enable row level security;
alter table public.collection_products enable row level security;
alter table public.product_tags enable row level security;
alter table public.product_attribute_values enable row level security;
alter table public.product_variants enable row level security;
alter table public.variant_attribute_values enable row level security;
alter table public.variant_prices enable row level security;
alter table public.variant_costs enable row level security;
alter table public.product_media enable row level security;
alter table public.variant_media enable row level security;
alter table public.warehouses enable row level security;
alter table public.stocks enable row level security;
alter table public.stock_movements enable row level security;

-- Is the product visible to the public? (published + store active). Used by child tables.
create function private.product_is_public(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.products p
    join public.stores s on s.id = p.store_id
    where p.id = p_product_id and p.status = 'published' and s.status = 'active'
  );
$$;

create function private.variant_is_public(p_variant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.product_variants v
    join public.products p on p.id = v.product_id
    join public.stores s on s.id = p.store_id
    where v.id = p_variant_id and p.status = 'published' and s.status = 'active'
  );
$$;

revoke all on function private.product_is_public(uuid), private.variant_is_public(uuid) from public;
grant execute on function private.product_is_public(uuid), private.variant_is_public(uuid)
  to anon, authenticated, service_role;

-- Store structure: public for active stores, everything for staff/superadmin.
create policy "store_currencies: sale currencies public, all for staff" on public.store_currencies for select
to anon, authenticated
using ((sells and (select private.store_is_public(store_id)))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "attributes: public in active stores, all for staff" on public.attributes for select
to anon, authenticated
using ((visible_in_storefront and (select private.store_is_public(store_id)))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "attribute_values: public in active stores, all for staff" on public.attribute_values for select
to anon, authenticated
using ((select private.store_is_public(store_id))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "product_types: public in active stores, all for staff" on public.product_types for select
to anon, authenticated
using ((select private.store_is_public(store_id))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "product_type_attributes: public in active stores, all for staff" on public.product_type_attributes
for select to anon, authenticated
using ((select private.store_is_public(store_id))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "categories: public in active stores, all for staff" on public.categories for select
to anon, authenticated
using ((select private.store_is_public(store_id))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "brands: published in active stores, all for staff" on public.brands for select
to anon, authenticated
using ((is_published and (select private.store_is_public(store_id)))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "collections: published in active stores, all for staff" on public.collections for select
to anon, authenticated
using ((is_published and (select private.store_is_public(store_id)))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

-- Products and their content: published products of active stores; drafts only for staff.
create policy "products: published in active stores, all for staff" on public.products for select
to anon, authenticated
using ((status = 'published' and (select private.store_is_public(store_id)))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "collection_products: public pairs, all for staff" on public.collection_products for select
to anon, authenticated
using ((private.product_is_public(product_id)
    and exists (select 1 from public.collections c where c.id = collection_id and c.is_published))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "product_tags: with a public product, all for staff" on public.product_tags for select
to anon, authenticated
using (private.product_is_public(product_id)
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "product_attribute_values: with a public product, all for staff" on public.product_attribute_values
for select to anon, authenticated
using (private.product_is_public(product_id)
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "product_variants: with a public product, all for staff" on public.product_variants for select
to anon, authenticated
using (private.product_is_public(product_id)
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "variant_attribute_values: with a public variant, all for staff" on public.variant_attribute_values
for select to anon, authenticated
using (private.variant_is_public(variant_id)
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "variant_prices: with a public variant, all for staff" on public.variant_prices for select
to anon, authenticated
using (private.variant_is_public(variant_id)
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "product_media: with a public product, all for staff" on public.product_media for select
to anon, authenticated
using (private.product_is_public(product_id)
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "variant_media: with a public variant, all for staff" on public.variant_media for select
to anon, authenticated
using (private.variant_is_public(variant_id)
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

-- Private data: staff of the store (cost and rate history: admin and above) and superadmin.
create policy "variant_costs: store admins" on public.variant_costs for select
to authenticated
using ((select private.is_superadmin()) or private.has_store_role(store_id, 'admin'));

create policy "currency_rate_history: store admins" on public.currency_rate_history for select
to authenticated
using ((select private.is_superadmin()) or private.has_store_role(store_id, 'admin'));

create policy "warehouses: store staff" on public.warehouses for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "stocks: store staff" on public.stocks for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "stock_movements: store staff" on public.stock_movements for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

-- pg_graphql: totals for paginated admin listings.
comment on table public.products is e'@graphql({"totalCount": {"enabled": true}})';
comment on table public.categories is e'@graphql({"totalCount": {"enabled": true}})';
comment on table public.brands is e'@graphql({"totalCount": {"enabled": true}})';
comment on table public.collections is e'@graphql({"totalCount": {"enabled": true}})';
