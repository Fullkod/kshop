-- R11: the rest of the admin's reads leave pg_graphql (decision of Roberto, 2026-10-28: the admin reads through RPC,
-- pg_graphql stays for the public storefront). Same rules as 20261108100400_admin_reads.sql: security invoker (the
-- RLS of pg_graphql), each function returns exactly the shape of the GraphQL query it replaces (numeric and jsonb as
-- text, timestamps and dates as to_jsonb; collections without orderBy in primary key order), cursors are offsets.
-- scripts/compare-admin-reads.mjs checks every one against pg_graphql.

-- ---------------------------------------------------------------------------
-- Orders: the global search (Ctrl K) looks for number OR name OR phone; the list ANDs an exact number instead.
-- ---------------------------------------------------------------------------

drop function public.admin_orders(uuid, int, int, public.order_status[], int, text, text);

create function public.admin_orders(
  p_store_id uuid,
  p_first int,
  p_offset int default 0,
  p_statuses public.order_status[] default null,
  p_number int default null,
  -- Search: customer name ILIKE p_name OR phone ILIKE p_phone OR number = p_search_number (each only when given).
  p_name text default null,
  p_phone text default null,
  p_search_number int default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with matched as (
    select o.*
    from public.orders o
    where o.store_id = p_store_id
      and (p_statuses is null or o.status = any (p_statuses))
      and (p_number is null or o.number = p_number)
      and (
        (p_name is null and p_phone is null and p_search_number is null)
        or o.customer_name ilike p_name
        or o.customer_phone ilike p_phone
        or o.number = p_search_number
      )
  ),
  page as (
    select * from matched order by created_at desc nulls last, id limit p_first + 1 offset p_offset
  )
  select jsonb_build_object('ordersCollection', jsonb_build_object(
    'totalCount', (select count(*) from matched),
    'pageInfo', jsonb_build_object(
      'hasNextPage', (select count(*) from page) > p_first,
      'endCursor', (p_offset + p_first)::text
    ),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', o.id,
        'number', o.number,
        'status', o.status,
        'paymentStatus', o.payment_status,
        'channel', o.channel,
        'currency', o.currency,
        'total', o.total::text,
        'subtotal', o.subtotal::text,
        'shippingTotal', o.shipping_total::text,
        'paidTotal', o.paid_total::text,
        'customerName', o.customer_name,
        'customerPhone', o.customer_phone,
        'shippingType', o.shipping_type,
        'createdAt', o.created_at,
        'orderLinesCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object('quantity', l.quantity)) order by l.id)
          from (select id, quantity from public.order_lines where order_id = o.id order by id limit 100) l
        ), '[]'::jsonb))
      )) order by o.created_at desc nulls last, o.id)
      from (select * from page order by created_at desc nulls last, id limit p_first) o
    ), '[]'::jsonb)
  ));
$$;

-- ---------------------------------------------------------------------------
-- Customers (CustomersPage, «Nuevo pedido», global search)
-- ---------------------------------------------------------------------------

create function public.admin_customers(
  p_store_id uuid,
  p_first int,
  p_offset int default 0,
  -- Search: first or last name ILIKE p_name OR phone ILIKE p_phone_like (each only when given).
  p_name text default null,
  p_phone_like text default null,
  -- Exact phone («Nuevo pedido» looks the customer up by the normalized phone).
  p_phone text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with matched as (
    select c.*
    from public.customers c
    where c.store_id = p_store_id
      and (p_phone is null or c.phone = p_phone)
      and (
        (p_name is null and p_phone_like is null)
        or c.first_name ilike p_name
        or c.last_name ilike p_name
        or c.phone ilike p_phone_like
      )
  ),
  page as (
    select * from matched order by created_at desc nulls last, id limit p_first + 1 offset p_offset
  )
  select jsonb_build_object('customersCollection', jsonb_build_object(
    'totalCount', (select count(*) from matched),
    'pageInfo', jsonb_build_object(
      'hasNextPage', (select count(*) from page) > p_first,
      'endCursor', (p_offset + p_first)::text
    ),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', c.id,
        'firstName', c.first_name,
        'lastName', c.last_name,
        'phone', c.phone,
        'email', c.email,
        'isBlocked', c.is_blocked,
        'acceptsMarketing', c.accepts_marketing,
        'lastOrderAt', c.last_order_at,
        'createdAt', c.created_at,
        'ordersCollection', jsonb_build_object(
          'totalCount', (select count(*) from public.orders o where o.customer_id = c.id)
        )
      )) order by c.created_at desc nulls last, c.id)
      from (select * from page order by created_at desc nulls last, id limit p_first) c
    ), '[]'::jsonb)
  ));
