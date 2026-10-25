-- Phase 3: transactional order functions (D9–D15, D18). execute only for service_role (called by /api/v1).
-- Every stock change locks the stocks rows in a stable order (variant_id) to avoid deadlocks between checkouts.
-- Errors are P0001 with a Spanish message and a hint the API maps to an HTTP status:
--   insufficient_stock, invalid_transition, shipping_required, store_inactive, invalid_input, not_found.

-- ---------------------------------------------------------------------------
-- Money helpers (same math as convertFromBase in @kshop/core)
-- ---------------------------------------------------------------------------

-- Base-currency amount -> target currency. p_rate = base units per 1 target unit; p_rounding rounds up to a
-- multiple (5 -> 1503 becomes 1505), without it to cents.
create function private.convert_from_base(p_amount numeric, p_rate numeric, p_rounding numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_rounding is null then round(round(p_amount * 100) / p_rate) / 100
    else ceil(round(round(p_amount * 100) / p_rate * 1000) / 1000 / round(p_rounding * 100)) * round(p_rounding * 100) / 100
  end;
$$;

-- Sale price of a variant in a currency: per-currency override, or the base price converted with the store rate.
create function private.variant_price_in(p_variant_id uuid, p_currency text, p_rate numeric, p_rounding numeric)
returns table (price numeric, compare_at_price numeric)
language sql
stable
set search_path = ''
as $$
  select
    coalesce(vp.price, private.convert_from_base(v.price, p_rate, p_rounding)),
    case
      when vp.price is not null then vp.compare_at_price
      when v.compare_at_price is not null then private.convert_from_base(v.compare_at_price, p_rate, p_rounding)
    end
  from public.product_variants v
  left join public.variant_prices vp on vp.variant_id = v.id and vp.currency = p_currency
  where v.id = p_variant_id;
$$;

-- paid_total and payment_status from payments and refunds (in the order currency).
create function private.refresh_order_payment(p_order_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_paid numeric;
  v_refunded numeric;
begin
  select coalesce(sum(amount), 0) into v_paid from public.payments where order_id = p_order_id;
  select coalesce(sum(amount), 0) into v_refunded from public.refunds where order_id = p_order_id;

  update public.orders o
  set paid_total = v_paid - v_refunded,
      payment_status = case
        when v_refunded > 0 and v_refunded >= v_paid then 'refunded'
        when v_paid - v_refunded <= 0 then 'unpaid'
        when o.total is not null and v_paid - v_refunded >= o.total then 'paid'
        else 'partially_paid'
      end::public.payment_status
  where o.id = p_order_id;
end;
$$;

-- Product ids among p_variant_ids whose public availability is the opposite of p_was_available now
-- (sold out after a checkout, back in stock after a cancel): only then the storefront cache is invalidated (D18).
create function private.availability_flips(p_variant_ids uuid[], p_before jsonb)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct v.product_id), '{}')
  from public.product_variants v
  where v.id = any (p_variant_ids)
    and v.track_inventory
    and (v.stock_available > 0) is distinct from ((p_before ->> v.id::text)::int > 0);
$$;

-- ---------------------------------------------------------------------------
-- Cart merge: the guest cart joins the customer's active cart when the customer signs in (D8)
-- ---------------------------------------------------------------------------

