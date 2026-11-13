-- KSH0020: Finanzas with products sold by weight or measure (KSH0015).
-- · Margen by product: the quantity actually sold with its unit («7,5 lb»), not the number of lines. By category or
--   brand (units mixed) a measured line still counts as one product (counted_quantity), and so do the totals.
-- · Inventario: «units in stock» only adds products sold by the unit (12,5 lb + 40 refrescos was 52,5); the measured
--   ones in stock are counted apart (totals.measured) and every row brings its sale_unit.
-- Same signatures: create or replace keeps the grants (service_role only).

create or replace function public.finance_margin(p_store_id uuid, p_from date, p_to date, p_currency text, p_group text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.finance_check_period(p_from, p_to);
  if p_group not in ('product', 'category', 'brand') then
    raise exception 'Agrupación no válida' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  with lines as (
    select f.*, ol.quantity as sold_quantity, coalesce(ol.unit, 'unit') as unit
    from private.finance_lines(p_store_id, p_from, p_to, p_currency) f
    join public.order_lines ol on ol.id = f.line_id
  ),
  grouped as (
    select
      case p_group when 'product' then l.product_id when 'category' then l.category_id else l.brand_id end as key,
      min(case p_group
        when 'product' then l.product_name
        when 'category' then (select c.name from public.categories c where c.id = l.category_id)
        else (select b.name from public.brands b where b.id = l.brand_id) end) as name,
      -- One product sold in one unit: its real quantity; otherwise (or by category/brand) counted products.
      case when p_group = 'product' and min(l.unit) = max(l.unit) then min(l.unit) else 'unit' end as unit,
      case when p_group = 'product' and min(l.unit) = max(l.unit) then sum(l.sold_quantity) else sum(l.quantity) end
        as units,
      sum(l.revenue) as revenue,
      sum(l.revenue) filter (where l.cost is not null) as revenue_with_cost,
      sum(l.cost) as cost,
      count(*) filter (where l.cost is null) as without_cost
    from lines l
    group by 1
  )
  select jsonb_build_object(
    'currency', p_currency,
    'totals', jsonb_build_object(
      'units', coalesce((select sum(quantity) from lines), 0),
      'revenue', round(coalesce((select sum(revenue) from lines), 0), 2),
      'revenue_with_cost', round(coalesce((select sum(revenue) from lines where cost is not null), 0), 2),
      'cost', round(coalesce((select sum(cost) from lines), 0), 2),
      'margin', round(coalesce((select sum(revenue) - sum(cost) from lines where cost is not null), 0), 2),
      'lines', (select count(*) from lines),
      'lines_without_cost', (select count(*) from lines where cost is null)
    ),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'key', key, 'name', coalesce(name, 'Sin ' || case p_group when 'category' then 'categoría'
          when 'brand' then 'marca' else 'producto' end),
        'units', units, 'unit', unit, 'revenue', round(revenue, 2), 'cost', round(coalesce(cost, 0), 2),
        'margin', round(coalesce(revenue_with_cost, 0) - coalesce(cost, 0), 2),
        'margin_pct', case when coalesce(revenue_with_cost, 0) > 0
          then round((revenue_with_cost - coalesce(cost, 0)) * 100 / revenue_with_cost, 1) end,
        'lines_without_cost', without_cost
      ) order by revenue desc nulls last)
      from (select * from grouped order by revenue desc nulls last limit 200) g), '[]')
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.finance_inventory(
  p_store_id uuid,
  p_warehouse_id uuid,
  p_currency text,
  p_filter text,
  p_stale_days int,
  p_search text,
  p_limit int,
  p_offset int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target numeric := private.rate_at(p_store_id, p_currency, now());
  v_result jsonb;
begin
  if p_filter not in ('all', 'low', 'out', 'stale') then
    raise exception 'Filtro no válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  with stock as (
    select v.id as variant_id, p.name as product_name, v.name as variant_name, v.sku, v.price, p.sale_unit,
      coalesce(sum(s.quantity), 0) as quantity,
      coalesce(sum(s.quantity_allocated), 0) as allocated,
      coalesce(min(s.low_stock_threshold), 3) as threshold
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.stocks s on s.variant_id = v.id
      and (p_warehouse_id is null or s.warehouse_id = p_warehouse_id)
    where v.store_id = p_store_id and v.track_inventory and p.status <> 'archived'
      and (nullif(btrim(coalesce(p_search, '')), '') is null
        or v.sku ilike '%' || btrim(p_search) || '%' or p.name ilike '%' || btrim(p_search) || '%')
    group by v.id, p.name, v.name, v.sku, v.price, p.sale_unit
  ),
  valued as (
    select st.*,
      st.quantity - st.allocated as available,
      case when c.variant_id is not null
        then st.quantity * c.cost_price * private.rate_at(p_store_id, c.cost_currency::text, now()) / v_target end
        as cost_value,
      st.quantity * st.price / v_target as sale_value,
      (select max(m.created_at) from public.stock_movements m
       where m.variant_id = st.variant_id and (p_warehouse_id is null or m.warehouse_id = p_warehouse_id)) as last_movement
    from stock st
    left join public.variant_costs c on c.variant_id = st.variant_id
  ),
  filtered as (
    select * from valued
    where case p_filter
      when 'low' then available > 0 and available <= threshold
      when 'out' then available <= 0
      when 'stale' then quantity > 0
        and coalesce(last_movement, '-infinity') < now() - make_interval(days => greatest(coalesce(p_stale_days, 60), 1))
      else true
    end
  )
  select jsonb_build_object(
    'currency', p_currency,
    'totals', (select jsonb_build_object(
      'variants', count(*),
      'units', coalesce(sum(quantity) filter (where sale_unit = 'unit'), 0),
      'reserved', coalesce(sum(allocated) filter (where sale_unit = 'unit'), 0),
      'measured', count(*) filter (where sale_unit <> 'unit' and quantity > 0),
      'cost_value', round(coalesce(sum(cost_value), 0), 2),
      'sale_value', round(coalesce(sum(sale_value), 0), 2),
      'without_cost', count(*) filter (where cost_value is null and quantity > 0),
      'out_of_stock', count(*) filter (where available <= 0),
      'low_stock', count(*) filter (where available > 0 and available <= threshold)
    ) from valued),
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'variant_id', variant_id, 'product_name', product_name, 'variant_name', variant_name, 'sku', sku,
        'sale_unit', sale_unit,
        'quantity', quantity, 'allocated', allocated, 'available', available, 'threshold', threshold,
        'cost_value', round(cost_value, 2), 'sale_value', round(sale_value, 2), 'last_movement', last_movement
      ) order by product_name, sku)
      from (select * from filtered order by product_name, sku
            limit least(greatest(coalesce(p_limit, 50), 1), 500) offset greatest(coalesce(p_offset, 0), 0)) f), '[]')
  ) into v_result;
  return v_result;
end;
$$;