$$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create function public.admin_catalog_structure(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'attributesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', a.id,
        'name', a.name,
        'slug', a.slug,
        'inputType', a.input_type,
        'unit', a.unit,
        'valueRequired', a.value_required,
        'visibleInStorefront', a.visible_in_storefront,
        'filterableInStorefront', a.filterable_in_storefront,
        'attributeValuesCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'id', v.id, 'name', v.name, 'slug', v.slug, 'value', v.value
          )) order by v.sort_order nulls last, v.id)
          from (
            select * from public.attribute_values where attribute_id = a.id order by sort_order nulls last, id limit 100
          ) v
        ), '[]'::jsonb))
      )) order by a.sort_order nulls last, a.id)
      from (select * from public.attributes where store_id = p_store_id order by sort_order nulls last, id limit 100) a
    ), '[]'::jsonb)),
    'productTypesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'slug', t.slug,
        'hasVariants', t.has_variants,
        'isShippingRequired', t.is_shipping_required,
        'productTypeAttributesCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'attributeId', pa.attribute_id, 'scope', pa.scope, 'variantSelection', pa.variant_selection
          )) order by pa.sort_order nulls last, pa.attribute_id)
          from (
            select * from public.product_type_attributes where product_type_id = t.id
            order by sort_order nulls last, attribute_id limit 50
          ) pa
        ), '[]'::jsonb))
      )) order by t.name nulls last, t.id)
      from (select * from public.product_types where store_id = p_store_id order by name nulls last, id limit 100) t
    ), '[]'::jsonb)),
    'categoriesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', c.id, 'name', c.name, 'slug', c.slug, 'parentId', c.parent_id, 'depth', c.depth,
        'description', c.description, 'imageUrl', c.image_url
      )) order by c.depth nulls last, c.sort_order nulls last, c.name nulls last, c.id)
      from (
        select * from public.categories where store_id = p_store_id
        order by depth nulls last, sort_order nulls last, name nulls last, id limit 100
      ) c
    ), '[]'::jsonb)),
    'brandsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', b.id, 'name', b.name, 'slug', b.slug, 'description', b.description, 'logoUrl', b.logo_url,
        'isPublished', b.is_published
      )) order by b.name nulls last, b.id)
      from (select * from public.brands where store_id = p_store_id order by name nulls last, id limit 100) b
    ), '[]'::jsonb)),
    'collectionsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', c.id, 'name', c.name, 'slug', c.slug, 'description', c.description, 'imageUrl', c.image_url,
        'isPublished', c.is_published, 'rules', c.rules::text
      )) order by c.sort_order nulls last, c.id)
      from (
        select * from public.collections where store_id = p_store_id order by sort_order nulls last, id limit 100
      ) c
    ), '[]'::jsonb)),
    'warehousesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', w.id, 'name', w.name, 'address', w.address, 'phone', w.phone, 'isDefault', w.is_default,
        'isPickupPoint', w.is_pickup_point, 'isActive', w.is_active
      )) order by w.created_at nulls last, w.id)
      from (
        select * from public.warehouses where store_id = p_store_id order by created_at nulls last, id limit 100
      ) w
    ), '[]'::jsonb)),
    'storeCurrenciesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'currency', s.currency, 'isBase', s.is_base, 'sells', s.sells, 'rateToBase', s.rate_to_base::text,
        'rounding', s.rounding::text
      )) order by s.store_id, s.currency)
      from (
        select * from public.store_currencies where store_id = p_store_id order by store_id, currency limit 10
      ) s
    ), '[]'::jsonb))
  );
$$;

create function public.admin_products(
  p_store_id uuid,
  p_first int,
  p_offset int default 0,
  p_query text default null,
  p_status text default null,
  p_category_id uuid default null,
  p_low_stock boolean default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with matched as (
    select * from public.admin_search_products(
      p_store_id, p_query, p_status, p_category_id, null, null, p_low_stock
    )
  ),
  page as (
    select * from matched order by id limit p_first + 1 offset p_offset
  )
  select jsonb_build_object('adminSearchProducts', jsonb_build_object(
    'totalCount', (select count(*) from matched),
    'pageInfo', jsonb_build_object(
      'hasNextPage', (select count(*) from page) > p_first,
      'endCursor', (p_offset + p_first)::text
    ),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'slug', p.slug,
        'status', p.status,
        'minPrice', p.min_price::text,
        'maxPrice', p.max_price::text,
        'inStock', p.in_stock,
        'primaryMediaUrl', p.primary_media_url,
        'updatedAt', p.updated_at,
        'categoryId', p.category_id,
        'productVariantsCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'id', v.id, 'sku', v.sku, 'stockAvailable', v.stock_available, 'trackInventory', v.track_inventory
          )) order by v.id)
          from (select * from public.product_variants where product_id = p.id order by id limit 100) v
        ), '[]'::jsonb))
      )) order by p.id)
      from (select * from page order by id limit p_first) p
    ), '[]'::jsonb)
  ));
