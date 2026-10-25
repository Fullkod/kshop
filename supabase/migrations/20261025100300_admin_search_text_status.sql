-- pg_graphql 1.6 does not expose functions with enum arguments: take the status as text.
drop function public.admin_search_products(uuid, text, public.product_status, uuid, uuid, uuid, boolean);

create function public.admin_search_products(
  p_store_id uuid,
  p_query text default null,
  p_status text default null,
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
    and (p_status is null or p.status = p_status::public.product_status)
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

revoke all on function public.admin_search_products(uuid, text, text, uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.admin_search_products(uuid, text, text, uuid, uuid, uuid, boolean)
  to authenticated, service_role;
