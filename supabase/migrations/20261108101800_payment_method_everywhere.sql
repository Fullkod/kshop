-- KSH0010: the payment method shows wherever a payment does — the order list (admin_orders) and Ventas de hoy
-- (sales_today.by_method). The order detail already reads payments.payment_method_id.

create or replace function public.admin_orders(
  p_store_id uuid,
  p_first int,
  p_offset int default 0,
  p_statuses public.order_status[] default null,
  p_number int default null,
  -- Search: customer name ILIKE p_name OR phone ILIKE p_phone OR number = p_search_number (each only when given).
  p_name text default null,
  p_phone text default null,
  p_search_number int default null,
  p_channel public.order_channel default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with matched as (
    select o.*
    from public.orders o
    where o.store_id = p_store_id
      and (p_statuses is null or o.status = any (p_statuses))
      and (p_channel is null or o.channel = p_channel)
      and (p_number is null or o.number = p_number)
      and (
        (p_name is null and p_phone is null and p_search_number is null)
        or o.customer_name ilike p_name
        or o.customer_phone ilike p_phone
        or o.number = p_search_number
      )
  ),
  page as (
    select * from matched order by created_at desc nulls last, id limit p_first + 1 offset p_offset
  )
  select jsonb_build_object('ordersCollection', jsonb_build_object(
    'totalCount', (select count(*) from matched),
    'pageInfo', jsonb_build_object(
      'hasNextPage', (select count(*) from page) > p_first,
      'endCursor', (p_offset + p_first)::text
    ),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', o.id,
        'number', o.number,
        'status', o.status,
        'paymentStatus', o.payment_status,
        'channel', o.channel,
        'currency', o.currency,
        'total', o.total::text,
        'subtotal', o.subtotal::text,
        'shippingTotal', o.shipping_total::text,
        'paidTotal', o.paid_total::text,
        'customerName', o.customer_name,
        'customerPhone', o.customer_phone,
        'shippingType', o.shipping_type,
        'createdAt', o.created_at,
        'orderLinesCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object('quantity', l.quantity)) order by l.id)
          from (select id, quantity from public.order_lines where order_id = o.id order by id limit 100) l
        ), '[]'::jsonb)),
        -- KSH0010: how each order was paid (Efectivo, Transferencia…).
        'paymentsCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'paymentMethods', case when m.id is null then null else jsonb_build_object('name', m.name) end
          )) order by p.created_at nulls last, p.id)
          from (select id, created_at, store_id, payment_method_id from public.payments
                where order_id = o.id order by created_at nulls last, id limit 20) p
          left join public.payment_methods m on m.store_id = p.store_id and m.id = p.payment_method_id
        ), '[]'::jsonb))
      )) order by o.created_at desc nulls last, o.id)
      from (select * from page order by created_at desc nulls last, id limit p_first) o
    ), '[]'::jsonb)
  ));
$$;


-- Ventas de hoy: the till per currency, net of the change given, and the same per payment method (KSH0010).
create or replace function public.sales_today(p_store_id uuid)
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
      select p.change_currency, -p.change_amount from public.payments p, bounds b
      where p.store_id = p_store_id and p.change_amount is not null and p.created_at >= b.day_start
      union all
      select r.currency, -r.amount from public.refunds r, bounds b
      where r.store_id = p_store_id and r.created_at >= b.day_start
    ) x
    group by currency
  ),
  -- Payments with a method: what was handed, less the change given back in the same currency.
  by_method as (
    select m.name as method, p.currency,
      sum(p.amount - case when p.change_currency = p.currency then coalesce(p.change_amount, 0) else 0 end) as amount
    from public.payments p
    join public.payment_methods m on m.store_id = p.store_id and m.id = p.payment_method_id, bounds b
    where p.store_id = p_store_id and p.created_at >= b.day_start
    group by m.name, p.currency
  )
  select jsonb_build_object(
    'day_start', (select day_start from bounds),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'orders', orders, 'amount', amount)
      order by currency) from orders_today), '[]'),
    'received', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount)
      order by currency) from cash_today), '[]'),
    'by_method', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'currency', currency, 'amount', amount)
      order by method, currency) from by_method), '[]'),
    'pending', (select count(*) from public.orders o
      where o.store_id = p_store_id and o.status in ('pending_confirmation', 'pending_payment'))
  );
$$;
