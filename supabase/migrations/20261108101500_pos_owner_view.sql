-- POS (PRP pos-offline, phase 6): what the owner sees of the counter. Pedidos filters by channel; a counter sale shows what
-- did not add up, and Caja sums up the period. Read as the signed-in staff (security invoker, RLS limits them to the store).

-- ---------------------------------------------------------------------------
-- Orders: same result, one more filter
-- ---------------------------------------------------------------------------

drop function public.admin_orders(uuid, int, int, public.order_status[], int, text, text, int);

create function public.admin_orders(
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
        ), '[]'::jsonb))
      )) order by o.created_at desc nulls last, o.id)
      from (select * from page order by created_at desc nulls last, id limit p_first) o
    ), '[]'::jsonb)
  ));
$$;

revoke execute on function public.admin_orders(uuid, int, int, public.order_status[], int, text, text, int, public.order_channel)
  from public, anon;
grant execute on function public.admin_orders(uuid, int, int, public.order_status[], int, text, text, int, public.order_channel)
  to authenticated;

-- ---------------------------------------------------------------------------
-- A counter sale: flags carry the variant id, the owner reads the name of the product
-- ---------------------------------------------------------------------------

create function private.pos_flag_notes(p_order_id uuid, p_flags jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(f.value || jsonb_build_object('name', coalesce(f.value ->> 'name', (
    select l.product_name from public.order_lines l
    where l.order_id = p_order_id and l.variant_id::text = f.value ->> 'variant_id'
    limit 1
  ))) order by f.ordinality), '[]'::jsonb)
  from jsonb_array_elements(p_flags) with ordinality f;
$$;

revoke all on function private.pos_flag_notes(uuid, jsonb) from public, anon;
grant execute on function private.pos_flag_notes(uuid, jsonb) to authenticated;

-- Null when the order is not a counter sale, or not of a store of the caller.
create function public.admin_pos_sale(p_order_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'localNumber', s.local_number,
    'soldAt', s.sold_at,
    'uploadedAt', s.uploaded_at,
    'flags', private.pos_flag_notes(s.order_id, s.flags)
  )
  from public.pos_sales s
  where s.order_id = p_order_id;
$$;

revoke execute on function public.admin_pos_sale(uuid) from public, anon;
grant execute on function public.admin_pos_sale(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Caja: the last p_days days in Cuba, counting from today. By when it was sold, not when the phone got a connection.
-- ---------------------------------------------------------------------------

create function public.admin_pos_overview(p_store_id uuid, p_days int default 1)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with sales as (
    select s.order_id, s.local_number, s.sold_at, s.flags, o.number, o.status, o.currency
    from public.pos_sales s
    join public.orders o on o.id = s.order_id
    where s.store_id = p_store_id
      and s.sold_at >= ((now() at time zone 'America/Havana')::date - (least(greatest(p_days, 1), 90) - 1))
        at time zone 'America/Havana'
  ),
  live as (
    select * from sales where status <> 'cancelled'
  ),
  flagged as (
    select * from live where flags <> '[]'::jsonb
  ),
  till as (
    select p.currency, p.amount
    from public.payments p join live on live.order_id = p.order_id
    union all
    select p.change_currency, -p.change_amount
    from public.payments p join live on live.order_id = p.order_id
    where p.change_amount is not null
  )
  select jsonb_build_object(
    'count', (select count(*) from live),
    'cancelled', (select count(*) from sales where status = 'cancelled'),
    -- What the till holds: as charged, net of the change given.
    'cash', coalesce((
      select jsonb_agg(jsonb_build_object('currency', t.currency, 'amount', t.amount) order by t.currency)
      from (select currency, sum(amount) as amount from till group by currency having sum(amount) <> 0) t
    ), '[]'::jsonb),
    'rates', coalesce((
      select jsonb_agg(jsonb_build_object('currency', r.currency, 'orderCurrency', r.order_currency,
        'rateToOrder', r.rate_to_order, 'payments', r.payments) order by r.currency, r.payments desc, r.rate_to_order)
      from (
        select p.currency, live.currency as order_currency, p.rate_to_order, count(*) as payments
        from public.payments p join live on live.order_id = p.order_id
        where p.currency <> live.currency
        group by p.currency, live.currency, p.rate_to_order
      ) r
    ), '[]'::jsonb),
    'flaggedCount', (select count(*) from flagged),
    'flagged', coalesce((
      select jsonb_agg(jsonb_build_object('orderId', f.order_id, 'number', f.number, 'localNumber', f.local_number,
        'soldAt', f.sold_at, 'currency', f.currency, 'flags', private.pos_flag_notes(f.order_id, f.flags))
        order by f.sold_at desc)
      from (select * from flagged order by sold_at desc limit 50) f
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.admin_pos_overview(uuid, int) from public, anon;
grant execute on function public.admin_pos_overview(uuid, int) to authenticated;
