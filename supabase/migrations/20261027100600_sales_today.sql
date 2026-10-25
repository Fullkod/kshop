-- Phase 3 (D16): "Ventas de hoy" of a store, the day cut in America/Havana (not UTC). Orders created today
-- that are not cancelled, and payments received today (minus refunds), per currency. service_role only:
-- the API checks the role and the sales_today module first.

create function public.sales_today(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select (date_trunc('day', now() at time zone 'America/Havana')) at time zone 'America/Havana' as day_start
  ),
  orders_today as (
    select o.currency, count(*) as orders, sum(coalesce(o.total, o.subtotal)) as amount
    from public.orders o, bounds b
    where o.store_id = p_store_id and o.created_at >= b.day_start and o.status <> 'cancelled'
    group by o.currency
  ),
  cash_today as (
    select currency, sum(amount) as amount from (
      select p.currency, p.amount from public.payments p, bounds b
      where p.store_id = p_store_id and p.created_at >= b.day_start
      union all
      select r.currency, -r.amount from public.refunds r, bounds b
      where r.store_id = p_store_id and r.created_at >= b.day_start
    ) x
    group by currency
  )
  select jsonb_build_object(
    'day_start', (select day_start from bounds),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'orders', orders, 'amount', amount)
      order by currency) from orders_today), '[]'),
    'received', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount)
      order by currency) from cash_today), '[]'),
    'pending', (select count(*) from public.orders o
      where o.store_id = p_store_id and o.status in ('pending_confirmation', 'pending_payment'))
  );
$$;

revoke all on function public.sales_today(uuid) from public, anon, authenticated;
grant execute on function public.sales_today(uuid) to service_role;
