-- Phase 6.2: aggregated reads of the Almacenes and Monedas screens (PostgREST returns at most 1000 rows, so sums
-- are done here). Called by the API with service_role after the role and module checks.

-- Units, reserved units and products with stock per warehouse.
create function public.warehouse_totals(p_store_id uuid)
returns table (warehouse_id uuid, variants int, units bigint, reserved bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id,
    count(s.variant_id) filter (where s.quantity > 0)::int,
    coalesce(sum(s.quantity), 0),
    coalesce(sum(s.quantity_allocated), 0)
  from public.warehouses w
  left join public.stocks s on s.warehouse_id = w.id
  where w.store_id = p_store_id
  group by w.id;
$$;

-- Stock of one warehouse for the transfer form: products matching the search (SKU or name), or the ones with stock
-- there when the search is empty.
create function public.warehouse_stock(p_store_id uuid, p_warehouse_id uuid, p_query text, p_limit int)
returns table (variant_id uuid, product_name text, variant_name text, sku text, quantity int, allocated int)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, p.name, v.name, v.sku, coalesce(s.quantity, 0), coalesce(s.quantity_allocated, 0)
  from public.product_variants v
  join public.products p on p.id = v.product_id
  left join public.stocks s on s.variant_id = v.id and s.warehouse_id = p_warehouse_id
  where v.store_id = p_store_id and p.status <> 'archived' and v.track_inventory
    and case
      when nullif(btrim(coalesce(p_query, '')), '') is null then coalesce(s.quantity, 0) > 0
      else v.sku ilike '%' || btrim(p_query) || '%' or p.name ilike '%' || btrim(p_query) || '%'
    end
  order by p.name, v.sort_order, v.sku
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- Products with a fixed price per sale currency (they do not follow the rate, D17).
create function public.currency_fixed_prices(p_store_id uuid)
returns table (currency text, variants int)
language sql
stable
security definer
set search_path = ''
as $$
  select vp.currency::text, count(*)::int
  from public.variant_prices vp
  where vp.store_id = p_store_id
  group by vp.currency;
$$;

revoke all on function public.warehouse_totals(uuid), public.warehouse_stock(uuid, uuid, text, int),
  public.currency_fixed_prices(uuid)
  from public, anon, authenticated;
grant execute on function public.warehouse_totals(uuid), public.warehouse_stock(uuid, uuid, text, int),
  public.currency_fixed_prices(uuid)
  to service_role;
