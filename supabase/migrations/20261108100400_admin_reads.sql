-- R11 phase 5 (G10): the admin's daily reads (orders, order detail, checkout settings, WhatsApp log) as plain RPCs.
-- Measured on the Nano: these queries cost 11–47 ms warm, but the first pg_graphql query of every new connection
-- rebuilds its schema (~230–300 ms of CPU, seconds when the CPU is throttled), and with little traffic PostgREST
-- keeps closing idle connections, so almost every admin page paid it. A plain function does not.
-- Each function returns exactly the shape of the pg_graphql query it replaces (AdminOrders, AdminOrder,
-- CheckoutSettings, NotificationLog in packages/data), so the screens keep their types: numeric and jsonb as text,
-- timestamps as to_jsonb. Security invoker: the same RLS as pg_graphql (store staff only; line costs to admins only).
-- Pagination cursors are opaque offsets.

create or replace function public.admin_orders(
  p_store_id uuid,
  p_first int,
  p_offset int default 0,
  p_statuses public.order_status[] default null,
  p_number int default null,
  -- Search: customer name ILIKE p_name or phone ILIKE p_phone (both patterns come from the client).
  p_name text default null,
  p_phone text default null
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
      and (p_number is null or o.number = p_number)
      and (p_name is null or o.customer_name ilike p_name or o.customer_phone ilike p_phone)
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

create or replace function public.admin_order(p_order_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('ordersCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
      'id', o.id,
      'storeId', o.store_id,
      'number', o.number,
      'publicToken', o.public_token,
      'status', o.status,
      'paymentStatus', o.payment_status,
      'channel', o.channel,
      'currency', o.currency,
      'exchangeRate', o.exchange_rate::text,
      'subtotal', o.subtotal::text,
      'shippingTotal', o.shipping_total::text,
      'discountTotal', o.discount_total::text,
      'total', o.total::text,
      'paidTotal', o.paid_total::text,
      'customerId', o.customer_id,
      'customerName', o.customer_name,
      'customerPhone', o.customer_phone,
      'customerNote', o.customer_note,
      'shippingType', o.shipping_type,
      'shippingSnapshot', o.shipping_snapshot::text,
      'paymentMethodId', o.payment_method_id,
      'paymentSnapshot', o.payment_snapshot::text,
      'createdAt', o.created_at,
      'confirmedAt', o.confirmed_at,
      'paidAt', o.paid_at,
      'shippedAt', o.shipped_at,
      'deliveredAt', o.delivered_at,
      'cancelledAt', o.cancelled_at,
      'cancelReason', o.cancel_reason,
      'customers', (
        select jsonb_build_object('id', c.id, 'firstName', c.first_name, 'lastName', c.last_name, 'phone', c.phone)
        from public.customers c where c.id = o.customer_id
      ),
      'orderDiscountsCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'id', d.id, 'kind', d.kind, 'name', d.name, 'code', d.code, 'reward', d.reward,
          'value', d.value::text, 'amount', d.amount::text, 'reason', d.reason
        )) order by d.id)
        from (select * from public.order_discounts where order_id = o.id order by id limit 20) d
      ), '[]'::jsonb)),
      'orderLinesCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'id', l.id,
          'productId', l.product_id,
          'productName', l.product_name,
          'variantName', l.variant_name,
          'sku', l.sku,
          'attributes', l.attributes::text,
          'imageUrl', l.image_url,
          'quantity', l.quantity,
          'unitListPrice', l.unit_list_price::text,
          'unitPrice', l.unit_price::text,
          'compareAtPrice', l.compare_at_price::text,
          'lineTotal', l.line_total::text,
          'promotionName', l.promotion_name,
          'orderLineCosts', (
            select jsonb_build_object('unitCost', k.unit_cost::text, 'costCurrency', k.cost_currency)
            from public.order_line_costs k where k.order_line_id = l.id
          )
        )) order by l.sort_order nulls last, l.id)
        from (
          select * from public.order_lines where order_id = o.id order by sort_order nulls last, id limit 100
        ) l
      ), '[]'::jsonb)),
      'orderEventsCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'id', e.id, 'type', e.type, 'isInternal', e.is_internal, 'payload', e.payload::text,
          'createdAt', e.created_at
        )) order by e.created_at nulls last, e.id)
        from (
          select * from public.order_events where order_id = o.id order by created_at nulls last, id limit 100
        ) e
      ), '[]'::jsonb)),
      'paymentsCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'id', p.id, 'amount', p.amount::text, 'currency', p.currency, 'reference', p.reference,
          'evidencePath', p.evidence_path, 'paymentMethodId', p.payment_method_id, 'createdAt', p.created_at
        )) order by p.created_at nulls last, p.id)
        from (select * from public.payments where order_id = o.id order by created_at nulls last, id limit 100) p
      ), '[]'::jsonb)),
      'refundsCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'id', r.id, 'amount', r.amount::text, 'currency', r.currency, 'reason', r.reason,
          'createdAt', r.created_at
        )) order by r.created_at nulls last, r.id)
        from (select * from public.refunds where order_id = o.id order by created_at nulls last, id limit 100) r
      ), '[]'::jsonb))
    )))
    from public.orders o
    where o.id = p_order_id
  ), '[]'::jsonb)));
