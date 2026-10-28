-- R11: the public storefront leaves pg_graphql too (decision of Roberto, 2026-10-28), so the extension can go.
-- One function per storefront query of packages/data (storefront-queries.ts, queries.ts), named sf_<operation> and
-- taking the query's variables as one jsonb (p_vars): createRpcGraphqlClient sends every operation here instead of
-- /graphql/v1, so storefront-reads.ts keeps its logic and types. Each returns exactly what pg_graphql returned
-- (numeric and jsonb as text, timestamps as to_jsonb, primary key as the last sort key, cursors as offsets);
-- scripts/compare-storefront-reads.mjs checks them against pg_graphql as anon. Security invoker: the same RLS
-- (published products of active stores, visible content), executable by anon and authenticated.

-- ---------------------------------------------------------------------------
-- Shared pieces (private: not exposed by PostgREST)
-- ---------------------------------------------------------------------------

-- Promotion applied to a variant (one row per variant), as the variantPromotions object.
create function private.sf_variant_promotion(p_variant_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'promoPrice', vp.promo_price::text, 'reward', vp.reward, 'value', vp.value::text,
    'promotionName', vp.promotion_name
  )
  from public.variant_promotions vp where vp.variant_id = p_variant_id;
$$;

-- StorefrontProductCard fragment.
create function private.sf_product_card(p public.products)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'name', p.name,
    'minPrice', p.min_price::text,
    'maxPrice', p.max_price::text,
    'inStock', p.in_stock,
    'badge', p.badge,
    'primaryMediaUrl', p.primary_media_url,
    'brands', (select jsonb_build_object('name', b.name) from public.brands b where b.id = p.brand_id),
    'productVariantsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', v.id,
        'trackInventory', v.track_inventory,
        'stockAvailable', v.stock_available,
        'price', v.price::text,
        'compareAtPrice', v.compare_at_price::text,
        'variantAttributeValuesCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'attributeValues', (select jsonb_build_object('value', av.value)
                                from public.attribute_values av where av.id = x.value_id)
          )) order by x.attribute_id)
          from (
            select attribute_id, value_id from public.variant_attribute_values where variant_id = v.id
            order by attribute_id limit 5
          ) x
        ), '[]'::jsonb)),
        'variantPromotions', private.sf_variant_promotion(v.id),
        'variantPricesCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'currency', x.currency, 'price', x.price::text
          )) order by x.currency)
          from (select currency, price from public.variant_prices where variant_id = v.id order by currency limit 3) x
        ), '[]'::jsonb))
      )) order by v.id)
      from (
        select id, track_inventory, stock_available, price, compare_at_price
        from public.product_variants where product_id = p.id order by id limit 20
      ) v
    ), '[]'::jsonb))
  );
$$;

