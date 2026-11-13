-- KSH0022 (Leo): the costs in Catálogo › Productos, to check and fix them every day without opening each product.
-- · admin_products brings each variant's name, price and cost (the RLS of variant_costs hides the cost from the staff).
-- · set_variant_costs: only the costs of some variants, in one transaction (the product is not saved again). null
--   removes a cost. service_role only: /api/v1 checks owner/admin first.

create or replace function public.admin_products(p_store_id uuid, p_first integer, p_offset integer DEFAULT 0, p_query text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_low_stock boolean DEFAULT NULL::boolean, p_no_cost boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
        'saleUnit', p.sale_unit,
        'productVariantsCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'id', v.id, 'sku', v.sku, 'name', v.name, 'price', v.price::text, 'sortOrder', v.sort_order,
            'stockAvailable', v.stock_available::text, 'trackInventory', v.track_inventory,
            -- Security invoker: the RLS of variant_costs leaves it null for the staff.
            'variantCosts', (
              select jsonb_build_object('costPrice', k.cost_price::text, 'costCurrency', k.cost_currency)
              from public.variant_costs k where k.variant_id = v.id
            )
          )) order by v.id)
          from (select * from public.product_variants where product_id = p.id order by id limit 100) v
        ), '[]'::jsonb))
      )) order by p.id)
      from (select * from page order by id limit p_first) p
    ), '[]'::jsonb)
  ));
$function$;

create or replace function public.set_variant_costs(p_store_id uuid, p_costs jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_variant uuid;
  v_count int := 0;
begin
  if jsonb_typeof(p_costs) is distinct from 'array' then
    raise exception 'Costs must be an array' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  for v_item in select * from jsonb_array_elements(p_costs) loop
    v_variant := (v_item ->> 'variant_id')::uuid;
    if not exists (select 1 from public.product_variants where id = v_variant and store_id = p_store_id) then
      raise exception 'Variant not in this store' using errcode = '23503', hint = 'variants';
    end if;
    if jsonb_typeof(v_item -> 'cost') is distinct from 'object' then
      delete from public.variant_costs where variant_id = v_variant;
    else
      insert into public.variant_costs (store_id, variant_id, cost_price, cost_currency)
      values (p_store_id, v_variant, (v_item -> 'cost' ->> 'price')::numeric,
        (v_item -> 'cost' ->> 'currency')::public.currency_code)
      on conflict (variant_id) do update
      set cost_price = excluded.cost_price, cost_currency = excluded.cost_currency
      where (public.variant_costs.cost_price, public.variant_costs.cost_currency)
        is distinct from (excluded.cost_price, excluded.cost_currency);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.set_variant_costs(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_variant_costs(uuid, jsonb) to service_role;
