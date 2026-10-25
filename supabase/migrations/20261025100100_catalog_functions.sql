-- Phase 1: catalog write functions (service_role only, called by /api/v1) and admin search.

-- ---------------------------------------------------------------------------
-- create_store v2: also creates the default warehouse and the base currency
-- ---------------------------------------------------------------------------

create or replace function public.create_store(
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

  insert into public.store_currencies (store_id, currency, is_base, sells, rate_to_base)
  values (v_store.id, v_store.base_currency, true, true, 1);

  insert into public.warehouses (store_id, name, is_default)
  values (v_store.id, 'Principal', true);

  return v_store;
end;
$$;

-- Backfill stores created before the catalog existed.
insert into public.store_currencies (store_id, currency, is_base, sells, rate_to_base)
select s.id, s.base_currency, true, true, 1
from public.stores s
where not exists (select 1 from public.store_currencies c where c.store_id = s.id and c.is_base);

insert into public.warehouses (store_id, name, is_default)
select s.id, 'Principal', true
from public.stores s
where not exists (select 1 from public.warehouses w where w.store_id = s.id);

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------

-- Sets the absolute quantity of a variant in a warehouse and records the movement (one transaction).
create function public.set_stock_quantity(
  p_store_id uuid,
  p_variant_id uuid,
  p_warehouse_id uuid,
  p_quantity int,
  p_type public.stock_movement_type,
  p_note text,
  p_user_id uuid,
  p_import_job_id uuid default null
)
returns public.stocks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock public.stocks;
  v_delta int;
begin
  if p_quantity < 0 then
    raise exception 'Quantity cannot be negative' using errcode = '23514';
  end if;

  insert into public.stocks (store_id, variant_id, warehouse_id, quantity)
  values (p_store_id, p_variant_id, p_warehouse_id, 0)
  on conflict (variant_id, warehouse_id) do nothing;

  select * into v_stock
  from public.stocks
  where variant_id = p_variant_id and warehouse_id = p_warehouse_id and store_id = p_store_id
  for update;
  if not found then
    raise exception 'Stock row not found for this store' using errcode = '23503';
  end if;
  if p_quantity < v_stock.quantity_allocated then
    raise exception 'Quantity below reserved units (%)', v_stock.quantity_allocated
      using errcode = '23514', hint = 'below_allocated';
  end if;

  v_delta := p_quantity - v_stock.quantity;
  if v_delta = 0 then
    return v_stock;
  end if;

  update public.stocks set quantity = p_quantity
  where variant_id = p_variant_id and warehouse_id = p_warehouse_id
  returning * into v_stock;

  insert into public.stock_movements (store_id, variant_id, warehouse_id, type, quantity, note, user_id, import_job_id)
  values (p_store_id, p_variant_id, p_warehouse_id, p_type, v_delta, p_note, p_user_id, p_import_job_id);

  return v_stock;
end;
$$;

-- ---------------------------------------------------------------------------
-- Currencies
-- ---------------------------------------------------------------------------

-- Creates or updates a currency of the store and records the rate. Sale currencies other than the base
-- need multi_currency (enforced by trigger); cost-only currencies (sells = false) are always allowed.
create function public.set_store_currency(
  p_store_id uuid,
  p_currency text,
  p_rate_to_base numeric,
  p_sells boolean,
  p_rounding numeric,
  p_user_id uuid
)
returns public.store_currencies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.store_currencies;
begin
  select * into v_row from public.store_currencies where store_id = p_store_id and currency = p_currency for update;

  if found and v_row.is_base then
    update public.store_currencies
    set rounding = p_rounding, updated_by = p_user_id, updated_at = now()
    where store_id = p_store_id and currency = p_currency
    returning * into v_row;
    return v_row;
  end if;

  insert into public.store_currencies (store_id, currency, is_base, sells, rate_to_base, rounding, updated_by)
  values (p_store_id, p_currency, false, p_sells, p_rate_to_base, p_rounding, p_user_id)
  on conflict (store_id, currency) do update
  set sells = excluded.sells,
      rate_to_base = excluded.rate_to_base,
      rounding = excluded.rounding,
      updated_by = excluded.updated_by,
      updated_at = now()
  returning * into v_row;

  if v_row.rate_to_base is distinct from (
    select h.rate from public.currency_rate_history h
    where h.store_id = p_store_id and h.currency = p_currency
    order by h.set_at desc limit 1
  ) then
    insert into public.currency_rate_history (store_id, currency, rate, set_by)
    values (p_store_id, p_currency, v_row.rate_to_base, p_user_id);
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Products: one call saves the product with its tags, collections, attributes, variants, costs,
-- per-currency prices, stock (default warehouse) and media assignments, in one transaction.
-- ---------------------------------------------------------------------------

create function public.save_product(p_store_id uuid, p_input jsonb, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_type public.product_types;
  v_default_warehouse uuid;
  v_variant jsonb;
  v_variant_id uuid;
  v_keep_variants uuid[] := '{}';
  v_attr jsonb;
  v_value_id text;
  v_count int;
begin
  select * into v_type
  from public.product_types
  where store_id = p_store_id and id = (p_input ->> 'product_type_id')::uuid;
  if not found then
    raise exception 'Product type not found' using errcode = '23503', hint = 'product_type_id';
  end if;

  v_count := jsonb_array_length(coalesce(p_input -> 'variants', '[]'::jsonb));
  if v_count = 0 then
    raise exception 'A product needs at least one variant' using errcode = '23514', hint = 'variants';
  end if;
  if not v_type.has_variants and v_count > 1 then
    raise exception 'This product type has no variants' using errcode = '23514', hint = 'variants';
  end if;

  if v_product_id is null then
    insert into public.products (
      store_id, product_type_id, category_id, brand_id, name, slug, description, description_plain, status,
      featured, badge, seo_title, seo_description
    ) values (
      p_store_id,
      v_type.id,
      nullif(p_input ->> 'category_id', '')::uuid,
      nullif(p_input ->> 'brand_id', '')::uuid,
      p_input ->> 'name',
      p_input ->> 'slug',
      jsonb_build_object('format', 'plain', 'text', coalesce(p_input ->> 'description', '')),
      coalesce(p_input ->> 'description', ''),
      coalesce(p_input ->> 'status', 'draft')::public.product_status,
      coalesce((p_input ->> 'featured')::boolean, false),
      nullif(p_input ->> 'badge', ''),
      nullif(p_input ->> 'seo_title', ''),
      nullif(p_input ->> 'seo_description', '')
    )
    returning id into v_product_id;
  else
    update public.products set
      product_type_id = v_type.id,
      category_id = nullif(p_input ->> 'category_id', '')::uuid,
      brand_id = nullif(p_input ->> 'brand_id', '')::uuid,
      name = p_input ->> 'name',
      slug = p_input ->> 'slug',
      description = jsonb_build_object('format', 'plain', 'text', coalesce(p_input ->> 'description', '')),
      description_plain = coalesce(p_input ->> 'description', ''),
      status = coalesce(p_input ->> 'status', 'draft')::public.product_status,
      featured = coalesce((p_input ->> 'featured')::boolean, false),
      badge = nullif(p_input ->> 'badge', ''),
      seo_title = nullif(p_input ->> 'seo_title', ''),
      seo_description = nullif(p_input ->> 'seo_description', '')
    where store_id = p_store_id and id = v_product_id;
    if not found then
      raise exception 'Product not found' using errcode = 'P0002';
    end if;
  end if;

  -- Tags
  delete from public.product_tags where product_id = v_product_id;
  insert into public.product_tags (store_id, product_id, tag)
  select distinct p_store_id, v_product_id, btrim(t)
  from jsonb_array_elements_text(coalesce(p_input -> 'tags', '[]'::jsonb)) t
  where btrim(t) <> '';

  -- Collections (keep the position of the ones that stay)
  delete from public.collection_products cp
  where cp.product_id = v_product_id
    and cp.collection_id not in (
      select (c)::uuid from jsonb_array_elements_text(coalesce(p_input -> 'collection_ids', '[]'::jsonb)) c
    );
  insert into public.collection_products (store_id, collection_id, product_id, sort_order)
  select p_store_id, (c)::uuid, v_product_id,
         coalesce((select max(cp.sort_order) + 1 from public.collection_products cp where cp.collection_id = (c)::uuid), 0)
  from jsonb_array_elements_text(coalesce(p_input -> 'collection_ids', '[]'::jsonb)) c
  on conflict (collection_id, product_id) do nothing;

  -- Product attributes (must be product-scoped attributes of the type)
  delete from public.product_attribute_values where product_id = v_product_id;
  for v_attr in select * from jsonb_array_elements(coalesce(p_input -> 'attributes', '[]'::jsonb)) loop
    if not exists (
      select 1 from public.product_type_attributes pta
      where pta.product_type_id = v_type.id and pta.attribute_id = (v_attr ->> 'attribute_id')::uuid and pta.scope = 'product'
    ) then
      raise exception 'Attribute is not a product attribute of this type' using errcode = '23514', hint = 'attributes';
    end if;
    if jsonb_array_length(coalesce(v_attr -> 'value_ids', '[]'::jsonb)) > 0 then
      for v_value_id in select * from jsonb_array_elements_text(v_attr -> 'value_ids') loop
        insert into public.product_attribute_values (store_id, product_id, attribute_id, value_id)
        values (p_store_id, v_product_id, (v_attr ->> 'attribute_id')::uuid, v_value_id::uuid);
      end loop;
    elsif coalesce(v_attr ->> 'value_text', v_attr ->> 'value_numeric', v_attr ->> 'value_boolean', v_attr ->> 'value_date') is not null then
      insert into public.product_attribute_values (
        store_id, product_id, attribute_id, value_text, value_numeric, value_boolean, value_date
      ) values (
        p_store_id, v_product_id, (v_attr ->> 'attribute_id')::uuid,
        nullif(v_attr ->> 'value_text', ''), (v_attr ->> 'value_numeric')::numeric,
        (v_attr ->> 'value_boolean')::boolean, (v_attr ->> 'value_date')::date
      );
    end if;
  end loop;

  select id into v_default_warehouse from public.warehouses where store_id = p_store_id and is_default;

  -- Variants: existing ones (by id) are updated, new ones inserted, missing ones deleted.
  for v_variant in select * from jsonb_array_elements(p_input -> 'variants') loop
    v_variant_id := nullif(v_variant ->> 'id', '')::uuid;
    if v_variant_id is null then
      insert into public.product_variants (
        store_id, product_id, sku, name, sort_order, is_default, track_inventory, weight, price, compare_at_price
      ) values (
        p_store_id, v_product_id, v_variant ->> 'sku', coalesce(v_variant ->> 'name', ''),
        coalesce((v_variant ->> 'sort_order')::int, 0), not v_type.has_variants,
        coalesce((v_variant ->> 'track_inventory')::boolean, true), (v_variant ->> 'weight')::numeric,
        (v_variant ->> 'price')::numeric, (v_variant ->> 'compare_at_price')::numeric
      )
      returning id into v_variant_id;
    else
      update public.product_variants set
        sku = v_variant ->> 'sku',
        name = coalesce(v_variant ->> 'name', ''),
        sort_order = coalesce((v_variant ->> 'sort_order')::int, 0),
        is_default = not v_type.has_variants,
        track_inventory = coalesce((v_variant ->> 'track_inventory')::boolean, true),
        weight = (v_variant ->> 'weight')::numeric,
        price = (v_variant ->> 'price')::numeric,
        compare_at_price = (v_variant ->> 'compare_at_price')::numeric
      where store_id = p_store_id and product_id = v_product_id and id = v_variant_id;
      if not found then
        raise exception 'Variant not found in this product' using errcode = 'P0002', hint = 'variants';
      end if;
    end if;
    v_keep_variants := v_keep_variants || v_variant_id;

    -- Variant attributes (variant-scoped attributes of the type)
    delete from public.variant_attribute_values where variant_id = v_variant_id;
    for v_attr in select * from jsonb_array_elements(coalesce(v_variant -> 'attribute_values', '[]'::jsonb)) loop
      if not exists (
        select 1 from public.product_type_attributes pta
        where pta.product_type_id = v_type.id and pta.attribute_id = (v_attr ->> 'attribute_id')::uuid and pta.scope = 'variant'
      ) then
        raise exception 'Attribute is not a variant attribute of this type' using errcode = '23514', hint = 'variants';
      end if;
      insert into public.variant_attribute_values (store_id, variant_id, attribute_id, value_id)
      values (p_store_id, v_variant_id, (v_attr ->> 'attribute_id')::uuid, (v_attr ->> 'value_id')::uuid);
    end loop;

    -- Cost (private)
    if v_variant ? 'cost' then
      if jsonb_typeof(v_variant -> 'cost') = 'null' then
        delete from public.variant_costs where variant_id = v_variant_id;
      else
        insert into public.variant_costs (store_id, variant_id, cost_price, cost_currency)
        values (p_store_id, v_variant_id, (v_variant -> 'cost' ->> 'price')::numeric, v_variant -> 'cost' ->> 'currency')
        on conflict (variant_id) do update
        set cost_price = excluded.cost_price, cost_currency = excluded.cost_currency;
      end if;
    end if;

    -- Per-currency price overrides (multi_currency, enforced by trigger)
    if v_variant ? 'prices' then
      delete from public.variant_prices where variant_id = v_variant_id;
      insert into public.variant_prices (store_id, variant_id, currency, price, compare_at_price)
      select p_store_id, v_variant_id, x ->> 'currency', (x ->> 'price')::numeric, (x ->> 'compare_at_price')::numeric
      from jsonb_array_elements(v_variant -> 'prices') x;
    end if;

    -- Stock in the default warehouse ("flat" editing); per-warehouse editing uses set_stock_quantity.
    if (v_variant ->> 'stock') is not null then
      perform public.set_stock_quantity(
        p_store_id, v_variant_id, v_default_warehouse, (v_variant ->> 'stock')::int, 'adjustment', null, p_user_id
      );
    end if;

    -- Media assigned to the variant
    if v_variant ? 'media_ids' then
      delete from public.variant_media where variant_id = v_variant_id;
      insert into public.variant_media (store_id, variant_id, media_id)
      select p_store_id, v_variant_id, (m)::uuid from jsonb_array_elements_text(v_variant -> 'media_ids') m;
    end if;
  end loop;

  delete from public.product_variants
  where product_id = v_product_id and not (id = any (v_keep_variants));

  -- Recompute the denormalized summary once all children are in place.
  perform private.refresh_product_summary(v_product_id);

  return v_product_id;
end;
$$;

-- Bulk status change (publish / archive / back to draft) from the admin listing.
create function public.set_products_status(p_store_id uuid, p_product_ids uuid[], p_status public.product_status)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.products set status = p_status
  where store_id = p_store_id and id = any (p_product_ids) and status <> p_status;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Reorder rows of a store table by an ordered list of ids (categories, collections, media, attribute values).
create function public.reorder_catalog(p_store_id uuid, p_table text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_table not in ('categories', 'collections', 'attributes', 'attribute_values', 'product_media') then
    raise exception 'Table % cannot be reordered', p_table using errcode = '22023';
  end if;
  execute format(
    'update public.%I t set sort_order = o.ord - 1
     from unnest($2) with ordinality as o(id, ord)
     where t.store_id = $1 and t.id = o.id', p_table)
  using p_store_id, p_ids;
end;
$$;

revoke all on function public.set_stock_quantity(uuid, uuid, uuid, int, public.stock_movement_type, text, uuid, uuid),
  public.set_store_currency(uuid, text, numeric, boolean, numeric, uuid),
  public.save_product(uuid, jsonb, uuid),
  public.set_products_status(uuid, uuid[], public.product_status),
  public.reorder_catalog(uuid, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.set_stock_quantity(uuid, uuid, uuid, int, public.stock_movement_type, text, uuid, uuid),
  public.set_store_currency(uuid, text, numeric, boolean, numeric, uuid),
  public.save_product(uuid, jsonb, uuid),
  public.set_products_status(uuid, uuid[], public.product_status),
  public.reorder_catalog(uuid, text, uuid[])
  to service_role;

-- ---------------------------------------------------------------------------
-- Admin product search (pg_graphql query field). Runs as the caller: RLS limits it to the store's
-- staff for drafts; anon only ever sees published products of active stores.
-- ---------------------------------------------------------------------------

create function public.admin_search_products(
  p_store_id uuid,
  p_query text default null,
  p_status public.product_status default null,
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_product_type_id uuid default null,
  p_low_stock boolean default null
)
returns setof public.products
language sql
stable
security invoker
set search_path = ''
as $$
  select p.*
  from public.products p
  where p.store_id = p_store_id
    and (p_status is null or p.status = p_status)
    and (p_status is not null or p.status <> 'archived')
    and (p_brand_id is null or p.brand_id = p_brand_id)
    and (p_product_type_id is null or p.product_type_id = p_product_type_id)
    and (p_category_id is null or p.category_id in (
      select c.id from public.categories c
      where c.store_id = p_store_id
        and c.path operator(extensions.<@) (select c2.path from public.categories c2 where c2.id = p_category_id)
    ))
    and (p_low_stock is not true or exists (
      select 1 from public.product_variants v
      where v.product_id = p.id and v.track_inventory and v.stock_available <= 3
    ))
    and (
      coalesce(btrim(p_query), '') = ''
      or p.search_vector @@ websearch_to_tsquery('spanish'::regconfig, extensions.unaccent(p_query))
      or p.name ilike '%' || p_query || '%'
      or exists (select 1 from public.product_variants v where v.product_id = p.id and v.sku ilike p_query || '%')
    )
  order by p.updated_at desc;
$$;

revoke all on function public.admin_search_products(uuid, text, public.product_status, uuid, uuid, uuid, boolean)
  from public, anon;
grant execute on function public.admin_search_products(uuid, text, public.product_status, uuid, uuid, uuid, boolean)
  to authenticated, service_role;
comment on function public.admin_search_products(uuid, text, public.product_status, uuid, uuid, uuid, boolean)
  is e'@graphql({"totalCount": {"enabled": true}})';