-- StorefrontProductFull fragment.
create function private.sf_product_full(p public.products)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'name', p.name,
    'description', p.description::text,
    'descriptionPlain', p.description_plain,
    'seoTitle', p.seo_title,
    'seoDescription', p.seo_description,
    'minPrice', p.min_price::text,
    'maxPrice', p.max_price::text,
    'inStock', p.in_stock,
    'primaryMediaUrl', p.primary_media_url,
    'categoryId', p.category_id,
    'brands', (select jsonb_build_object('name', b.name, 'slug', b.slug) from public.brands b where b.id = p.brand_id),
    'categories', (
      select jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'parentId', c.parent_id)
      from public.categories c where c.id = p.category_id
    ),
    'productMediaCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', m.id, 'url', m.url, 'thumbUrl', m.thumb_url, 'alt', m.alt
      )) order by m.sort_order nulls last, m.id)
      from (
        select id, url, thumb_url, alt, sort_order from public.product_media where product_id = p.id
        order by sort_order nulls last, id limit 30
      ) m
    ), '[]'::jsonb)),
    'productAttributeValuesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'valueText', a.value_text,
        'valueNumeric', a.value_numeric::text,
        'valueBoolean', a.value_boolean,
        'valueDate', a.value_date,
        'attributes', (
          select jsonb_build_object('name', t.name, 'unit', t.unit, 'visibleInStorefront', t.visible_in_storefront,
                                    'sortOrder', t.sort_order)
          from public.attributes t where t.id = a.attribute_id
        ),
        'attributeValues', (select jsonb_build_object('name', av.name) from public.attribute_values av
                            where av.id = a.value_id)
      )) order by a.id)
      from (select * from public.product_attribute_values where product_id = p.id order by id limit 50) a
    ), '[]'::jsonb)),
    'productVariantsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', v.id,
        'sku', v.sku,
        'name', v.name,
        'price', v.price::text,
        'compareAtPrice', v.compare_at_price::text,
        'trackInventory', v.track_inventory,
        'stockAvailable', v.stock_available,
        'variantPromotions', private.sf_variant_promotion(v.id),
        'variantPricesCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'currency', x.currency, 'price', x.price::text, 'compareAtPrice', x.compare_at_price::text
          )) order by x.currency)
          from (select * from public.variant_prices where variant_id = v.id order by currency limit 3) x
        ), '[]'::jsonb)),
        'variantMediaCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object('mediaId', x.media_id)) order by x.media_id)
          from (select media_id from public.variant_media where variant_id = v.id order by media_id limit 10) x
        ), '[]'::jsonb)),
        'variantAttributeValuesCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'attributeId', x.attribute_id,
            'valueId', x.value_id,
            'attributeValues', (
              select jsonb_build_object(
                'name', av.name, 'slug', av.slug, 'value', av.value, 'sortOrder', av.sort_order,
                'attributes', (select jsonb_build_object('name', t.name, 'slug', t.slug, 'sortOrder', t.sort_order)
                               from public.attributes t where t.id = av.attribute_id)
              )
              from public.attribute_values av where av.id = x.value_id
            )
          )) order by x.attribute_id)
          from (
            select attribute_id, value_id from public.variant_attribute_values where variant_id = v.id
            order by attribute_id limit 10
          ) x
        ), '[]'::jsonb))
      )) order by v.sort_order nulls last, v.id)
      from (
        select * from public.product_variants where product_id = p.id order by sort_order nulls last, id limit 100
      ) v
    ), '[]'::jsonb))
  );
$$;

-- Sort key of the product listings (sortOrderBy in @kshop/core): pg_graphql's orderBy for the keys the storefront
-- uses (minPrice, name, publishedAt; AscNullsLast / DescNullsLast), position by position, then the primary key.
-- Anything else sorts by id only.
create function private.sf_order_key(p_order_by jsonb, p_position int, p_key text, p_direction text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_order_by -> p_position ->> p_key = p_direction, false);
$$;

-- ---------------------------------------------------------------------------
-- Stores (queries.ts)
-- ---------------------------------------------------------------------------

create function public.sf_store_by_slug(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('storesCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name, 'status', s.status, 'baseCurrency', s.base_currency,
      'whatsappPhone', s.whatsapp_phone, 'logoUrl', s.logo_url, 'theme', s.theme::text, 'description', s.description
    )) order by s.id)
    from (
      select id, slug, name, status, base_currency, whatsapp_phone, logo_url, theme, description
      from public.stores where slug = p_vars ->> 'slug' order by id limit 1
    ) s
  ), '[]'::jsonb)));
$$;

create function public.sf_store_slug_by_id(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('storesCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', jsonb_build_object('slug', s.slug)))
    from (select slug from public.stores where id = (p_vars ->> 'id')::uuid limit 1) s
  ), '[]'::jsonb)));
$$;

create function public.sf_store_slugs(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('storesCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', jsonb_build_object('slug', s.slug)) order by s.id)
    from (select id, slug from public.stores where status = 'active' order by id limit 100) s
  ), '[]'::jsonb)));
$$;

-- ---------------------------------------------------------------------------
-- Shell, home, counts, pages
-- ---------------------------------------------------------------------------

