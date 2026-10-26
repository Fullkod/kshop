-- Phase 6.3: Finanzas (module finance, PRP-6 D1–D8 and Roberto's answers). Reports computed on the fly over orders,
-- payments, refunds and expenses (no summary table, D5). Days are cut in America/Havana. Amounts stay in the
-- currency they were sold or paid in; the «Equivalente» converts to the currency the owner picks with the rate of
-- each order (and the target's rate at that moment), so changing a rate today does not move the past.
-- «Vendido» is the same as «Ventas de hoy»: orders not cancelled, coalesce(total, subtotal).
-- service_role only: the API checks owner/admin and the finance module first.

-- Rate to base of a currency at a moment: the last one set before it, else today's, else 1 (base currency = 1).
create function private.rate_at(p_store_id uuid, p_currency text, p_at timestamptz)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when p_currency = (select s.base_currency::text from public.stores s where s.id = p_store_id) then 1
    else coalesce(
      (select h.rate from public.currency_rate_history h
       where h.store_id = p_store_id and h.currency::text = p_currency and h.set_at <= p_at
       order by h.set_at desc limit 1),
      (select c.rate_to_base from public.store_currencies c
       where c.store_id = p_store_id and c.currency::text = p_currency),
      1)
  end;
$$;

-- Start of a Havana day as a timestamp.
create function private.havana_start(p_day date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select p_day::timestamp at time zone 'America/Havana';
$$;

create function private.finance_check_period(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'El periodo no es válido (máximo un año)' using errcode = 'P0001', hint = 'invalid_input';
  end if;
end;
$$;

-- Product lines sold in a period with revenue (without shipping, after the order discount spread by amount, D4)
-- and cost, both converted to p_currency. cost is null when the line had no cost.
create function private.finance_lines(p_store_id uuid, p_from date, p_to date, p_currency text)
returns table (
  line_id uuid, product_id uuid, product_name text, category_id uuid, brand_id uuid, quantity int,
  revenue numeric, cost numeric
)
language sql
stable
set search_path = ''
as $$
  select l.id, l.product_id, l.product_name, p.category_id, p.brand_id, l.quantity,
    (l.line_total - case when o.subtotal > 0 then least(o.discount_total, o.subtotal) * l.line_total / o.subtotal else 0 end)
      * o.exchange_rate / t.rate,
    c.unit_cost * l.quantity * c.cost_rate_to_base / t.rate
  from public.orders o
  join public.order_lines l on l.order_id = o.id
  left join public.order_line_costs c on c.order_line_id = l.id
  left join public.products p on p.id = l.product_id
  cross join lateral (select private.rate_at(o.store_id, p_currency, o.created_at) as rate) t
  where o.store_id = p_store_id and o.status <> 'cancelled'
    and o.created_at >= private.havana_start(p_from) and o.created_at < private.havana_start(p_to + 1);
$$;

-- ---------------------------------------------------------------------------
-- Resumen: sold, collected, pending, expenses and margin per currency + equivalent; previous period to compare.
-- ---------------------------------------------------------------------------

create function public.finance_summary(p_store_id uuid, p_from date, p_to date, p_currency text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int := p_to - p_from + 1;
  v_result jsonb;
begin
  perform private.finance_check_period(p_from, p_to);

  with sold as (
    select o.currency::text as currency, count(*) as orders,
      sum(coalesce(o.total, o.subtotal)) as amount,
      sum(greatest(coalesce(o.total, o.subtotal) - o.paid_total, 0)) as pending,
      sum(coalesce(o.total, o.subtotal) * o.exchange_rate / private.rate_at(p_store_id, p_currency, o.created_at)) as eq,
      sum(greatest(coalesce(o.total, o.subtotal) - o.paid_total, 0) * o.exchange_rate
        / private.rate_at(p_store_id, p_currency, o.created_at)) as pending_eq,
      sum(coalesce(o.shipping_total, 0) * o.exchange_rate / private.rate_at(p_store_id, p_currency, o.created_at))
        as shipping_eq
    from public.orders o
    where o.store_id = p_store_id and o.status <> 'cancelled'
      and o.created_at >= private.havana_start(p_from) and o.created_at < private.havana_start(p_to + 1)
    group by o.currency
  ),
  previous as (
    select count(*) as orders,
      sum(coalesce(o.total, o.subtotal) * o.exchange_rate / private.rate_at(p_store_id, p_currency, o.created_at)) as eq
    from public.orders o
    where o.store_id = p_store_id and o.status <> 'cancelled'
      and o.created_at >= private.havana_start(p_from - v_days) and o.created_at < private.havana_start(p_from)
  ),
  cash as (
    select x.currency, sum(x.amount) as amount, sum(x.amount * x.rate / private.rate_at(p_store_id, p_currency, x.at)) as eq
    from (
      select p.currency::text as currency, p.amount, p.created_at as at,
        case when p.currency = o.currency then o.exchange_rate
             else private.rate_at(p_store_id, p.currency::text, p.created_at) end as rate
      from public.payments p join public.orders o on o.id = p.order_id
      where p.store_id = p_store_id
        and p.created_at >= private.havana_start(p_from) and p.created_at < private.havana_start(p_to + 1)
      union all
      select r.currency::text, -r.amount, r.created_at,
        case when r.currency = o.currency then o.exchange_rate
             else private.rate_at(p_store_id, r.currency::text, r.created_at) end
      from public.refunds r join public.orders o on o.id = r.order_id
      where r.store_id = p_store_id
        and r.created_at >= private.havana_start(p_from) and r.created_at < private.havana_start(p_to + 1)
    ) x
    group by x.currency
  ),
  spent as (
    select e.currency::text as currency, sum(e.amount) as amount,
      sum(e.amount * private.rate_at(p_store_id, e.currency::text, private.havana_start(e.spent_on + 1))
        / private.rate_at(p_store_id, p_currency, private.havana_start(e.spent_on + 1))) as eq
    from public.expenses e
    where e.store_id = p_store_id and e.spent_on between p_from and p_to
    group by e.currency
  ),
  margin as (
    select coalesce(sum(revenue) filter (where cost is not null), 0) as revenue,
      coalesce(sum(cost), 0) as cost,
      count(*) filter (where cost is null) as without_cost
    from private.finance_lines(p_store_id, p_from, p_to, p_currency)
  )
  select jsonb_build_object(
    'currency', p_currency,
    'from', p_from,
    'to', p_to,
    'sold', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'orders', orders,
      'amount', round(amount, 2), 'pending', round(pending, 2)) order by currency) from sold), '[]'),
    'collected', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2))
      order by currency) from cash), '[]'),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2))
      order by currency) from spent), '[]'),
    'totals', jsonb_build_object(
      'orders', coalesce((select sum(orders) from sold), 0),
      'sold', round(coalesce((select sum(eq) from sold), 0), 2),
      'pending', round(coalesce((select sum(pending_eq) from sold), 0), 2),
      'shipping', round(coalesce((select sum(shipping_eq) from sold), 0), 2),
      'collected', round(coalesce((select sum(eq) from cash), 0), 2),
      'expenses', round(coalesce((select sum(eq) from spent), 0), 2),
      'avg_ticket', round(coalesce((select sum(eq) / nullif(sum(orders), 0) from sold), 0), 2),
      'margin', round((select revenue - cost from margin), 2),
      'net', round((select revenue - cost from margin) - coalesce((select sum(eq) from spent), 0), 2),
      'lines_without_cost', (select without_cost from margin)
    ),
    'previous', jsonb_build_object(
      'from', p_from - v_days,
      'to', p_from - 1,
      'orders', (select orders from previous),
      'sold', round(coalesce((select eq from previous), 0), 2)
    )
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cierre del día (Roberto): per Havana day, sold / collected / expenses in every currency + equivalent.
-- ---------------------------------------------------------------------------

