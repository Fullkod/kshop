-- Phase 2: public catalog reads for the storefront (D8, D9). All functions are security invoker, so the
-- catalog RLS still applies: anon only ever sees published products of active stores, never costs.
-- pg_graphql 1.6 exposes them: no enum arguments, lists as comma-separated text, ordering and numbered
-- pagination (first/offset/totalCount) done by pg_graphql on the returned products.

-- The search function returns products.*; anon needs the column to call it. It is derived from public data
-- (name, SKUs, tags, description) of rows RLS already lets them read.
grant select (search_vector) on public.products to anon;

-- "a,b,c" -> uuid[] (empty or null -> null).
create function private.uuid_list(p_list text)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(btrim(p_list), '') = '' then null
    else (select array_agg(btrim(x)::uuid) from unnest(string_to_array(p_list, ',')) x where btrim(x) <> '')
  end;
$$;

-- Automatic collections (D8): rules = { categoryId?, brandId?, tags?[], onSale?, newerThanDays?, featured?,
-- inStock? } — every rule present must hold.
create function private.product_matches_rules(
  p_product_id uuid,
  p_category_id uuid,
  p_brand_id uuid,
  p_featured boolean,
  p_in_stock boolean,
  p_published_at timestamptz,
  p_rules jsonb
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    (p_rules ->> 'categoryId' is null or p_category_id in (
      select c.id from public.categories c
      where c.path operator(extensions.<@) (
        select c2.path from public.categories c2 where c2.id = (p_rules ->> 'categoryId')::uuid)))
    and (p_rules ->> 'brandId' is null or p_brand_id = (p_rules ->> 'brandId')::uuid)
    and (jsonb_array_length(coalesce(p_rules -> 'tags', '[]')) = 0 or exists (
      select 1 from public.product_tags t
      where t.product_id = p_product_id and t.tag in (select jsonb_array_elements_text(p_rules -> 'tags'))))
    and (coalesce((p_rules ->> 'onSale')::boolean, false) = false or exists (
      select 1 from public.product_variants v
      where v.product_id = p_product_id and v.compare_at_price > v.price))
    and (p_rules ->> 'newerThanDays' is null
      or p_published_at >= now() - make_interval(days => (p_rules ->> 'newerThanDays')::int))
    and (coalesce((p_rules ->> 'featured')::boolean, false) = false or p_featured)
    and (coalesce((p_rules ->> 'inStock')::boolean, false) = false or p_in_stock);
$$;

-- Ids of the published products that match every filter. Attribute values: OR inside an attribute, AND
-- between attributes; p_ignore_attribute_id drops one attribute (facet counts of that attribute).
create function private.storefront_product_ids(
  p_store_id uuid,
  p_query text,
  p_category_id uuid,
  p_collection_id uuid,
  p_brand_ids uuid[],
  p_value_ids uuid[],
  p_min_price numeric,
  p_max_price numeric,
  p_in_stock boolean,
  p_on_sale boolean,
  p_ignore_attribute_id uuid default null
)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  with filter_groups as (
    select av.attribute_id, array_agg(av.id) as ids
    from public.attribute_values av
    where av.store_id = p_store_id and av.id = any (p_value_ids)
      and av.attribute_id is distinct from p_ignore_attribute_id
    group by av.attribute_id
  )
  select p.id
  from public.products p
  where p.store_id = p_store_id
    and p.status = 'published'
    and (p_brand_ids is null or p.brand_id = any (p_brand_ids))
    and (p_min_price is null or p.min_price >= p_min_price)
    and (p_max_price is null or p.min_price <= p_max_price)
    and (p_in_stock is not true or p.in_stock)
    and (p_on_sale is not true or exists (
      select 1 from public.product_variants v
      where v.product_id = p.id and v.compare_at_price > v.price))
    and (p_category_id is null or p.category_id in (
      select c.id from public.categories c
      where c.store_id = p_store_id
        and c.path operator(extensions.<@) (select c2.path from public.categories c2 where c2.id = p_category_id)))
    and (p_collection_id is null or exists (
      select 1 from public.collections col
      where col.id = p_collection_id and col.store_id = p_store_id
        and (
          (col.rules is null and exists (
            select 1 from public.collection_products cp where cp.collection_id = col.id and cp.product_id = p.id))
          or (col.rules is not null and private.product_matches_rules(
            p.id, p.category_id, p.brand_id, p.featured, p.in_stock, p.published_at, col.rules))
        )))
    and not exists (
      select 1 from filter_groups g
      where not exists (
          select 1 from public.variant_attribute_values vav
          join public.product_variants v on v.id = vav.variant_id
          where v.product_id = p.id and vav.store_id = p_store_id and vav.value_id = any (g.ids))
        and not exists (
          select 1 from public.product_attribute_values pav
          where pav.product_id = p.id and pav.store_id = p_store_id and pav.value_id = any (g.ids)))
    and (
      coalesce(btrim(p_query), '') = ''
      or p.search_vector @@ websearch_to_tsquery('spanish'::regconfig, extensions.unaccent(p_query))
      or extensions.unaccent(p.name) ilike '%' || extensions.unaccent(btrim(p_query)) || '%'
      or exists (select 1 from public.product_variants v where v.product_id = p.id and v.sku ilike btrim(p_query) || '%')
      or exists (select 1 from public.brands b where b.id = p.brand_id
        and extensions.unaccent(b.name) ilike '%' || extensions.unaccent(btrim(p_query)) || '%')
      or exists (select 1 from public.categories c where c.id = p.category_id
        and extensions.unaccent(c.name) ilike '%' || extensions.unaccent(btrim(p_query)) || '%')
    );
$$;

-- Listing / search / collection page: the matching products (ordering and pagination by pg_graphql).
create function public.storefront_search_products(
  p_store_id uuid,
  p_query text default null,
  p_category_id uuid default null,
  p_collection_id uuid default null,
  p_brand_ids text default null,
  p_value_ids text default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_in_stock boolean default null,
  p_on_sale boolean default null
)
returns setof public.products
language sql
stable
security invoker
set search_path = ''
as $$
  select p.*
  from public.products p
  where p.id in (
    select private.storefront_product_ids(p_store_id, p_query, p_category_id, p_collection_id,
      private.uuid_list(p_brand_ids), private.uuid_list(p_value_ids), p_min_price, p_max_price, p_in_stock, p_on_sale));
$$;

-- Filter panel: total, price range, brands and values of the filterable attributes with their counts.
-- Each facet is counted with every other filter applied (selecting Talla M still shows the other sizes).
create function public.storefront_product_facets(
  p_store_id uuid,
  p_query text default null,
  p_category_id uuid default null,
  p_collection_id uuid default null,
  p_brand_ids text default null,
  p_value_ids text default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_in_stock boolean default null,
  p_on_sale boolean default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_brands uuid[] := private.uuid_list(p_brand_ids);
  v_values uuid[] := private.uuid_list(p_value_ids);
  v_attr record;
  v_attributes jsonb := '[]';
  v_values_json jsonb;
  v_result jsonb;
begin
  for v_attr in
    select a.id, a.name, a.slug, a.input_type, a.unit
    from public.attributes a
    where a.store_id = p_store_id and a.filterable_in_storefront and a.visible_in_storefront
    order by a.sort_order, a.name
  loop
    with ids as (
      select private.storefront_product_ids(p_store_id, p_query, p_category_id, p_collection_id, v_brands,
        v_values, p_min_price, p_max_price, p_in_stock, p_on_sale, v_attr.id) as id
    ), product_values as (
      select distinct v.product_id, vav.value_id
      from public.variant_attribute_values vav
      join public.product_variants v on v.id = vav.variant_id
      where vav.store_id = p_store_id and vav.attribute_id = v_attr.id and v.product_id in (select id from ids)
      union
      select pav.product_id, pav.value_id
      from public.product_attribute_values pav
      where pav.store_id = p_store_id and pav.attribute_id = v_attr.id and pav.value_id is not null
        and pav.product_id in (select id from ids)
    )
    select jsonb_agg(jsonb_build_object(
        'id', av.id, 'name', av.name, 'slug', av.slug, 'value', av.value, 'count', x.n,
        'selected', av.id = any (coalesce(v_values, '{}')))
        order by av.sort_order, av.name)
    into v_values_json
    from (select value_id, count(*) as n from product_values group by value_id) x
    join public.attribute_values av on av.id = x.value_id;

    if v_values_json is not null then
      v_attributes := v_attributes || jsonb_build_array(jsonb_build_object(
        'id', v_attr.id, 'name', v_attr.name, 'slug', v_attr.slug, 'inputType', v_attr.input_type,
        'unit', v_attr.unit, 'values', v_values_json));
    end if;
  end loop;

  select jsonb_build_object(
    'total', (select count(*) from private.storefront_product_ids(p_store_id, p_query, p_category_id,
      p_collection_id, v_brands, v_values, p_min_price, p_max_price, p_in_stock, p_on_sale)),
    -- Price range without the price filter itself.
    'price', (select jsonb_build_object('min', min(p.min_price), 'max', max(p.max_price))
      from public.products p where p.id in (select private.storefront_product_ids(p_store_id, p_query,
        p_category_id, p_collection_id, v_brands, v_values, null, null, p_in_stock, p_on_sale))),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug,
        'count', x.n, 'selected', b.id = any (coalesce(v_brands, '{}'))) order by b.name)
      from (select p.brand_id, count(*) as n from public.products p
        where p.id in (select private.storefront_product_ids(p_store_id, p_query, p_category_id,
          p_collection_id, null, v_values, p_min_price, p_max_price, p_in_stock, p_on_sale))
          and p.brand_id is not null
        group by p.brand_id) x
      join public.brands b on b.id = x.brand_id), '[]'),
    'attributes', v_attributes
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function private.uuid_list(text) from public;
revoke all on function private.product_matches_rules(uuid, uuid, uuid, boolean, boolean, timestamptz, jsonb) from public;
revoke all on function private.storefront_product_ids(uuid, text, uuid, uuid, uuid[], uuid[], numeric, numeric,
  boolean, boolean, uuid) from public;
grant execute on function private.uuid_list(text) to anon, authenticated, service_role;
grant execute on function private.product_matches_rules(uuid, uuid, uuid, boolean, boolean, timestamptz, jsonb)
  to anon, authenticated, service_role;
grant execute on function private.storefront_product_ids(uuid, text, uuid, uuid, uuid[], uuid[], numeric, numeric,
  boolean, boolean, uuid) to anon, authenticated, service_role;

revoke all on function public.storefront_search_products(uuid, text, uuid, uuid, text, text, numeric, numeric,
  boolean, boolean) from public;
revoke all on function public.storefront_product_facets(uuid, text, uuid, uuid, text, text, numeric, numeric,
  boolean, boolean) from public;
grant execute on function public.storefront_search_products(uuid, text, uuid, uuid, text, text, numeric, numeric,
  boolean, boolean) to anon, authenticated, service_role;
grant execute on function public.storefront_product_facets(uuid, text, uuid, uuid, text, text, numeric, numeric,
  boolean, boolean) to anon, authenticated, service_role;