$$;

-- «Nuevo pedido» and the product picker of the discounts: products with their variants and base prices.
create function public.admin_variant_search(p_store_id uuid, p_query text default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('adminSearchProducts', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'status', p.status,
      'primaryMediaUrl', p.primary_media_url,
      'productVariantsCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'id', v.id, 'sku', v.sku, 'name', v.name, 'price', v.price::text, 'stockAvailable', v.stock_available,
          'trackInventory', v.track_inventory
        )) order by v.sort_order nulls last, v.id)
        from (
          select * from public.product_variants where product_id = p.id order by sort_order nulls last, id limit 100
        ) v
      ), '[]'::jsonb))
    )) order by p.id)
    from (
      select * from public.admin_search_products(p_store_id, p_query, null, null, null, null, null)
      order by id limit 10
    ) p
  ), '[]'::jsonb)));
$$;

create function public.admin_product(p_product_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('productsCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
      'id', p.id,
      'productTypeId', p.product_type_id,
      'categoryId', p.category_id,
      'brandId', p.brand_id,
      'name', p.name,
      'slug', p.slug,
      'descriptionPlain', p.description_plain,
      'status', p.status,
      'featured', p.featured,
      'badge', p.badge,
      'seoTitle', p.seo_title,
      'seoDescription', p.seo_description,
      'productTagsCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object('tag', t.tag)) order by t.tag)
        from (select tag from public.product_tags where product_id = p.id order by tag limit 30) t
      ), '[]'::jsonb)),
      'collectionProductsCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object('collectionId', c.collection_id))
          order by c.collection_id)
        from (
          select collection_id from public.collection_products where product_id = p.id order by collection_id limit 50
        ) c
      ), '[]'::jsonb)),
      'productAttributeValuesCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'attributeId', a.attribute_id, 'valueId', a.value_id, 'valueText', a.value_text,
          'valueNumeric', a.value_numeric::text, 'valueBoolean', a.value_boolean, 'valueDate', a.value_date
        )) order by a.id)
        from (select * from public.product_attribute_values where product_id = p.id order by id limit 100) a
      ), '[]'::jsonb)),
      'productMediaCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'id', m.id, 'url', m.url, 'thumbUrl', m.thumb_url, 'alt', m.alt
        )) order by m.sort_order nulls last, m.id)
        from (
          -- Not *: source_url is not granted to authenticated.
          select id, url, thumb_url, alt, sort_order from public.product_media where product_id = p.id
          order by sort_order nulls last, id limit 50
        ) m
      ), '[]'::jsonb)),
      'productVariantsCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'id', v.id,
          'sku', v.sku,
          'name', v.name,
          'price', v.price::text,
          'compareAtPrice', v.compare_at_price::text,
          'trackInventory', v.track_inventory,
          'weight', v.weight::text,
          'stockAvailable', v.stock_available,
          'variantCosts', (
            select jsonb_build_object('costPrice', k.cost_price::text, 'costCurrency', k.cost_currency)
            from public.variant_costs k where k.variant_id = v.id
          ),
          'variantAttributeValuesCollection', jsonb_build_object('edges', coalesce((
            select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
              'attributeId', x.attribute_id, 'valueId', x.value_id
            )) order by x.attribute_id)
            from (
              select * from public.variant_attribute_values where variant_id = v.id order by attribute_id limit 20
            ) x
          ), '[]'::jsonb)),
          'variantPricesCollection', jsonb_build_object('edges', coalesce((
            select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
              'currency', x.currency, 'price', x.price::text, 'compareAtPrice', x.compare_at_price::text
            )) order by x.currency)
            from (select * from public.variant_prices where variant_id = v.id order by currency limit 5) x
          ), '[]'::jsonb)),
          'variantMediaCollection', jsonb_build_object('edges', coalesce((
            select jsonb_agg(jsonb_build_object('node', jsonb_build_object('mediaId', x.media_id)) order by x.media_id)
            from (select media_id from public.variant_media where variant_id = v.id order by media_id limit 20) x
          ), '[]'::jsonb)),
          'stocksCollection', jsonb_build_object('edges', coalesce((
            select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
              'warehouseId', x.warehouse_id, 'quantity', x.quantity, 'quantityAllocated', x.quantity_allocated
            )) order by x.warehouse_id)
            from (select * from public.stocks where variant_id = v.id order by warehouse_id limit 20) x
          ), '[]'::jsonb))
        )) order by v.sort_order nulls last, v.id)
        from (
          select * from public.product_variants where product_id = p.id order by sort_order nulls last, id limit 100
        ) v
      ), '[]'::jsonb))
    )))
    from public.products p
    where p.id = p_product_id
  ), '[]'::jsonb)));