create function public.finance_daily(p_store_id uuid, p_from date, p_to date, p_currency text)
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

  with days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  rows as (
    select (o.created_at at time zone 'America/Havana')::date as day, 'sold' as kind, o.currency::text as currency,
      coalesce(o.total, o.subtotal) as amount,
      coalesce(o.total, o.subtotal) * o.exchange_rate / private.rate_at(p_store_id, p_currency, o.created_at) as eq,
      1 as orders
    from public.orders o
    where o.store_id = p_store_id and o.status <> 'cancelled'
      and o.created_at >= private.havana_start(p_from) and o.created_at < private.havana_start(p_to + 1)
    union all
    select (p.created_at at time zone 'America/Havana')::date, 'collected', p.currency::text, p.amount,
      p.amount * (case when p.currency = o.currency then o.exchange_rate
                       else private.rate_at(p_store_id, p.currency::text, p.created_at) end)
        / private.rate_at(p_store_id, p_currency, p.created_at),
      0
    from public.payments p join public.orders o on o.id = p.order_id
    where p.store_id = p_store_id
      and p.created_at >= private.havana_start(p_from) and p.created_at < private.havana_start(p_to + 1)
    union all
    select (r.created_at at time zone 'America/Havana')::date, 'collected', r.currency::text, -r.amount,
      -r.amount * (case when r.currency = o.currency then o.exchange_rate
                        else private.rate_at(p_store_id, r.currency::text, r.created_at) end)
        / private.rate_at(p_store_id, p_currency, r.created_at),
      0
    from public.refunds r join public.orders o on o.id = r.order_id
    where r.store_id = p_store_id
      and r.created_at >= private.havana_start(p_from) and r.created_at < private.havana_start(p_to + 1)
    union all
    select e.spent_on, 'expenses', e.currency::text, e.amount,
      e.amount * private.rate_at(p_store_id, e.currency::text, private.havana_start(e.spent_on + 1))
        / private.rate_at(p_store_id, p_currency, private.havana_start(e.spent_on + 1)),
      0
    from public.expenses e
    where e.store_id = p_store_id and e.spent_on between p_from and p_to
  ),
  per_currency as (
    select day, kind, currency, sum(amount) as amount, sum(eq) as eq, sum(orders) as orders
    from rows group by day, kind, currency
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', d.day,
    'orders', coalesce((select sum(orders) from per_currency x where x.day = d.day and x.kind = 'sold'), 0),
    'sold', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2))
      order by currency) from per_currency x where x.day = d.day and x.kind = 'sold'), '[]'),
    'collected', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2))
      order by currency) from per_currency x where x.day = d.day and x.kind = 'collected'), '[]'),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2))
      order by currency) from per_currency x where x.day = d.day and x.kind = 'expenses'), '[]'),
    'sold_eq', round(coalesce((select sum(eq) from per_currency x where x.day = d.day and x.kind = 'sold'), 0), 2),
    'collected_eq', round(coalesce((select sum(eq) from per_currency x where x.day = d.day and x.kind = 'collected'), 0), 2),
    'expenses_eq', round(coalesce((select sum(eq) from per_currency x where x.day = d.day and x.kind = 'expenses'), 0), 2)
  ) order by d.day), '[]')
  into v_result
  from days d;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Margen by product, category or brand (D3, D4). Lines without cost are counted apart.