create function public.sf_storefront_shell(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with v as (select (p_vars ->> 'storeId')::uuid as store_id)
  select jsonb_build_object(
    'storefrontFeatures', public.storefront_features((select store_id from v))::text,
    'shippingMethodsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'name', m.name, 'type', m.type, 'price', m.price::text, 'minDays', m.min_days, 'maxDays', m.max_days,
        'freeOverSubtotal', m.free_over_subtotal::text
      )) order by m.sort_order nulls last, m.id)
      from (
        select * from public.shipping_methods where store_id = (select store_id from v) and is_active
        order by sort_order nulls last, id limit 50
      ) m
    ), '[]'::jsonb)),
    'paymentMethodsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object('name', m.name)) order by m.sort_order nulls last, m.id)
      from (
        select * from public.payment_methods where store_id = (select store_id from v) and is_active
        order by sort_order nulls last, id limit 20
      ) m
    ), '[]'::jsonb)),
    'menusCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'location', m.location,
        'menuItemsCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'id', i.id, 'parentId', i.parent_id, 'label', i.label, 'linkType', i.link_type,
            'linkTargetId', i.link_target_id, 'linkUrl', i.link_url
          )) order by i.sort_order nulls last, i.id)
          from (select * from public.menu_items where menu_id = m.id order by sort_order nulls last, id limit 100) i
        ), '[]'::jsonb))
      )) order by m.id)
      from (select * from public.menus where store_id = (select store_id from v) order by id limit 2) m
    ), '[]'::jsonb)),
    'categoriesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', c.id, 'parentId', c.parent_id, 'name', c.name, 'slug', c.slug, 'imageUrl', c.image_url, 'depth', c.depth
      )) order by c.sort_order nulls last, c.name nulls last, c.id)
      from (
        select * from public.categories where store_id = (select store_id from v)
        order by sort_order nulls last, name nulls last, id limit 100
      ) c
    ), '[]'::jsonb)),
    'collectionsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', c.id, 'name', c.name, 'slug', c.slug, 'imageUrl', c.image_url
      )) order by c.id)
      from (select * from public.collections where store_id = (select store_id from v) order by id limit 100) c
    ), '[]'::jsonb)),
    'announcement', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object('settings', h.settings::text))
        order by h.sort_order nulls last, h.id)
      from (
        select * from public.home_sections where store_id = (select store_id from v) and type = 'announcement_bar'
        order by sort_order nulls last, id limit 1
      ) h
    ), '[]'::jsonb)),
    'brandsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', b.id, 'name', b.name, 'slug', b.slug, 'logoUrl', b.logo_url
      )) order by b.name nulls last, b.id)
      from (
        select * from public.brands where store_id = (select store_id from v) order by name nulls last, id limit 100
      ) b
    ), '[]'::jsonb)),
    'pagesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object('id', g.id, 'slug', g.slug, 'title', g.title))
        order by g.id)
      from (select * from public.pages where store_id = (select store_id from v) order by id limit 50) g
    ), '[]'::jsonb)),
    'storeCurrenciesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'currency', s.currency, 'isBase', s.is_base, 'rateToBase', s.rate_to_base::text, 'rounding', s.rounding::text
      )) order by s.store_id, s.currency)
      from (
        select * from public.store_currencies where store_id = (select store_id from v)
        order by store_id, currency limit 5
      ) s
    ), '[]'::jsonb))
  );
$$;

create function public.sf_storefront_home(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('homeSectionsCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
      'id', h.id,
      'type', h.type,
      'title', h.title,
      'sourceCollectionId', h.source_collection_id,
      'sourceCategoryId', h.source_category_id,
      'sourceBrandId', h.source_brand_id,
      'settings', h.settings::text,
      'endsAt', h.ends_at,
      'homeSectionBannersCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'banners', (
            select jsonb_build_object(
              'id', b.id, 'eyebrow', b.eyebrow, 'title', b.title, 'subtitle', b.subtitle, 'ctaLabel', b.cta_label,
              'productId', b.product_id, 'imageUrl', b.image_url, 'imageMobileUrl', b.image_mobile_url, 'alt', b.alt,
              'linkType', b.link_type, 'linkTargetId', b.link_target_id, 'linkUrl', b.link_url
            )
            from public.banners b where b.id = x.banner_id
          )
        )) order by x.sort_order nulls last, x.banner_id)
        from (
          select banner_id, sort_order from public.home_section_banners where section_id = h.id
          order by sort_order nulls last, banner_id limit 8
        ) x
      ), '[]'::jsonb))
    )) order by h.sort_order nulls last, h.id)
    from (
      select * from public.home_sections where store_id = (p_vars ->> 'storeId')::uuid
      order by sort_order nulls last, id limit 30
    ) h
  ), '[]'::jsonb)));
$$;

create function public.sf_storefront_product_counts(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('storefrontProductCounts', public.storefront_product_counts(
    (p_vars ->> 'storeId')::uuid, p_vars ->> 'categoryIds', p_vars ->> 'collectionIds'
  )::text);
$$;

create function public.sf_storefront_page(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('pagesCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
      'id', g.id, 'title', g.title, 'content', g.content, 'seoTitle', g.seo_title,
      'seoDescription', g.seo_description, 'updatedAt', g.updated_at
    )))
    from (
      select * from public.pages
      where store_id = (p_vars ->> 'storeId')::uuid and slug = p_vars ->> 'slug'
      order by id limit 1
    ) g
  ), '[]'::jsonb)));
