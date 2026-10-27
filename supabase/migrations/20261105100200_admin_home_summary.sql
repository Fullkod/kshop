-- Redesign v2 (R6): what the admin home shows besides «Ventas de hoy». Day cut in America/Havana like sales_today.
--   todo:       orders to confirm, orders to deliver (paid or in progress, not delivered) and published products with a
--               tracked variant at 3 units or less (the catalog's «poco stock» filter);
--   week:       the last 7 days, orders (not cancelled) and their total in the base currency (frozen exchange rate);
--   to_collect: what open orders still owe, in the base currency.
-- service_role only: the API checks the role, and the money parts only go out with the sales_today module.

create function public.admin_home_summary(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select (date_trunc('day', now() at time zone 'America/Havana')) at time zone 'America/Havana' as day_start
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
        and o.payment_status in ('unpaid', 'partially_paid'))
  );
$$;

revoke all on function public.admin_home_summary(uuid) from public, anon, authenticated;
grant execute on function public.admin_home_summary(uuid) to service_role;
