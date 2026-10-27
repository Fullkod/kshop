-- R10: catalog read policies without a function call per row, and facets that search the catalog once.
--
-- 1. RLS. The read policies of products and their child tables called private.product_is_public(product_id) or
--    private.variant_is_public(variant_id) on every row: a security definer function reading products and stores
--    (and product_variants) once per variant, price, value or image. Reading the 777 variants of the Demo store as
--    anon cost 3 968 blocks and 16-101 ms. The policies now use uncorrelated subqueries over set-returning helpers
--    (product_id in (select private.public_product_ids())): Postgres turns them into a hashed SubPlan built once per
--    query (also once per nested pg_graphql collection, not once per parent row). Same read: 531 blocks, 2.9 ms.
--    The visibility rules do not change: published products of active stores for everyone, everything for the
--    store's staff and the superadmin. The cost is now one pass over the published products of the platform per
--    query instead of three lookups per row read.
-- 2. storefront_product_facets ran private.storefront_product_ids once per filterable attribute plus three more
--    times (total, price range, brands): 267 ms and 23 563 blocks for the Demo store without any filter. The ids
--    are now computed once; an attribute searches again only when one of its values is selected (its facet ignores
--    its own filter), the price range only when a price filter is set and the brands only when a brand is selected.

-- ---------------------------------------------------------------------------
-- Public id sets (security definer: they read the catalog without RLS, and only return ids)
-- ---------------------------------------------------------------------------

create function private.public_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.stores s where s.status = 'active';
$$;

create function private.public_product_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.products p
  join public.stores s on s.id = p.store_id
  where p.status = 'published' and s.status = 'active';
$$;

create function private.public_variant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select v.id
  from public.product_variants v
  join public.products p on p.id = v.product_id
  join public.stores s on s.id = p.store_id
  where p.status = 'published' and s.status = 'active';
$$;

revoke all on function private.public_store_ids(), private.public_product_ids(), private.public_variant_ids()
  from public;
grant execute on function private.public_store_ids(), private.public_product_ids(), private.public_variant_ids()
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Read policies (same names, same rules)
-- ---------------------------------------------------------------------------

