-- Admin › Productos: filter «Sin costo» — products with at least one variant that has no cost yet (for the owner to
-- fill them in). Costs are visible only to owners and admins (RLS of variant_costs); for the staff every product
-- looks costless, which tells them nothing, and the UI does not offer them the filter.

drop function public.admin_products(uuid, int, int, text, text, uuid, boolean);

create function public.admin_products(
  p_store_id uuid,
  p_first int,
  p_offset int default 0,
  p_query text default null,
  p_status text default null,
  p_category_id uuid default null,
  p_low_stock boolean default null,
  p_no_cost boolean default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with matched as (
    select s.* from public.admin_search_products(
      p_store_id, p_query, p_status, p_category_id, null, null, p_low_stock
    ) s
    where p_no_cost is not true or exists (
      select 1 from public.product_variants v
      where v.store_id = p_store_id and v.product_id = s.id
        and not exists (select 1 from public.variant_costs c where c.variant_id = v.id)
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

revoke execute on function public.admin_products(uuid, int, int, text, text, uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_products(uuid, int, int, text, text, uuid, boolean, boolean) to authenticated;
