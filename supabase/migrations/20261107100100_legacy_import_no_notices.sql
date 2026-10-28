-- Phase 8 fix: the history import queued real WhatsApp notices. private.order_event_notify is a deferred constraint
-- trigger on order_events: every non-internal 'created' or 'payment_recorded' event queues the store contacts and the
-- customer at commit. The first import of klauShop (2026-10-28) sent 5 store and 5 customer notices before the rest
-- were cancelled. From now on the imported events are internal (the trigger skips them) and imported orders have
-- notify_customer = false, so a later status change of a historical order does not message the customer either.

create or replace function public.import_legacy_order(p_store_id uuid, p_payload jsonb, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_legacy text := p_payload ->> 'legacy_id';
  v_existing uuid;
  v_warehouse uuid;
  v_number int;
  v_order public.orders;
  v_line jsonb;
  v_line_id uuid;
  v_sort int := 0;
  v_subtotal numeric(12, 2) := 0;
  v_shipping numeric(12, 2) := (p_payload ->> 'shipping_total')::numeric;
  v_total numeric(12, 2);
  v_paid numeric(12, 2) := 0;
  v_status public.order_status := (p_payload ->> 'status')::public.order_status;
  v_pay public.payment_status := (p_payload ->> 'payment_status')::public.payment_status;
  v_created timestamptz := coalesce((p_payload ->> 'created_at')::timestamptz, now());
  v_customer uuid := private.try_uuid(p_payload ->> 'customer_id');
begin
  if coalesce(v_legacy, '') = '' then
    raise exception 'legacy_id is required' using errcode = '22023';
  end if;
  select new_id into v_existing from private.legacy_ids
  where store_id = p_store_id and entity = 'order' and legacy_id = v_legacy;
  if found then
    return jsonb_build_object('order_id', v_existing, 'created', false,
      'number', (select number from public.orders where id = v_existing));
  end if;

  select id into v_warehouse from public.warehouses where store_id = p_store_id and is_default;
  if v_warehouse is null then
    raise exception 'The store has no default warehouse' using errcode = 'P0001';
  end if;

  select coalesce(sum((l ->> 'line_total')::numeric), 0) into v_subtotal
  from jsonb_array_elements(coalesce(p_payload -> 'lines', '[]'::jsonb)) l;
  v_total := case when v_shipping is null then null else v_subtotal + v_shipping end;
  v_paid := case when v_pay = 'paid' then coalesce(v_total, v_subtotal) else 0 end;

  -- Same numbering as the checkout (row lock on the store counter).
  insert into public.store_order_counters as c (store_id, last_number) values (p_store_id, 1001)
  on conflict (store_id) do update set last_number = c.last_number + 1
  returning last_number into v_number;

  insert into public.orders (store_id, number, customer_id, channel, status, payment_status, currency, exchange_rate,
    subtotal, shipping_total, discount_total, total, paid_total, customer_name, customer_phone, shipping_type,
    shipping_zone_id, shipping_method_id, shipping_snapshot, payment_method_id, payment_snapshot, warehouse_id,
    customer_note, created_by, confirmed_at, paid_at, shipped_at, delivered_at, cancelled_at, created_at, updated_at,
    notify_customer)
  values (p_store_id, v_number, v_customer, 'web', v_status, v_pay,
    coalesce(p_payload ->> 'currency', 'CUP')::public.currency_code, 1,
    v_subtotal, v_shipping, 0, v_total, v_paid,
    p_payload ->> 'customer_name', p_payload ->> 'customer_phone',
    coalesce(p_payload ->> 'shipping_type', 'to_agree')::public.shipping_type,
    private.try_uuid(p_payload ->> 'shipping_zone_id'), private.try_uuid(p_payload ->> 'shipping_method_id'),
    coalesce(p_payload -> 'shipping_snapshot', '{}'::jsonb),
    private.try_uuid(p_payload ->> 'payment_method_id'), coalesce(p_payload -> 'payment_snapshot', '{}'::jsonb),
    v_warehouse, nullif(btrim(coalesce(p_payload ->> 'customer_note', '')), ''), p_user_id,
    -- klauShop keeps no timestamps per state: the creation date is the best approximation (noted in the event).
    case when v_status <> 'pending_confirmation' then v_created end,
    case when v_pay = 'paid' then v_created end,
    case when v_status in ('shipped', 'delivered') then v_created end,
    case when v_status = 'delivered' then v_created end,
    case when v_status = 'cancelled' then v_created end,
    v_created, v_created, false)
  returning * into v_order;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload -> 'lines', '[]'::jsonb)) loop
    v_sort := v_sort + 1;
    insert into public.order_lines (store_id, order_id, variant_id, product_id, product_name, variant_name, sku,
      attributes, image_url, quantity, unit_price, compare_at_price, line_total, sort_order, unit_list_price,
      discount_amount)
    values (p_store_id, v_order.id, private.try_uuid(v_line ->> 'variant_id'), private.try_uuid(v_line ->> 'product_id'),
      v_line ->> 'product_name', coalesce(v_line ->> 'variant_name', ''), coalesce(v_line ->> 'sku', ''),
      coalesce(v_line -> 'attributes', '[]'::jsonb), nullif(v_line ->> 'image_url', ''),
      (v_line ->> 'quantity')::int, (v_line ->> 'unit_price')::numeric, (v_line ->> 'compare_at_price')::numeric,
      (v_line ->> 'line_total')::numeric, v_sort, (v_line ->> 'unit_list_price')::numeric,
      coalesce((v_line ->> 'discount_amount')::numeric, 0))
    returning id into v_line_id;
    if coalesce(v_line ->> 'legacy_id', '') <> '' then
      insert into private.legacy_ids (store_id, entity, legacy_id, new_id)
      values (p_store_id, 'order_line', v_line ->> 'legacy_id', v_line_id)
      on conflict do nothing;
    end if;
  end loop;

  if v_paid > 0 then
    insert into public.payments (store_id, order_id, payment_method_id, amount, currency, reference, recorded_by, created_at)
    values (p_store_id, v_order.id, v_order.payment_method_id, v_paid, v_order.currency,
      coalesce(p_payload ->> 'payment_reference', 'klauShop'), p_user_id, v_created);
    insert into public.order_events (store_id, order_id, type, is_internal, payload, user_id, created_at)
    values (p_store_id, v_order.id, 'payment_recorded', true,
      jsonb_build_object('amount', v_paid, 'currency', v_order.currency), p_user_id, v_created);
  end if;

  insert into public.order_events (store_id, order_id, type, is_internal, payload, user_id, created_at) values
    (p_store_id, v_order.id, 'created', true, jsonb_build_object('channel', 'web', 'status', v_status), p_user_id, v_created),
    (p_store_id, v_order.id, 'imported', true, jsonb_build_object('source', 'klauShop', 'legacy_id', v_legacy,
      'legacy_number', p_payload ->> 'legacy_number', 'note', 'Fechas de estado aproximadas a la fecha del pedido'),
      p_user_id, v_created);

  insert into private.legacy_ids (store_id, entity, legacy_id, new_id) values (p_store_id, 'order', v_legacy, v_order.id);

  if v_customer is not null then
    update public.customers set last_order_at = greatest(coalesce(last_order_at, v_created), v_created)
    where store_id = p_store_id and id = v_customer;
  end if;

  return jsonb_build_object('order_id', v_order.id, 'number', v_number, 'created', true);
end;
$$;