drop policy "products: published in active stores, all for staff" on public.products;
create policy "products: published in active stores, all for staff" on public.products for select
to anon, authenticated
using ((status = 'published' and store_id in (select private.public_store_ids()))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

drop policy "collection_products: public pairs, all for staff" on public.collection_products;
create policy "collection_products: public pairs, all for staff" on public.collection_products for select
to anon, authenticated
using ((product_id in (select private.public_product_ids())
    and exists (select 1 from public.collections c where c.id = collection_id and c.is_published))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

drop policy "product_tags: with a public product, all for staff" on public.product_tags;
create policy "product_tags: with a public product, all for staff" on public.product_tags for select
to anon, authenticated
using (product_id in (select private.public_product_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

drop policy "product_attribute_values: with a public product, all for staff" on public.product_attribute_values;
create policy "product_attribute_values: with a public product, all for staff" on public.product_attribute_values
for select to anon, authenticated
using (product_id in (select private.public_product_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

drop policy "product_variants: with a public product, all for staff" on public.product_variants;
create policy "product_variants: with a public product, all for staff" on public.product_variants for select
to anon, authenticated
using (product_id in (select private.public_product_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

drop policy "product_media: with a public product, all for staff" on public.product_media;
create policy "product_media: with a public product, all for staff" on public.product_media for select
to anon, authenticated
using (product_id in (select private.public_product_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

drop policy "variant_attribute_values: with a public variant, all for staff" on public.variant_attribute_values;
create policy "variant_attribute_values: with a public variant, all for staff" on public.variant_attribute_values
for select to anon, authenticated
using (variant_id in (select private.public_variant_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

drop policy "variant_prices: with a public variant, all for staff" on public.variant_prices;
create policy "variant_prices: with a public variant, all for staff" on public.variant_prices for select
to anon, authenticated
using (variant_id in (select private.public_variant_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

drop policy "variant_media: with a public variant, all for staff" on public.variant_media;
create policy "variant_media: with a public variant, all for staff" on public.variant_media for select
to anon, authenticated
using (variant_id in (select private.public_variant_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

-- Nothing else calls the per-row helpers.
drop function private.product_is_public(uuid);
drop function private.variant_is_public(uuid);

-- ---------------------------------------------------------------------------
-- Facets: one search, not one per attribute
-- ---------------------------------------------------------------------------

create or replace function public.storefront_product_facets(
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
  -- Products matching every filter (computed once).
  v_base uuid[];
  -- Attributes with a selected value: their facet is counted without their own filter (selecting Talla M still
  -- shows the other sizes), so only they need a search of their own.
  v_selected_attributes uuid[];
  v_ids uuid[];
  v_price_ids uuid[];
  v_brand_ids uuid[];
  v_attr record;
  v_attributes jsonb := '[]';
  v_values_json jsonb;
  v_result jsonb;
begin
  select coalesce(array_agg(id), '{}') into v_base
  from private.storefront_product_ids(p_store_id, p_query, p_category_id, p_collection_id, v_brands, v_values,
    p_min_price, p_max_price, p_in_stock, p_on_sale) id;

  select coalesce(array_agg(distinct av.attribute_id), '{}') into v_selected_attributes
  from public.attribute_values av
  where av.store_id = p_store_id and av.id = any (coalesce(v_values, '{}'));

  for v_attr in
    select a.id, a.name, a.slug, a.input_type, a.unit
    from public.attributes a
    where a.store_id = p_store_id and a.filterable_in_storefront and a.visible_in_storefront
    order by a.sort_order, a.name
  loop
    if v_attr.id = any (v_selected_attributes) then
      select coalesce(array_agg(id), '{}') into v_ids
      from private.storefront_product_ids(p_store_id, p_query, p_category_id, p_collection_id, v_brands, v_values,
        p_min_price, p_max_price, p_in_stock, p_on_sale, v_attr.id) id;
    else
      v_ids := v_base;
    end if;

    with product_values as (
      select distinct v.product_id, vav.value_id
      from public.variant_attribute_values vav
      join public.product_variants v on v.id = vav.variant_id and v.store_id = p_store_id
      where vav.store_id = p_store_id and vav.attribute_id = v_attr.id and v.product_id = any (v_ids)
      union
      select pav.product_id, pav.value_id
      from public.product_attribute_values pav
      where pav.store_id = p_store_id and pav.attribute_id = v_attr.id and pav.value_id is not null
        and pav.product_id = any (v_ids)
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

  -- Price range without the price filter itself; brands without the brand filter itself.
  if p_min_price is null and p_max_price is null then
    v_price_ids := v_base;
  else
    select coalesce(array_agg(id), '{}') into v_price_ids
    from private.storefront_product_ids(p_store_id, p_query, p_category_id, p_collection_id, v_brands, v_values,
      null, null, p_in_stock, p_on_sale) id;
  end if;
  if v_brands is null then
    v_brand_ids := v_base;
  else
    select coalesce(array_agg(id), '{}') into v_brand_ids
    from private.storefront_product_ids(p_store_id, p_query, p_category_id, p_collection_id, null, v_values,
      p_min_price, p_max_price, p_in_stock, p_on_sale) id;
  end if;

  select jsonb_build_object(
    'total', coalesce(array_length(v_base, 1), 0),
    'price', (select jsonb_build_object('min', min(p.min_price), 'max', max(p.max_price))
      from public.products p where p.id = any (v_price_ids)),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug,
        'count', x.n, 'selected', b.id = any (coalesce(v_brands, '{}'))) order by b.name)
      from (select p.brand_id, count(*) as n from public.products p
        where p.id = any (v_brand_ids) and p.brand_id is not null
        group by p.brand_id) x
      join public.brands b on b.id = x.brand_id), '[]'),
    'attributes', v_attributes
  ) into v_result;
  return v_result;
end;
$$;