create function public.cart_merge(p_store_id uuid, p_guest_token uuid, p_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest public.carts;
  v_target uuid;
begin
  if not exists (select 1 from public.customers where id = p_customer_id and store_id = p_store_id) then
    raise exception 'Cliente no encontrado' using errcode = 'P0001', hint = 'not_found';
  end if;

  select * into v_guest from public.carts
  where token = p_guest_token and store_id = p_store_id and status = 'active'
  for update;

  select id into v_target from public.carts
  where store_id = p_store_id and customer_id = p_customer_id and status = 'active'
  for update;

  if v_guest.id is null or v_guest.id = v_target then
    return v_target;
  end if;

  if v_guest.customer_id is not null and v_guest.customer_id <> p_customer_id then
    -- Another customer's cart: never merge it.
    return v_target;
  end if;

  if v_target is null then
    update public.carts set customer_id = p_customer_id where id = v_guest.id;
    return v_guest.id;
  end if;

  insert into public.cart_lines (store_id, cart_id, variant_id, quantity)
  select p_store_id, v_target, l.variant_id, l.quantity
  from public.cart_lines l
  where l.cart_id = v_guest.id
  on conflict (cart_id, variant_id) do update
  set quantity = least(999, public.cart_lines.quantity + excluded.quantity);

  delete from public.carts where id = v_guest.id;
  update public.carts set updated_at = now() where id = v_target;
  return v_target;
end;
$$;

-- ---------------------------------------------------------------------------
-- Checkout (D9): order + lines with snapshot + costs + reservations + event, in one transaction
-- ---------------------------------------------------------------------------
-- p_input:
-- {
--   "idempotency_key": "…", "channel": "web" | "app" | "admin", "customer_id": uuid | null, "cart_id": uuid | null,
--   "currency": "CUP", "lines": [{"variant_id": uuid, "quantity": 2}],
--   "customer": {"name": "Ana", "phone": "+5351234567"},
--   "shipping": {"method_id": uuid, "zone_id": uuid, "recipient": "…", "address": "…", "reference": "…"},
--   "payment_method_id": uuid | null, "note": "…", "created_by": uuid | null
-- }
-- Returns {"order_id", "number", "public_token", "created", "flipped_product_ids"}.

create function public.checkout_create_order(p_store_id uuid, p_input jsonb)
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
      select * into v_stock from public.stocks
      where variant_id = v_line.id and warehouse_id = v_warehouse
      for update;
      if v_stock.quantity - v_stock.quantity_allocated < v_line.requested then
        raise exception 'Solo quedan % unidades de %', greatest(v_stock.quantity - v_stock.quantity_allocated, 0),
          btrim(v_line.product_name || ' ' || v_line.name)
          using errcode = 'P0001', hint = 'insufficient_stock',
          detail = jsonb_build_object('variant_id', v_line.id,
            'available', greatest(v_stock.quantity - v_stock.quantity_allocated, 0))::text;
      end if;
      update public.stocks set quantity_allocated = quantity_allocated + v_line.requested
      where variant_id = v_line.id and warehouse_id = v_warehouse;
      insert into public.inventory_reservations (store_id, order_id, variant_id, warehouse_id, quantity)
      values (p_store_id, v_order.id, v_line.id, v_warehouse, v_line.requested);
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

-- ---------------------------------------------------------------------------
-- Status changes (D11). Cancelling goes through order_cancel.
-- ---------------------------------------------------------------------------

create function private.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from, p_to) in (
    ('pending_confirmation', 'pending_payment'), ('pending_confirmation', 'paid'),
    ('pending_payment', 'paid'),
    ('paid', 'processing'), ('paid', 'shipped'), ('paid', 'delivered'),
    ('processing', 'shipped'), ('processing', 'delivered'),
    ('shipped', 'delivered')
  );
$$;

