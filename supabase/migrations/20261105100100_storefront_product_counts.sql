-- Redesign v2 (R5): number of published products per category (with its subcategories) and per collection, for the
-- home category grid and collection cards. One query for the whole store instead of one search per tile: a dozen
-- counts in parallel on a cold home pushed other anon reads past their 3 s statement timeout. Same membership rules
-- as private.storefront_product_ids; security invoker, so RLS decides what anon sees (published, active store).

create function public.storefront_product_counts(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with products as (
    select p.id, p.category_id, p.brand_id, p.featured, p.in_stock, p.published_at
    from public.products p
    where p.store_id = p_store_id and p.status = 'published'
  ),
  by_category as (
    select c.id, (
      select count(*) from products p
      join public.categories pc on pc.id = p.category_id
      where pc.store_id = p_store_id and pc.path operator(extensions.<@) c.path
    ) as n
    from public.categories c
    where c.store_id = p_store_id
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
    where col.store_id = p_store_id
  )
  select jsonb_build_object(
    'categories', coalesce((select jsonb_object_agg(id, n) from by_category), '{}'::jsonb),
    'collections', coalesce((select jsonb_object_agg(id, n) from by_collection), '{}'::jsonb)
  );
$$;

revoke all on function public.storefront_product_counts(uuid) from public;
grant execute on function public.storefront_product_counts(uuid) to anon, authenticated, service_role;