$$;

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------

-- Home carousel («todo», category, brand, on sale): the filter is always the store, published, and at most one of
-- categoryId.in / brandId.eq / onSale.eq (fetchCarousel).
create function public.sf_storefront_carousel(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with f as (select p_vars -> 'filter' as f, coalesce(p_vars -> 'orderBy', '[]'::jsonb) as o)
  select jsonb_build_object('productsCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', private.sf_product_card(r.prod)) order by r.rn)
    from (
      select p as prod, row_number() over (order by
        case when private.sf_order_key((select o from f), 0, 'minPrice', 'AscNullsLast') then p.min_price end asc nulls last,
        case when private.sf_order_key((select o from f), 0, 'minPrice', 'DescNullsLast') then p.min_price end desc nulls last,
        case when private.sf_order_key((select o from f), 0, 'publishedAt', 'DescNullsLast') then p.published_at end desc nulls last,
        case when private.sf_order_key((select o from f), 0, 'name', 'AscNullsLast') then p.name end asc nulls last,
        case when private.sf_order_key((select o from f), 1, 'name', 'AscNullsLast') then p.name end asc nulls last,
        p.id
      ) as rn
      from public.products p
      where p.store_id = ((select f from f) -> 'storeId' ->> 'eq')::uuid
        and (((select f from f) -> 'status' ->> 'eq') is null
             or p.status = ((select f from f) -> 'status' ->> 'eq')::public.product_status)
        and (((select f from f) -> 'categoryId' -> 'in') is null
             or p.category_id in (select x::uuid from jsonb_array_elements_text((select f from f) -> 'categoryId' -> 'in') x))
        and (((select f from f) -> 'brandId' ->> 'eq') is null
             or p.brand_id = ((select f from f) -> 'brandId' ->> 'eq')::uuid)
        and (((select f from f) -> 'onSale' ->> 'eq') is null
             or p.on_sale = ((select f from f) -> 'onSale' ->> 'eq')::boolean)
      order by rn
      limit (p_vars ->> 'first')::int
    ) r
  ), '[]'::jsonb)));
$$;

-- The listings (search, category, collection, brand pages) and the collection carousel go through the search
-- function, sorted like pg_graphql sorted its result.
create function private.sf_search(p_vars jsonb)
returns setof public.products
language sql
stable
security invoker
set search_path = ''
as $$
  select * from public.storefront_search_products(
    (p_vars ->> 'storeId')::uuid,
    p_vars ->> 'query',
    (p_vars ->> 'categoryId')::uuid,
    (p_vars ->> 'collectionId')::uuid,
    p_vars ->> 'brandIds',
    p_vars ->> 'valueIds',
    (p_vars ->> 'minPrice')::numeric,
    (p_vars ->> 'maxPrice')::numeric,
    (p_vars ->> 'inStock')::boolean,
    (p_vars ->> 'onSale')::boolean
  );
$$;