$$;

-- ---------------------------------------------------------------------------
-- Discounts
-- ---------------------------------------------------------------------------

create function public.admin_promotions(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('promotionsCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'description', p.description,
      'reward', p.reward,
      'value', p.value::text,
      'startsAt', p.starts_at,
      'endsAt', p.ends_at,
      'isActive', p.is_active,
      'priority', p.priority,
      'promotionTargetsCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'targetType', t.target_type, 'targetId', t.target_id
        )) order by t.target_type, t.target_id)
        from (
          select * from public.promotion_targets where promotion_id = p.id
          order by target_type, target_id limit 200
        ) t
      ), '[]'::jsonb))
    )) order by p.starts_at desc nulls last, p.id)
    from (
      select * from public.promotions where store_id = p_store_id order by starts_at desc nulls last, id limit 200
    ) p
  ), '[]'::jsonb)));
$$;

create function public.admin_vouchers(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('vouchersCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
      'id', v.id,
      'code', v.code,
      'name', v.name,
      'scope', v.scope,
      'reward', v.reward,
      'value', v.value::text,
      'minSubtotal', v.min_subtotal::text,
      'minQuantity', v.min_quantity,
      'usageLimit', v.usage_limit,
      'usagePerCustomer', v.usage_per_customer,
      'usedCount', v.used_count,
      'startsAt', v.starts_at,
      'endsAt', v.ends_at,
      'isActive', v.is_active,
      'voucherTargetsCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'targetType', t.target_type, 'targetId', t.target_id
        )) order by t.target_type, t.target_id)
        from (
          select * from public.voucher_targets where voucher_id = v.id order by target_type, target_id limit 200
        ) t
      ), '[]'::jsonb)),
      'voucherUsagesCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'id', u.id,
          'amount', u.amount::text,
          'currency', u.currency,
          'phone', u.phone,
          'createdAt', u.created_at,
          'releasedAt', u.released_at,
          'orders', (
            select jsonb_build_object('id', o.id, 'number', o.number, 'customerName', o.customer_name)
            from public.orders o where o.id = u.order_id
          )
        )) order by u.created_at desc nulls last, u.id)
        from (
          select * from public.voucher_usages where voucher_id = v.id order by created_at desc nulls last, id limit 20
        ) u
      ), '[]'::jsonb))
    )) order by v.created_at desc nulls last, v.id)
    from (
      select * from public.vouchers where store_id = p_store_id order by created_at desc nulls last, id limit 200
    ) v
  ), '[]'::jsonb)));
$$;

create function public.admin_discount_targets(p_store_id uuid, p_product_ids uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'categoriesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object('id', c.id, 'name', c.name, 'depth', c.depth))
        order by c.path nulls last, c.id)
      from (
        select * from public.categories where store_id = p_store_id order by path nulls last, id limit 500
      ) c
    ), '[]'::jsonb)),
    'collectionsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object('id', c.id, 'name', c.name))
        order by c.name nulls last, c.id)
      from (
        select * from public.collections where store_id = p_store_id order by name nulls last, id limit 200
      ) c
    ), '[]'::jsonb)),
    'brandsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object('id', b.id, 'name', b.name))
        order by b.name nulls last, b.id)
      from (select * from public.brands where store_id = p_store_id order by name nulls last, id limit 500) b
    ), '[]'::jsonb)),
    'productsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object('id', p.id, 'name', p.name)) order by p.id)
      from (
        select * from public.products where store_id = p_store_id and id = any (p_product_ids) order by id limit 200
      ) p
    ), '[]'::jsonb))
  );
$$;

-- ---------------------------------------------------------------------------
-- Storefront content (Apariencia)
-- ---------------------------------------------------------------------------

