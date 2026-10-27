-- Redesign R9: the home counts only the categories and collections it shows. The previous version counted every
-- category (one subquery per category over all products) and every collection (rules evaluated product by product)
-- on each cold home: 177 ms and 6 000 blocks for the Demo store, growing with the catalog. Ids come as comma-separated
-- text (pg_graphql 1.6 does not expose array arguments); null or empty lists count nothing. Categories are counted in
-- one pass over the published products. Same membership rules as private.storefront_product_ids; security invoker, so
-- RLS decides what anon sees (published products of active stores).

drop function public.storefront_product_counts(uuid);

create function public.storefront_product_counts(
  p_store_id uuid,
  p_category_ids text default null,
  p_collection_ids text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with products as (
    select p.id, p.category_id, p.brand_id, p.featured, p.in_stock, p.published_at, pc.path as category_path
    from public.products p
    left join public.categories pc on pc.id = p.category_id and pc.store_id = p_store_id
    where p.store_id = p_store_id and p.status = 'published'
  ),
  by_category as (
    select c.id, count(p.id) as n
    from public.categories c
    left join products p on p.category_path operator(extensions.<@) c.path
    where c.store_id = p_store_id and c.id = any (private.uuid_list(p_category_ids))
    group by c.id
  ),
  by_collection as (
    select col.id, (
      select count(*) from products p
      where (col.rules is null and exists (
          select 1 from public.collection_products cp where cp.collection_id = col.id and cp.product_id = p.id))
        or (col.rules is not null and private.product_matches_rules(
          p.id, p.category_id, p.brand_id, p.featured, p.in_stock, p.published_at, col.rules))
    ) as n
    from public.collections col
    where col.store_id = p_store_id and col.id = any (private.uuid_list(p_collection_ids))
  )
  select jsonb_build_object(
    'categories', coalesce((select jsonb_object_agg(id, n) from by_category), '{}'::jsonb),
    'collections', coalesce((select jsonb_object_agg(id, n) from by_collection), '{}'::jsonb)
  );
$$;

revoke all on function public.storefront_product_counts(uuid, text, text) from public;
grant execute on function public.storefront_product_counts(uuid, text, text) to anon, authenticated, service_role;