create function private.sf_search_page(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with o as (select coalesce(p_vars -> 'orderBy', '[]'::jsonb) as o)
  select coalesce((
    select jsonb_agg(jsonb_build_object('node', private.sf_product_card(r.prod)) order by r.rn)
    from (
      select s as prod, row_number() over (order by
        case when private.sf_order_key((select o from o), 0, 'minPrice', 'AscNullsLast') then s.min_price end asc nulls last,
        case when private.sf_order_key((select o from o), 0, 'minPrice', 'DescNullsLast') then s.min_price end desc nulls last,
        case when private.sf_order_key((select o from o), 0, 'publishedAt', 'DescNullsLast') then s.published_at end desc nulls last,
        case when private.sf_order_key((select o from o), 0, 'name', 'AscNullsLast') then s.name end asc nulls last,
        case when private.sf_order_key((select o from o), 1, 'name', 'AscNullsLast') then s.name end asc nulls last,
        s.id
      ) as rn
      from private.sf_search(p_vars) s
      order by rn
      limit (p_vars ->> 'first')::int offset coalesce((p_vars ->> 'offset')::int, 0)
    ) r
  ), '[]'::jsonb);
$$;

create function public.sf_storefront_products(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('storefrontSearchProducts', jsonb_build_object(
    'totalCount', (select count(*) from private.sf_search(p_vars)),
    'edges', private.sf_search_page(p_vars)
  ));
$$;

create function public.sf_storefront_collection_carousel(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('storefrontSearchProducts', jsonb_build_object(
    'edges', private.sf_search_page(p_vars)
  ));
$$;

create function public.sf_storefront_facets(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('storefrontProductFacets', public.storefront_product_facets(
    (p_vars ->> 'storeId')::uuid,
    p_vars ->> 'query',
    (p_vars ->> 'categoryId')::uuid,
    (p_vars ->> 'collectionId')::uuid,
    p_vars ->> 'brandIds',
    p_vars ->> 'valueIds',
    (p_vars ->> 'minPrice')::numeric,
    (p_vars ->> 'maxPrice')::numeric,
    (p_vars ->> 'inStock')::boolean,
    (p_vars ->> 'onSale')::boolean
  )::text);
$$;

create function public.sf_storefront_product_cards(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('productsCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', private.sf_product_card(p)) order by p.id)
    from (
      select * from public.products
      where store_id = (p_vars ->> 'storeId')::uuid
        and id in (select x::uuid from jsonb_array_elements_text(p_vars -> 'ids') x)
      order by id limit 100
    ) p
  ), '[]'::jsonb)));
$$;

create function public.sf_product_slugs(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('productsCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', jsonb_build_object('id', p.id, 'slug', p.slug)) order by p.id)
    from (
      select id, slug from public.products
      where store_id = (p_vars ->> 'storeId')::uuid
        and id in (select x::uuid from jsonb_array_elements_text(p_vars -> 'ids') x)
      order by id limit 100
    ) p
  ), '[]'::jsonb)));
$$;

create function public.sf_storefront_product(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('productsCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', private.sf_product_full(p)))
    from (
      select * from public.products
      where store_id = (p_vars ->> 'storeId')::uuid and slug = p_vars ->> 'slug'
      order by id limit 1
    ) p
  ), '[]'::jsonb)));
$$;

create function public.sf_storefront_product_by_id(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('productsCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', private.sf_product_full(p)))
    from (
      select * from public.products
      where store_id = (p_vars ->> 'storeId')::uuid and id = (p_vars ->> 'id')::uuid
      order by id limit 1
    ) p
  ), '[]'::jsonb)));
$$;

create function public.sf_storefront_sitemap(p_vars jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with page as (
    select id, slug, updated_at from public.products
    where store_id = (p_vars ->> 'storeId')::uuid
    order by id
    limit 101 offset coalesce((p_vars ->> 'after')::int, 0)
  )
  select jsonb_build_object('productsCollection', jsonb_build_object(
    'pageInfo', jsonb_build_object(
      'hasNextPage', (select count(*) from page) > 100,
      'endCursor', (coalesce((p_vars ->> 'after')::int, 0) + 100)::text
    ),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object('slug', p.slug, 'updatedAt', p.updated_at))
        order by p.id)
      from (select * from page order by id limit 100) p
    ), '[]'::jsonb)
  ));
$$;

-- ---------------------------------------------------------------------------
-- Grants: the storefront is public (anon) and customers read it signed in (authenticated)
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'private.sf_variant_promotion(uuid)',
    'private.sf_product_card(public.products)',
    'private.sf_product_full(public.products)',
    'private.sf_order_key(jsonb, int, text, text)',
    'private.sf_search(jsonb)',
    'private.sf_search_page(jsonb)',
    'public.sf_store_by_slug(jsonb)',
    'public.sf_store_slug_by_id(jsonb)',
    'public.sf_store_slugs(jsonb)',
    'public.sf_storefront_shell(jsonb)',
    'public.sf_storefront_home(jsonb)',
    'public.sf_storefront_product_counts(jsonb)',
    'public.sf_storefront_page(jsonb)',
    'public.sf_storefront_carousel(jsonb)',
    'public.sf_storefront_products(jsonb)',
    'public.sf_storefront_collection_carousel(jsonb)',
    'public.sf_storefront_facets(jsonb)',
    'public.sf_storefront_product_cards(jsonb)',
    'public.sf_product_slugs(jsonb)',
    'public.sf_storefront_product(jsonb)',
    'public.sf_storefront_product_by_id(jsonb)',
    'public.sf_storefront_sitemap(jsonb)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end;
$$;