create function public.admin_content(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'storesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'theme', s.theme::text, 'description', s.description, 'logoUrl', s.logo_url
      )))
      from public.stores s where s.id = p_store_id
    ), '[]'::jsonb)),
    'bannersCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', b.id,
        'eyebrow', b.eyebrow,
        'title', b.title,
        'subtitle', b.subtitle,
        'ctaLabel', b.cta_label,
        'imageUrl', b.image_url,
        'imageMobileUrl', b.image_mobile_url,
        'alt', b.alt,
        'productId', b.product_id,
        'linkType', b.link_type,
        'linkTargetId', b.link_target_id,
        'linkUrl', b.link_url,
        'isVisible', b.is_visible,
        'startsAt', b.starts_at,
        'endsAt', b.ends_at
      )) order by b.sort_order nulls last, b.id)
      from (select * from public.banners where store_id = p_store_id order by sort_order nulls last, id limit 100) b
    ), '[]'::jsonb)),
    'homeSectionsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', h.id,
        'type', h.type,
        'title', h.title,
        'sourceCollectionId', h.source_collection_id,
        'sourceCategoryId', h.source_category_id,
        'sourceBrandId', h.source_brand_id,
        'settings', h.settings::text,
        'isVisible', h.is_visible,
        'startsAt', h.starts_at,
        'endsAt', h.ends_at,
        'homeSectionBannersCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object('bannerId', x.banner_id))
            order by x.sort_order nulls last, x.banner_id)
          from (
            select * from public.home_section_banners where section_id = h.id
            order by sort_order nulls last, banner_id limit 8
          ) x
        ), '[]'::jsonb))
      )) order by h.sort_order nulls last, h.id)
      from (
        select * from public.home_sections where store_id = p_store_id order by sort_order nulls last, id limit 100
      ) h
    ), '[]'::jsonb)),
    'menusCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'location', m.location,
        'menuItemsCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'id', i.id, 'parentId', i.parent_id, 'label', i.label, 'linkType', i.link_type,
            'linkTargetId', i.link_target_id, 'linkUrl', i.link_url
          )) order by i.sort_order nulls last, i.id)
          from (
            select * from public.menu_items where menu_id = m.id order by sort_order nulls last, id limit 100
          ) i
        ), '[]'::jsonb))
      )) order by m.id)
      from (select * from public.menus where store_id = p_store_id order by id limit 2) m
    ), '[]'::jsonb)),
    'pagesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', g.id, 'title', g.title, 'slug', g.slug, 'content', g.content, 'isPublished', g.is_published,
        'seoTitle', g.seo_title, 'seoDescription', g.seo_description
      )) order by g.title nulls last, g.id)
      from (select * from public.pages where store_id = p_store_id order by title nulls last, id limit 100) g
    ), '[]'::jsonb)),
    'productsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object('id', p.id, 'name', p.name))
        order by p.name nulls last, p.id)
      from (
        select * from public.products where store_id = p_store_id and status = 'published'
        order by name nulls last, id limit 100
      ) p
    ), '[]'::jsonb))
  );
$$;

-- ---------------------------------------------------------------------------
-- WhatsApp notices settings (contacts and templates; the templates are whatever the RLS shows, like the query)
-- ---------------------------------------------------------------------------

create function public.admin_notification_settings(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'storeNotificationContactsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone', c.phone, 'notifyNewOrder', c.notify_new_order,
        'notifyPaymentRecorded', c.notify_payment_recorded, 'showToCustomer', c.show_to_customer,
        'isActive', c.is_active
      )) order by c.sort_order nulls last, c.name nulls last, c.id)
      from (
        select * from public.store_notification_contacts where store_id = p_store_id
        order by sort_order nulls last, name nulls last, id limit 50
      ) c
    ), '[]'::jsonb)),
    'whatsappTemplatesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', t.id, 'storeId', t.store_id, 'event', t.event, 'audience', t.audience, 'body', t.body,
        'isActive', t.is_active
      )) order by t.id)
      from (select * from public.whatsapp_templates order by id limit 100) t
    ), '[]'::jsonb))
  );
$$;

-- ---------------------------------------------------------------------------
-- Grants: the signed-in staff only
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_orders(uuid, int, int, public.order_status[], int, text, text, int)',
    'public.admin_customers(uuid, int, int, text, text, text)',
    'public.admin_catalog_structure(uuid)',
    'public.admin_products(uuid, int, int, text, text, uuid, boolean)',
    'public.admin_variant_search(uuid, text)',
    'public.admin_product(uuid)',
    'public.admin_promotions(uuid)',
    'public.admin_vouchers(uuid)',
    'public.admin_discount_targets(uuid, uuid[])',
    'public.admin_content(uuid)',
    'public.admin_notification_settings(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