$$;

create or replace function public.admin_checkout_settings(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'storesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'orderPrefix', s.order_prefix, 'whatsappPhone', s.whatsapp_phone, 'baseCurrency', s.base_currency
      )))
      from public.stores s where s.id = p_store_id
    ), '[]'::jsonb)),
    'shippingZonesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', z.id, 'name', z.name, 'description', z.description, 'isActive', z.is_active, 'sortOrder', z.sort_order
      )) order by z.sort_order nulls last, z.name nulls last, z.id)
      from (
        select * from public.shipping_zones where store_id = p_store_id
        order by sort_order nulls last, name nulls last, id limit 100
      ) z
    ), '[]'::jsonb)),
    'shippingMethodsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', m.id, 'zoneId', m.zone_id, 'type', m.type, 'name', m.name, 'price', m.price::text,
        'freeOverSubtotal', m.free_over_subtotal::text, 'warehouseId', m.warehouse_id, 'minDays', m.min_days,
        'maxDays', m.max_days, 'isActive', m.is_active, 'sortOrder', m.sort_order
      )) order by m.sort_order nulls last, m.name nulls last, m.id)
      from (
        select * from public.shipping_methods where store_id = p_store_id
        order by sort_order nulls last, name nulls last, id limit 100
      ) m
    ), '[]'::jsonb)),
    'paymentMethodsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', p.id, 'name', p.name, 'currencies', p.currencies, 'instructions', p.instructions,
        'isActive', p.is_active, 'sortOrder', p.sort_order
      )) order by p.sort_order nulls last, p.name nulls last, p.id)
      from (
        select * from public.payment_methods where store_id = p_store_id
        order by sort_order nulls last, name nulls last, id limit 100
      ) p
    ), '[]'::jsonb)),
    'warehousesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', w.id, 'name', w.name, 'address', w.address, 'isPickupPoint', w.is_pickup_point, 'isActive', w.is_active
      )) order by w.id)
      from (select * from public.warehouses where store_id = p_store_id order by id limit 100) w
    ), '[]'::jsonb))
  );
$$;

create or replace function public.admin_notification_log(
  p_store_id uuid,
  p_first int,
  p_order_id uuid default null,
  p_offset int default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with matched as (
    select n.*
    from public.notification_log n
    where n.store_id = p_store_id and (p_order_id is null or n.order_id = p_order_id)
  ),
  page as (
    select * from matched order by created_at desc nulls last, id limit p_first + 1 offset p_offset
  )
  select jsonb_build_object('notificationLogCollection', jsonb_build_object(
    'totalCount', (select count(*) from matched),
    'pageInfo', jsonb_build_object(
      'hasNextPage', (select count(*) from page) > p_first,
      'endCursor', (p_offset + p_first)::text
    ),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', n.id,
        'orderId', n.order_id,
        'audience', n.audience,
        'event', n.event,
        'recipient', n.recipient,
        'message', n.message,
        'status', n.status,
        'attempts', n.attempts,
        'error', n.error,
        'sentAt', n.sent_at,
        'createdAt', n.created_at,
        'orders', (select jsonb_build_object('number', o.number) from public.orders o where o.id = n.order_id)
      )) order by n.created_at desc nulls last, n.id)
      from (select * from page order by created_at desc nulls last, id limit p_first) n
    ), '[]'::jsonb)
  ));
$$;

revoke execute on function public.admin_orders(uuid, int, int, public.order_status[], int, text, text) from public, anon;
revoke execute on function public.admin_order(uuid) from public, anon;
revoke execute on function public.admin_checkout_settings(uuid) from public, anon;
revoke execute on function public.admin_notification_log(uuid, int, uuid, int) from public, anon;
grant execute on function public.admin_orders(uuid, int, int, public.order_status[], int, text, text) to authenticated;
grant execute on function public.admin_order(uuid) to authenticated;
grant execute on function public.admin_checkout_settings(uuid) to authenticated;
grant execute on function public.admin_notification_log(uuid, int, uuid, int) to authenticated;
