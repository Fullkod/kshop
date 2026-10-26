-- Phase 6.3 (D5, measured): with 20 000 orders the reports took 0.3–2.6 s because private.rate_at ran per row and
-- per sum. The target currency's rate is now read once as periods [from_at, to_at) and joined by date; each order
-- converts with one factor. Same results as private.rate_at (before the first recorded rate: today's rate).

create function private.rate_periods(p_store_id uuid, p_currency text)
returns table (from_at timestamptz, to_at timestamptz, rate numeric)
language sql
stable
set search_path = ''
as $$
  with cur as (
    select p_currency = s.base_currency::text as is_base,
      case when p_currency = s.base_currency::text then 1::numeric
        else coalesce((select c.rate_to_base from public.store_currencies c
                       where c.store_id = p_store_id and c.currency::text = p_currency), 1) end as now_rate
    from public.stores s where s.id = p_store_id
  ),
  h as (
    select h.set_at, h.rate, lead(h.set_at) over (order by h.set_at) as next_at
    from public.currency_rate_history h, cur
    where not cur.is_base and h.store_id = p_store_id and h.currency::text = p_currency
  )
  select '-infinity'::timestamptz, coalesce((select min(set_at) from h), 'infinity'::timestamptz), (select now_rate from cur)
  union all
  select set_at, coalesce(next_at, 'infinity'::timestamptz), rate from h;
$$;

create or replace function private.finance_lines(p_store_id uuid, p_from date, p_to date, p_currency text)
returns table (
  line_id uuid, product_id uuid, product_name text, category_id uuid, brand_id uuid, quantity int,
  revenue numeric, cost numeric
)
language sql
stable
set search_path = ''
as $$
  with tp as (select * from private.rate_periods(p_store_id, p_currency))
  select l.id, l.product_id, l.product_name, p.category_id, p.brand_id, l.quantity,
    (l.line_total - case when o.subtotal > 0 then least(o.discount_total, o.subtotal) * l.line_total / o.subtotal else 0 end)
      * o.exchange_rate / tp.rate,
    c.unit_cost * l.quantity * c.cost_rate_to_base / tp.rate
  from public.orders o
  join tp on o.created_at >= tp.from_at and o.created_at < tp.to_at
  join public.order_lines l on l.order_id = o.id
  left join public.order_line_costs c on c.order_line_id = l.id
  left join public.products p on p.id = l.product_id
  where o.store_id = p_store_id and o.status <> 'cancelled'
    and o.created_at >= private.havana_start(p_from) and o.created_at < private.havana_start(p_to + 1);
$$;

create or replace function public.finance_summary(p_store_id uuid, p_from date, p_to date, p_currency text)
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

  with tp as (
    select * from private.rate_periods(p_store_id, p_currency)
  ),
  ord as (
    select o.currency::text as currency, o.created_at, coalesce(o.total, o.subtotal) as amount,
      greatest(coalesce(o.total, o.subtotal) - o.paid_total, 0) as pending,
      coalesce(o.shipping_total, 0) as shipping, o.exchange_rate / tp.rate as f
    from public.orders o
    join tp on o.created_at >= tp.from_at and o.created_at < tp.to_at
    where o.store_id = p_store_id and o.status <> 'cancelled'
      and o.created_at >= private.havana_start(p_from - v_days) and o.created_at < private.havana_start(p_to + 1)
  ),
  sold as (
    select currency, count(*) as orders, sum(amount) as amount, sum(pending) as pending, sum(amount * f) as eq,
      sum(pending * f) as pending_eq, sum(shipping * f) as shipping_eq
    from ord where created_at >= private.havana_start(p_from)
    group by currency
  ),
  previous as (
    select count(*) as orders, sum(amount * f) as eq
    from ord where created_at < private.havana_start(p_from)
  ),
  cash as (
    select x.currency, sum(x.amount) as amount, sum(x.amount * x.rate / tp.rate) as eq
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
    join tp on x.at >= tp.from_at and x.at < tp.to_at
    group by x.currency
  ),
  spent as (
    select e.currency::text as currency, sum(e.amount) as amount,
      sum(e.amount * private.rate_at(p_store_id, e.currency::text, private.havana_start(e.spent_on + 1)) / tp.rate) as eq
    from public.expenses e
    join tp on private.havana_start(e.spent_on + 1) >= tp.from_at and private.havana_start(e.spent_on + 1) < tp.to_at
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

create or replace function public.finance_daily(p_store_id uuid, p_from date, p_to date, p_currency text)
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

  with tp as (
    select * from private.rate_periods(p_store_id, p_currency)
  ),
  days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  rows as (
    select (o.created_at at time zone 'America/Havana')::date as day, 'sold' as kind, o.currency::text as currency,
      coalesce(o.total, o.subtotal) as amount, coalesce(o.total, o.subtotal) * o.exchange_rate / tp.rate as eq,
      1 as orders
    from public.orders o
    join tp on o.created_at >= tp.from_at and o.created_at < tp.to_at
    where o.store_id = p_store_id and o.status <> 'cancelled'
      and o.created_at >= private.havana_start(p_from) and o.created_at < private.havana_start(p_to + 1)
    union all
    select (x.at at time zone 'America/Havana')::date, 'collected', x.currency, x.amount, x.amount * x.rate / tp.rate, 0
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
    join tp on x.at >= tp.from_at and x.at < tp.to_at
    union all
    select e.spent_on, 'expenses', e.currency::text, e.amount,
      e.amount * private.rate_at(p_store_id, e.currency::text, private.havana_start(e.spent_on + 1)) / tp.rate, 0
    from public.expenses e
    join tp on private.havana_start(e.spent_on + 1) >= tp.from_at and private.havana_start(e.spent_on + 1) < tp.to_at
    where e.store_id = p_store_id and e.spent_on between p_from and p_to
  ),
  per_currency as (
    select day, kind, currency, sum(amount) as amount, sum(eq) as eq, sum(orders) as orders
    from rows group by day, kind, currency
  ),
  per_day as (
    select day,
      sum(orders) filter (where kind = 'sold') as orders,
      jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2)) order by currency)
        filter (where kind = 'sold') as sold,
      jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2)) order by currency)
        filter (where kind = 'collected') as collected,
      jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2)) order by currency)
        filter (where kind = 'expenses') as expenses,
      sum(eq) filter (where kind = 'sold') as sold_eq,
      sum(eq) filter (where kind = 'collected') as collected_eq,
      sum(eq) filter (where kind = 'expenses') as expenses_eq
    from per_currency group by day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', d.day,
    'orders', coalesce(x.orders, 0),
    'sold', coalesce(x.sold, '[]'),
    'collected', coalesce(x.collected, '[]'),
    'expenses', coalesce(x.expenses, '[]'),
    'sold_eq', round(coalesce(x.sold_eq, 0), 2),
    'collected_eq', round(coalesce(x.collected_eq, 0), 2),
    'expenses_eq', round(coalesce(x.expenses_eq, 0), 2)
  ) order by d.day), '[]')
  into v_result
  from days d left join per_day x on x.day = d.day;
  return v_result;
end;
$$;

create or replace function public.finance_breakdown(p_store_id uuid, p_from date, p_to date, p_currency text)
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

  with tp as (
    select * from private.rate_periods(p_store_id, p_currency)
  ),
  sold as (
    select
      coalesce(nullif(o.payment_snapshot ->> 'name', ''), 'Sin indicar') as payment,
      coalesce(nullif(o.shipping_snapshot ->> 'zone', ''),
        case o.shipping_type when 'pickup' then 'Recogida' when 'delivery' then 'Sin zona' else 'A convenir' end) as zone,
      o.channel::text as channel,
      o.currency::text as currency,
      coalesce(o.total, o.subtotal) as amount,
      coalesce(o.total, o.subtotal) * o.exchange_rate / tp.rate as eq
    from public.orders o
    join tp on o.created_at >= tp.from_at and o.created_at < tp.to_at
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
