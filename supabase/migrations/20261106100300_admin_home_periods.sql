-- Redesign v2 (Inicio, «Hoy · 7 días · Mes»): admin_home_summary also returns the KPIs per period, in the base currency
-- with each order's frozen exchange rate, and the previous period to compare with:
--   day:   today            vs yesterday
--   week:  the last 7 days  vs the 7 days before
--   month: this month       vs last month
-- sold = orders created in the period (not cancelled); received = payments minus refunds recorded in the period.
-- Day cut in America/Havana as sales_today. service_role only, as before.

create or replace function public.admin_home_summary(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select
      (date_trunc('day', now() at time zone 'America/Havana')) at time zone 'America/Havana' as day_start,
      (date_trunc('month', now() at time zone 'America/Havana')) at time zone 'America/Havana' as month_start
  ),
  days as (
    select generate_series(0, 6) as ago
  ),
  week as (
    select d.ago,
      ((select day_start from bounds) - make_interval(days => d.ago)) as day_start,
      (select count(*) from public.orders o
        where o.store_id = p_store_id and o.status <> 'cancelled'
          and o.created_at >= (select day_start from bounds) - make_interval(days => d.ago)
          and o.created_at < (select day_start from bounds) - make_interval(days => d.ago - 1)) as orders,
      (select coalesce(sum(coalesce(o.total, o.subtotal) * o.exchange_rate), 0) from public.orders o
        where o.store_id = p_store_id and o.status <> 'cancelled'
          and o.created_at >= (select day_start from bounds) - make_interval(days => d.ago)
          and o.created_at < (select day_start from bounds) - make_interval(days => d.ago - 1)) as amount
    from days d
  ),
  ranges as (
    select 'day' as period, b.day_start as cur_from, b.day_start - interval '1 day' as prev_from,
      b.day_start as prev_to
    from bounds b
    union all
    select 'week', b.day_start - interval '6 days', b.day_start - interval '13 days', b.day_start - interval '6 days'
    from bounds b
    union all
    select 'month', b.month_start,
      ((date_trunc('month', (now() at time zone 'America/Havana') - interval '1 month')) at time zone 'America/Havana'),
      b.month_start
    from bounds b
  ),
  figures as (
    select r.period, w.is_current,
      (select count(*) from public.orders o
        where o.store_id = p_store_id and o.status <> 'cancelled'
          and o.created_at >= w.from_at and o.created_at < w.to_at) as orders,
      (select coalesce(sum(coalesce(o.total, o.subtotal) * o.exchange_rate), 0) from public.orders o
        where o.store_id = p_store_id and o.status <> 'cancelled'
          and o.created_at >= w.from_at and o.created_at < w.to_at) as sold,
      (select coalesce(sum(p.amount * o.exchange_rate), 0) from public.payments p
        join public.orders o on o.id = p.order_id and o.store_id = p.store_id
        where p.store_id = p_store_id and p.created_at >= w.from_at and p.created_at < w.to_at)
      - (select coalesce(sum(x.amount * o.exchange_rate), 0) from public.refunds x
        join public.orders o on o.id = x.order_id and o.store_id = x.store_id
        where x.store_id = p_store_id and x.created_at >= w.from_at and x.created_at < w.to_at) as received
    from ranges r
    cross join lateral (values (true, r.cur_from, 'infinity'::timestamptz), (false, r.prev_from, r.prev_to))
      as w(is_current, from_at, to_at)
  )
  select jsonb_build_object(
    'todo', jsonb_build_object(
      'to_confirm', (select count(*) from public.orders o
        where o.store_id = p_store_id and o.status = 'pending_confirmation'),
      'to_deliver', (select count(*) from public.orders o
        where o.store_id = p_store_id and o.status in ('paid', 'processing', 'shipped')),
      'low_stock', (select count(*) from public.products p
        where p.store_id = p_store_id and p.status = 'published' and exists (
          select 1 from public.product_variants v
          where v.product_id = p.id and v.track_inventory and v.stock_available <= 3))
    ),
    'week', (select jsonb_agg(jsonb_build_object('day', w.day_start, 'orders', w.orders, 'amount', w.amount)
      order by w.ago desc) from week w),
    'to_collect', (select coalesce(sum((o.total - o.paid_total) * o.exchange_rate), 0) from public.orders o
      where o.store_id = p_store_id and o.status <> 'cancelled' and o.total is not null
        and o.payment_status in ('unpaid', 'partially_paid')),
    'periods', (select jsonb_object_agg(c.period, jsonb_build_object(
        'orders', c.orders, 'sold', round(c.sold, 2), 'received', round(c.received, 2),
        'prev_orders', p.orders, 'prev_sold', round(p.sold, 2), 'prev_received', round(p.received, 2)))
      from figures c join figures p on p.period = c.period and not p.is_current
      where c.is_current)
  );
$$;

revoke all on function public.admin_home_summary(uuid) from public, anon, authenticated;
grant execute on function public.admin_home_summary(uuid) to service_role;