-- ---------------------------------------------------------------------------

create function public.finance_margin(p_store_id uuid, p_from date, p_to date, p_currency text, p_group text)
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
    select * from private.finance_lines(p_store_id, p_from, p_to, p_currency)
  ),
  grouped as (
    select
      case p_group when 'product' then l.product_id when 'category' then l.category_id else l.brand_id end as key,
      min(case p_group
        when 'product' then l.product_name
        when 'category' then (select c.name from public.categories c where c.id = l.category_id)
        else (select b.name from public.brands b where b.id = l.brand_id) end) as name,
      sum(l.quantity) as units,
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
        'units', units, 'revenue', round(revenue, 2), 'cost', round(coalesce(cost, 0), 2),
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

-- ---------------------------------------------------------------------------
-- Desglose: by payment method, delivery zone, channel and currency (equivalent amounts).
-- ---------------------------------------------------------------------------

create function public.finance_breakdown(p_store_id uuid, p_from date, p_to date, p_currency text)
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

  with sold as (
    select
      coalesce(nullif(o.payment_snapshot ->> 'name', ''), 'Sin indicar') as payment,
      coalesce(nullif(o.shipping_snapshot ->> 'zone', ''),
        case o.shipping_type when 'pickup' then 'Recogida' when 'delivery' then 'Sin zona' else 'A convenir' end) as zone,
      o.channel::text as channel,
      o.currency::text as currency,
      coalesce(o.total, o.subtotal) as amount,
      coalesce(o.total, o.subtotal) * o.exchange_rate / private.rate_at(p_store_id, p_currency, o.created_at) as eq
    from public.orders o
    where o.store_id = p_store_id and o.status <> 'cancelled'
      and o.created_at >= private.havana_start(p_from) and o.created_at < private.havana_start(p_to + 1)
  )
  select jsonb_build_object(
    'currency', p_currency,
    'payment_methods', coalesce((select jsonb_agg(jsonb_build_object('name', payment, 'orders', n, 'amount', round(eq, 2))
      order by eq desc) from (select payment, count(*) n, sum(eq) eq from sold group by payment) x), '[]'),
    'zones', coalesce((select jsonb_agg(jsonb_build_object('name', zone, 'orders', n, 'amount', round(eq, 2))
      order by eq desc) from (select zone, count(*) n, sum(eq) eq from sold group by zone) x), '[]'),
    'channels', coalesce((select jsonb_agg(jsonb_build_object('name', channel, 'orders', n, 'amount', round(eq, 2))
      order by eq desc) from (select channel, count(*) n, sum(eq) eq from sold group by channel) x), '[]'),
    'currencies', coalesce((select jsonb_agg(jsonb_build_object('name', currency, 'orders', n,
      'original', round(amount, 2), 'amount', round(eq, 2)) order by eq desc)
      from (select currency, count(*) n, sum(amount) amount, sum(eq) eq from sold group by currency) x), '[]')
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inventario valorado (D6): per variant (one warehouse or all), at today's rates.
-- p_filter: all | low (available <= threshold, 3 by default) | out (nothing available) | stale (no movement in
-- p_stale_days and units in stock).
-- ---------------------------------------------------------------------------

create function public.finance_inventory(
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
    select v.id as variant_id, p.name as product_name, v.name as variant_name, v.sku, v.price,
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
    group by v.id, p.name, v.name, v.sku, v.price
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
      'units', coalesce(sum(quantity), 0),
      'reserved', coalesce(sum(allocated), 0),
      'cost_value', round(coalesce(sum(cost_value), 0), 2),
      'sale_value', round(coalesce(sum(sale_value), 0), 2),
      'without_cost', count(*) filter (where cost_value is null and quantity > 0),
      'out_of_stock', count(*) filter (where available <= 0),
      'low_stock', count(*) filter (where available > 0 and available <= threshold)
    ) from valued),
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'variant_id', variant_id, 'product_name', product_name, 'variant_name', variant_name, 'sku', sku,
        'quantity', quantity, 'allocated', allocated, 'available', available, 'threshold', threshold,
        'cost_value', round(cost_value, 2), 'sale_value', round(sale_value, 2), 'last_movement', last_movement
      ) order by product_name, sku)
      from (select * from filtered order by product_name, sku
            limit least(greatest(coalesce(p_limit, 50), 1), 500) offset greatest(coalesce(p_offset, 0), 0)) f), '[]')
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.finance_summary(uuid, date, date, text), public.finance_daily(uuid, date, date, text),
  public.finance_margin(uuid, date, date, text, text), public.finance_breakdown(uuid, date, date, text),
  public.finance_inventory(uuid, uuid, text, text, int, text, int, int)
  from public, anon, authenticated;
grant execute on function public.finance_summary(uuid, date, date, text), public.finance_daily(uuid, date, date, text),
  public.finance_margin(uuid, date, date, text, text), public.finance_breakdown(uuid, date, date, text),
  public.finance_inventory(uuid, uuid, text, text, int, text, int, int)
  to service_role;