create function public.order_transition(p_store_id uuid, p_order_id uuid, p_to public.order_status, p_user_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_res record;
  v_remaining numeric;
begin
  select * into v_order from public.orders where id = p_order_id and store_id = p_store_id for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0001', hint = 'not_found';
  end if;
  if not private.order_transition_allowed(v_order.status, p_to) then
    raise exception 'No se puede pasar el pedido de % a %', v_order.status, p_to
      using errcode = 'P0001', hint = 'invalid_transition';
  end if;
  if p_to in ('pending_payment', 'paid') and v_order.shipping_total is null then
    raise exception 'Fija el costo de envío antes de confirmar o marcar pagado'
      using errcode = 'P0001', hint = 'shipping_required';
  end if;

  if p_to = 'paid' then
    -- Consume the reservations: the units leave the warehouse.
    for v_res in
      select r.id, r.variant_id, r.warehouse_id, r.quantity
      from public.inventory_reservations r
      where r.order_id = v_order.id and r.status = 'active'
      order by r.variant_id
    loop
      perform 1 from public.stocks
      where variant_id = v_res.variant_id and warehouse_id = v_res.warehouse_id for update;
      update public.stocks
      set quantity = quantity - v_res.quantity, quantity_allocated = quantity_allocated - v_res.quantity
      where variant_id = v_res.variant_id and warehouse_id = v_res.warehouse_id;
      insert into public.stock_movements (store_id, variant_id, warehouse_id, type, quantity, order_id, user_id, note)
      values (p_store_id, v_res.variant_id, v_res.warehouse_id, 'sale', -v_res.quantity, v_order.id, p_user_id,
        'Pedido ' || v_order.number);
      update public.inventory_reservations set status = 'consumed' where id = v_res.id;
    end loop;

    -- "Mark paid" records the outstanding amount when the payments do not cover the total.
    v_remaining := v_order.total - v_order.paid_total;
    if v_remaining > 0 then
      insert into public.payments (store_id, order_id, payment_method_id, amount, currency, reference, recorded_by)
      values (p_store_id, v_order.id, v_order.payment_method_id, v_remaining, v_order.currency,
        'Marcado como pagado', p_user_id);
      insert into public.order_events (store_id, order_id, type, payload, user_id)
      values (p_store_id, v_order.id, 'payment_recorded',
        jsonb_build_object('amount', v_remaining, 'currency', v_order.currency), p_user_id);
    end if;
    perform private.refresh_order_payment(v_order.id);
  end if;

  update public.orders
  set status = p_to,
      confirmed_at = case when p_to in ('pending_payment', 'paid') then coalesce(confirmed_at, now()) else confirmed_at end,
      paid_at = case when p_to = 'paid' then now() else paid_at end,
      shipped_at = case when p_to = 'shipped' then now() else shipped_at end,
      delivered_at = case when p_to = 'delivered' then now() else delivered_at end
  where id = v_order.id
  returning * into v_order;

  insert into public.order_events (store_id, order_id, type, payload, user_id)
  values (p_store_id, v_order.id, 'status_changed',
    jsonb_build_object('to', p_to), p_user_id);

  return v_order;
end;
$$;

-- Sets the shipping cost of a "to agree" order (or corrects it) before it is shipped.
create function public.order_set_shipping(p_store_id uuid, p_order_id uuid, p_amount numeric, p_user_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'El costo de envío no es válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  select * into v_order from public.orders where id = p_order_id and store_id = p_store_id for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_order.status in ('shipped', 'delivered', 'cancelled') then
    raise exception 'El envío ya no se puede cambiar' using errcode = 'P0001', hint = 'invalid_transition';
  end if;

  update public.orders
  set shipping_total = round(p_amount, 2),
      total = subtotal + round(p_amount, 2) - discount_total
  where id = v_order.id;
  perform private.refresh_order_payment(v_order.id);

  insert into public.order_events (store_id, order_id, type, payload, user_id)
  values (p_store_id, v_order.id, 'shipping_set', jsonb_build_object('amount', round(p_amount, 2)), p_user_id);

  select * into v_order from public.orders where id = p_order_id;
  return v_order;
end;
$$;

-- Records a manual payment (D12) in the order currency.
create function public.order_record_payment(p_store_id uuid, p_order_id uuid, p_input jsonb, p_user_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_payment public.payments;
  v_amount numeric := round((p_input ->> 'amount')::numeric, 2);
  v_method uuid := private.try_uuid(p_input ->> 'payment_method_id');
begin
  select * into v_order from public.orders where id = p_order_id and store_id = p_store_id for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'El pedido está cancelado' using errcode = 'P0001', hint = 'invalid_transition';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'El monto no es válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  if v_method is not null and not exists (
    select 1 from public.payment_methods where id = v_method and store_id = p_store_id
  ) then
    raise exception 'El método de pago no existe' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  insert into public.payments (store_id, order_id, payment_method_id, amount, currency, reference, evidence_path,
    recorded_by)
  values (p_store_id, v_order.id, v_method, v_amount, v_order.currency,
    nullif(btrim(coalesce(p_input ->> 'reference', '')), ''), nullif(p_input ->> 'evidence_path', ''), p_user_id)
  returning * into v_payment;
  perform private.refresh_order_payment(v_order.id);

  insert into public.order_events (store_id, order_id, type, payload, user_id)
  values (p_store_id, v_order.id, 'payment_recorded',
    jsonb_build_object('amount', v_amount, 'currency', v_order.currency, 'payment_id', v_payment.id), p_user_id);

  return v_payment;
end;
$$;

-- Cancels an order before it ships: releases the reservation, or puts the units back if it was paid,
-- and records the refund of what was paid. Returns {"order": …, "flipped_product_ids": […]}.
create function public.order_cancel(p_store_id uuid, p_order_id uuid, p_reason text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_res record;
  v_variant_ids uuid[];
  v_before jsonb;
begin
  select * into v_order from public.orders where id = p_order_id and store_id = p_store_id for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_order.status in ('shipped', 'delivered', 'cancelled') then
    raise exception 'Un pedido % no se puede cancelar', v_order.status using errcode = 'P0001', hint = 'invalid_transition';
  end if;

  select coalesce(array_agg(distinct variant_id), '{}') into v_variant_ids
  from public.inventory_reservations where order_id = v_order.id;
  select coalesce(jsonb_object_agg(v.id, v.stock_available), '{}') into v_before
  from public.product_variants v where v.id = any (v_variant_ids);

  for v_res in
    select r.id, r.variant_id, r.warehouse_id, r.quantity, r.status
    from public.inventory_reservations r
    where r.order_id = v_order.id and r.status in ('active', 'consumed')
    order by r.variant_id
  loop
    perform 1 from public.stocks
    where variant_id = v_res.variant_id and warehouse_id = v_res.warehouse_id for update;
    if v_res.status = 'active' then
      update public.stocks set quantity_allocated = quantity_allocated - v_res.quantity
      where variant_id = v_res.variant_id and warehouse_id = v_res.warehouse_id;
    else
      update public.stocks set quantity = quantity + v_res.quantity
      where variant_id = v_res.variant_id and warehouse_id = v_res.warehouse_id;
      insert into public.stock_movements (store_id, variant_id, warehouse_id, type, quantity, order_id, user_id, note)
      values (p_store_id, v_res.variant_id, v_res.warehouse_id, 'cancel', v_res.quantity, v_order.id, p_user_id,
        'Pedido ' || v_order.number || ' cancelado');
    end if;
    update public.inventory_reservations set status = 'released' where id = v_res.id;
  end loop;

  if v_order.paid_total > 0 then
    insert into public.refunds (store_id, order_id, amount, currency, reason, recorded_by)
    values (p_store_id, v_order.id, v_order.paid_total, v_order.currency, nullif(btrim(coalesce(p_reason, '')), ''),
      p_user_id);
    insert into public.order_events (store_id, order_id, type, payload, user_id)
    values (p_store_id, v_order.id, 'refund_recorded',
      jsonb_build_object('amount', v_order.paid_total, 'currency', v_order.currency), p_user_id);
  end if;

  update public.orders
  set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = v_order.id;
  perform private.refresh_order_payment(v_order.id);

  insert into public.order_events (store_id, order_id, type, payload, user_id)
  values (p_store_id, v_order.id, 'status_changed',
    jsonb_build_object('to', 'cancelled', 'reason', nullif(btrim(coalesce(p_reason, '')), '')), p_user_id);

  select * into v_order from public.orders where id = p_order_id;
  return jsonb_build_object('order', to_jsonb(v_order),
    'flipped_product_ids', to_jsonb(private.availability_flips(v_variant_ids, v_before)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: helpers internal, write functions service_role only (hidden from pg_graphql for other roles)
-- ---------------------------------------------------------------------------

revoke all on function private.convert_from_base(numeric, numeric, numeric),
  private.variant_price_in(uuid, text, numeric, numeric), private.refresh_order_payment(uuid),
  private.availability_flips(uuid[], jsonb), private.order_transition_allowed(public.order_status, public.order_status)
  from public;
grant execute on function private.convert_from_base(numeric, numeric, numeric),
  private.variant_price_in(uuid, text, numeric, numeric), private.refresh_order_payment(uuid),
  private.availability_flips(uuid[], jsonb), private.order_transition_allowed(public.order_status, public.order_status)
  to service_role;

revoke all on function public.cart_merge(uuid, uuid, uuid), public.checkout_create_order(uuid, jsonb),
  public.order_transition(uuid, uuid, public.order_status, uuid), public.order_set_shipping(uuid, uuid, numeric, uuid),
  public.order_record_payment(uuid, uuid, jsonb, uuid), public.order_cancel(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.cart_merge(uuid, uuid, uuid), public.checkout_create_order(uuid, jsonb),
  public.order_transition(uuid, uuid, public.order_status, uuid), public.order_set_shipping(uuid, uuid, numeric, uuid),
  public.order_record_payment(uuid, uuid, jsonb, uuid), public.order_cancel(uuid, uuid, text, uuid)
  to service_role;
