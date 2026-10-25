-- Phase 3: checkout reserves across active warehouses (default first, then the others) so it agrees with
-- product_variants.stock_available, which sums every active warehouse (multi_warehouse stores, found in QA).
-- Only the stock block of checkout_create_order changes; paying and cancelling already walk the reservations
-- warehouse by warehouse.

create or replace function public.checkout_create_order(p_store_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store public.stores;
  v_channel public.order_channel := coalesce(p_input ->> 'channel', 'web')::public.order_channel;
  v_key text := nullif(p_input ->> 'idempotency_key', '');
  v_existing public.orders;
  v_currency text := coalesce(nullif(p_input ->> 'currency', ''), '');
  v_rate numeric;
  v_rounding numeric;
  v_is_base boolean;
  v_warehouse uuid;
  v_shipping jsonb := coalesce(p_input -> 'shipping', '{}');
  v_method public.shipping_methods;
  v_zone public.shipping_zones;
  v_pickup public.warehouses;
  v_shipping_type public.shipping_type;
  v_shipping_total numeric;
  v_shipping_snapshot jsonb := '{}';
  v_payment public.payment_methods;
  v_payment_snapshot jsonb := '{}';
  v_customer_id uuid := private.try_uuid(p_input ->> 'customer_id');
  v_name text := btrim(coalesce(p_input -> 'customer' ->> 'name', ''));
  v_phone text := btrim(coalesce(p_input -> 'customer' ->> 'phone', ''));
  v_variant_ids uuid[];
  v_before jsonb;
  v_line record;
  v_price record;
  v_stock public.stocks;
  v_available int;
  v_left int;
  v_take int;
  v_subtotal numeric := 0;
  v_number int;
  v_order public.orders;
  v_line_id uuid;
  v_sort int := 0;
begin
  -- Idempotency: a retry with the same key returns the same order.
  if v_key is not null then
    select * into v_existing from public.orders where store_id = p_store_id and idempotency_key = v_key;
    if found then
      return jsonb_build_object('order_id', v_existing.id, 'number', v_existing.number,
        'public_token', v_existing.public_token, 'created', false, 'flipped_product_ids', '[]'::jsonb);
    end if;
  end if;

  select * into v_store from public.stores where id = p_store_id;
  if not found or v_store.status <> 'active' then
    raise exception 'La tienda no está disponible' using errcode = 'P0001', hint = 'store_inactive';
  end if;

  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'Escribe tu nombre' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'El teléfono no es válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  if v_customer_id is not null and not exists (
    select 1 from public.customers where id = v_customer_id and store_id = p_store_id and not is_blocked
  ) then
    raise exception 'Cliente no válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  -- Currency: a sale currency of the store; other than the base needs multi_currency.
  if v_currency = '' then
    v_currency := v_store.base_currency;
  end if;
  select c.rate_to_base, c.rounding, c.is_base into v_rate, v_rounding, v_is_base
  from public.store_currencies c
  where c.store_id = p_store_id and c.currency = v_currency and c.sells;
  if not found or (not v_is_base and not private.store_has_module(p_store_id, 'multi_currency')) then
    raise exception 'La moneda % no está disponible', v_currency using errcode = 'P0001', hint = 'invalid_input';
  end if;

  -- Lines, aggregated per variant and sorted (stable lock order).
  select coalesce(array_agg(variant_id order by variant_id), '{}') into v_variant_ids
  from (
    select private.try_uuid(l ->> 'variant_id') as variant_id
    from jsonb_array_elements(coalesce(p_input -> 'lines', '[]')) l
    group by 1
  ) x;
  if cardinality(v_variant_ids) = 0 or cardinality(v_variant_ids) > 100
     or array_position(v_variant_ids, null) is not null then
    raise exception 'El carrito está vacío o no es válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  select w.id into v_warehouse from public.warehouses w where w.store_id = p_store_id and w.is_default;

  select coalesce(jsonb_object_agg(v.id, v.stock_available), '{}') into v_before
  from public.product_variants v where v.id = any (v_variant_ids);

  -- Shipping (D13). Without the shipping module the delivery is "to agree".
  if private.store_has_module(p_store_id, 'shipping') and v_shipping ? 'method_id' then
    select * into v_method from public.shipping_methods
    where id = private.try_uuid(v_shipping ->> 'method_id') and store_id = p_store_id and is_active;
    if not found then
      raise exception 'El método de entrega no está disponible' using errcode = 'P0001', hint = 'invalid_input';
    end if;
    select * into v_zone from public.shipping_zones
    where id = coalesce(v_method.zone_id, private.try_uuid(v_shipping ->> 'zone_id')) and store_id = p_store_id;
    if v_method.zone_id is not null and not coalesce(v_zone.is_active, false) then
      raise exception 'La zona de entrega no está disponible' using errcode = 'P0001', hint = 'invalid_input';
    end if;
    if v_method.zone_id is not null and private.try_uuid(v_shipping ->> 'zone_id') is distinct from v_method.zone_id then
      raise exception 'El método de entrega no corresponde a la zona' using errcode = 'P0001', hint = 'invalid_input';
    end if;
    if v_method.type = 'delivery' and btrim(coalesce(v_shipping ->> 'address', '')) = '' then
      raise exception 'Escribe la dirección de entrega' using errcode = 'P0001', hint = 'invalid_input';
    end if;
    if v_method.type = 'pickup' then
      select * into v_pickup from public.warehouses where id = v_method.warehouse_id;
    end if;
    v_shipping_type := v_method.type;
  elsif private.store_has_module(p_store_id, 'shipping') and exists (
    select 1 from public.shipping_methods where store_id = p_store_id and is_active
  ) then
    raise exception 'Elige cómo quieres recibir el pedido' using errcode = 'P0001', hint = 'invalid_input';
  else
    v_shipping_type := 'to_agree';
  end if;

  -- Payment method (optional; must accept the currency).
  if private.try_uuid(p_input ->> 'payment_method_id') is not null then
    select * into v_payment from public.payment_methods
    where id = private.try_uuid(p_input ->> 'payment_method_id') and store_id = p_store_id and is_active
      and (cardinality(currencies) = 0 or v_currency = any (currencies::text[]));
    if not found then
      raise exception 'El método de pago no está disponible' using errcode = 'P0001', hint = 'invalid_input';
    end if;
    v_payment_snapshot := jsonb_build_object('name', v_payment.name, 'instructions', v_payment.instructions);
  end if;

  -- Order number (row lock on the store counter serializes numbering, not checkouts of other stores).
  insert into public.store_order_counters as c (store_id, last_number) values (p_store_id, 1001)
  on conflict (store_id) do update set last_number = c.last_number + 1
  returning last_number into v_number;

  insert into public.orders (store_id, number, idempotency_key, customer_id, channel, currency, exchange_rate,
    subtotal, customer_name, customer_phone, shipping_type, payment_method_id, payment_snapshot, warehouse_id,
    customer_note, created_by)
  values (p_store_id, v_number, v_key, v_customer_id, v_channel, v_currency, v_rate, 0, v_name, v_phone,
    v_shipping_type, v_payment.id, v_payment_snapshot, v_warehouse,
    nullif(btrim(coalesce(p_input ->> 'note', '')), ''), private.try_uuid(p_input ->> 'created_by'))
  returning * into v_order;

  for v_line in
    select v.*, p.name as product_name, p.status as product_status, p.primary_media_url,
      x.quantity as requested
    from (
      select private.try_uuid(l ->> 'variant_id') as variant_id, sum((l ->> 'quantity')::int) as quantity
      from jsonb_array_elements(p_input -> 'lines') l
      group by 1
    ) x
    left join public.product_variants v on v.id = x.variant_id and v.store_id = p_store_id
    left join public.products p on p.id = v.product_id
    order by x.variant_id
  loop
    if v_line.id is null
       or (v_channel <> 'admin' and v_line.product_status is distinct from 'published')
       or v_line.product_status = 'archived' then
      raise exception 'Un producto del carrito ya no está disponible' using errcode = 'P0001', hint = 'insufficient_stock',
        detail = jsonb_build_object('variant_id', v_line.id, 'available', 0)::text;
    end if;
    if v_line.requested is null or v_line.requested < 1 or v_line.requested > 999 then
      raise exception 'Cantidad no válida' using errcode = 'P0001', hint = 'invalid_input';
    end if;

    if v_line.track_inventory then
      insert into public.stocks (store_id, variant_id, warehouse_id) values (p_store_id, v_line.id, v_warehouse)
      on conflict (variant_id, warehouse_id) do nothing;
      -- Lock every active warehouse row of the variant (default first, then by id: same order in every
      -- checkout) and reserve from the default warehouse first, then the others (multi_warehouse).
      v_available := 0;
      for v_stock in
        select s.* from public.stocks s join public.warehouses w on w.id = s.warehouse_id
        where s.variant_id = v_line.id and w.is_active
        order by w.is_default desc, s.warehouse_id
        for update of s
      loop
        v_available := v_available + v_stock.quantity - v_stock.quantity_allocated;
      end loop;
      if v_available < v_line.requested then
        raise exception 'Solo quedan % unidades de %', greatest(v_available, 0),
          btrim(v_line.product_name || ' ' || v_line.name)
          using errcode = 'P0001', hint = 'insufficient_stock',
          detail = jsonb_build_object('variant_id', v_line.id, 'available', greatest(v_available, 0))::text;
      end if;
      v_left := v_line.requested;
      for v_stock in
        select s.* from public.stocks s join public.warehouses w on w.id = s.warehouse_id
        where s.variant_id = v_line.id and w.is_active
        order by w.is_default desc, s.warehouse_id
      loop
        exit when v_left = 0;
        v_take := least(v_left, v_stock.quantity - v_stock.quantity_allocated);
        continue when v_take <= 0;
        update public.stocks set quantity_allocated = quantity_allocated + v_take
        where variant_id = v_line.id and warehouse_id = v_stock.warehouse_id;
        insert into public.inventory_reservations (store_id, order_id, variant_id, warehouse_id, quantity)
        values (p_store_id, v_order.id, v_line.id, v_stock.warehouse_id, v_take);
        v_left := v_left - v_take;
      end loop;
    end if;

    select * into v_price from private.variant_price_in(v_line.id, v_currency, v_rate, v_rounding);
    v_sort := v_sort + 1;

    insert into public.order_lines (store_id, order_id, variant_id, product_id, product_name, variant_name, sku,
      attributes, image_url, quantity, unit_price, compare_at_price, line_total, sort_order)
    values (p_store_id, v_order.id, v_line.id, v_line.product_id, v_line.product_name, v_line.name, v_line.sku,
      coalesce((
        select jsonb_agg(jsonb_build_object('name', a.name, 'value', av.name) order by pta.sort_order, a.name)
        from public.variant_attribute_values vav
        join public.attributes a on a.id = vav.attribute_id
        join public.attribute_values av on av.id = vav.value_id
        left join public.product_type_attributes pta
          on pta.attribute_id = a.id and pta.product_type_id = (select product_type_id from public.products where id = v_line.product_id)
        where vav.variant_id = v_line.id
      ), '[]'),
      coalesce((
        select m.url from public.variant_media vm join public.product_media m on m.id = vm.media_id
        where vm.variant_id = v_line.id order by m.sort_order limit 1
      ), v_line.primary_media_url),
      v_line.requested, v_price.price, v_price.compare_at_price, v_price.price * v_line.requested, v_sort)
    returning id into v_line_id;

    insert into public.order_line_costs (store_id, order_line_id, unit_cost, cost_currency)
    select p_store_id, v_line_id, c.cost_price, c.cost_currency
    from public.variant_costs c where c.variant_id = v_line.id;

    v_subtotal := v_subtotal + v_price.price * v_line.requested;
  end loop;

  -- Shipping cost in the order currency; "to agree" stays null until the staff sets it.
  if v_shipping_type in ('delivery', 'pickup') then
    v_shipping_total := case
      when v_method.free_over_subtotal is not null and round(v_subtotal * v_rate, 2) >= v_method.free_over_subtotal then 0
      else private.convert_from_base(v_method.price, v_rate, v_rounding)
    end;
  end if;

  if v_method.id is not null then
    v_shipping_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'type', v_method.type,
      'method', v_method.name,
      'zone', v_zone.name,
      'recipient', nullif(btrim(coalesce(v_shipping ->> 'recipient', '')), ''),
      'address', nullif(btrim(coalesce(v_shipping ->> 'address', '')), ''),
      'reference', nullif(btrim(coalesce(v_shipping ->> 'reference', '')), ''),
      'pickup_point', case when v_pickup.id is not null
        then jsonb_build_object('name', v_pickup.name, 'address', v_pickup.address) end,
      'min_days', v_method.min_days,
      'max_days', v_method.max_days
    ));
  else
    v_shipping_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'type', 'to_agree',
      'address', nullif(btrim(coalesce(v_shipping ->> 'address', '')), ''),
      'reference', nullif(btrim(coalesce(v_shipping ->> 'reference', '')), '')
    ));
  end if;

  update public.orders
  set subtotal = v_subtotal,
      shipping_total = v_shipping_total,
      total = case when v_shipping_total is not null then v_subtotal + v_shipping_total - discount_total end,
      shipping_zone_id = v_zone.id,
      shipping_method_id = v_method.id,
      shipping_snapshot = v_shipping_snapshot
  where id = v_order.id
  returning * into v_order;

  insert into public.order_events (store_id, order_id, type, payload, user_id)
  values (p_store_id, v_order.id, 'created', jsonb_build_object('channel', v_channel, 'status', v_order.status),
    private.try_uuid(p_input ->> 'created_by'));

  if private.try_uuid(p_input ->> 'cart_id') is not null then
    update public.carts set status = 'converted'
    where id = private.try_uuid(p_input ->> 'cart_id') and store_id = p_store_id and status = 'active';
  end if;
  if v_customer_id is not null then
    update public.customers set last_order_at = now() where id = v_customer_id;
  end if;

  return jsonb_build_object('order_id', v_order.id, 'number', v_order.number, 'public_token', v_order.public_token,
    'created', true, 'flipped_product_ids', to_jsonb(private.availability_flips(v_variant_ids, v_before)));
end;
$$;
