-- Phase 6.2: multi-warehouse engine. Without multi_warehouse a store sells and reserves only from its default
-- warehouse (D13: until now the checkout took from every active warehouse); with it, the pickup point or the
-- warehouses that serve the zone go first, then the others (D11, D12). Transfers between warehouses (D14) and the
-- elTOQUE reference rate cache (Roberto, decision 9).

-- ---------------------------------------------------------------------------
-- Available stock counts only the warehouses the store can sell from
-- ---------------------------------------------------------------------------

create or replace function private.refresh_variant_stock(p_variant_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.product_variants v
  set stock_available = coalesce((
    select sum(s.quantity - s.quantity_allocated)
    from public.stocks s
    join public.warehouses w on w.id = s.warehouse_id
    where s.variant_id = v.id and w.is_active
      and (w.is_default or private.store_has_module(v.store_id, 'multi_warehouse'))
  ), 0)
  where v.id = p_variant_id;
$$;

-- Whole store at once (the module was turned on or off).
create function private.refresh_store_stock(p_store_id uuid)
returns void
language sql
set search_path = ''
as $$
  with totals as (
    select v.id,
      coalesce(sum(s.quantity - s.quantity_allocated) filter (
        where w.is_active and (w.is_default or private.store_has_module(p_store_id, 'multi_warehouse'))), 0) as available
    from public.product_variants v
    left join public.stocks s on s.variant_id = v.id
    left join public.warehouses w on w.id = s.warehouse_id
    where v.store_id = p_store_id
    group by v.id
  )
  update public.product_variants v set stock_available = t.available
  from totals t
  where v.id = t.id and v.stock_available is distinct from t.available;
$$;

create function private.multi_warehouse_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.module_code = 'multi_warehouse' then
      perform private.refresh_store_stock(old.store_id);
    end if;
  elsif new.module_code = 'multi_warehouse' then
    perform private.refresh_store_stock(new.store_id);
  end if;
  return null;
end;
$$;

create trigger store_modules_multi_warehouse_trigger
after insert or update or delete on public.store_modules
for each row execute function private.multi_warehouse_changed();

select private.refresh_store_stock(id) from public.stores;

-- ---------------------------------------------------------------------------
-- Where an order takes its stock from: pickup point, then the zone's warehouses by priority, then the others
-- (default first). Only the default warehouse without multi_warehouse.
-- ---------------------------------------------------------------------------

create function private.order_warehouses(p_store_id uuid, p_zone_id uuid, p_pickup_id uuid)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select case
    when not private.store_has_module(p_store_id, 'multi_warehouse') then
      array(select w.id from public.warehouses w where w.store_id = p_store_id and w.is_default)
    else array(
      select w.id
      from public.warehouses w
      left join public.warehouse_shipping_zones z on z.warehouse_id = w.id and z.zone_id = p_zone_id
      where w.store_id = p_store_id and w.is_active
      order by (w.id = p_pickup_id) is true desc, z.zone_id is null, z.priority, w.is_default desc, w.id)
  end;
$$;

-- Checkout: same as 20261030100300 except where the stock comes from (D12, D13).

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
  v_currency text;
  v_rate numeric;
  v_rounding numeric;
  v_warehouse uuid;
  -- Warehouses the order may take stock from, in order of preference (D12, D13).
  v_ranks uuid[];
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
  v_code text := nullif(btrim(coalesce(p_input ->> 'voucher_code', '')), '');
  v_manual jsonb := p_input -> 'manual_discount';
  v_variant_ids uuid[];
  v_before jsonb;
  v_line record;
  v_price record;
  v_stock public.stocks;
  v_available int;
  v_left int;
  v_take int;
  v_subtotal numeric := 0;
  v_priced jsonb := '[]';
  v_voucher record;
  v_voucher_code text;
  v_manual_amount numeric := 0;
  v_discount numeric := 0;
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
  if v_manual is not null and v_channel <> 'admin' then
    raise exception 'Descuento no permitido' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  if v_manual is not null and (
    coalesce(v_manual ->> 'reward', '') not in ('percent', 'fixed')
    or coalesce((v_manual ->> 'value')::numeric, 0) <= 0
    or (v_manual ->> 'reward' = 'percent' and (v_manual ->> 'value')::numeric > 100)
  ) then
    raise exception 'El descuento manual no es válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  select c.currency, c.rate, c.rounding into v_currency, v_rate, v_rounding
  from private.sale_currency(p_store_id, p_input ->> 'currency') c;

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

  -- Pickup point or warehouses of the zone first, then the others; only the default one without multi_warehouse.
  v_ranks := private.order_warehouses(p_store_id, v_zone.id, v_pickup.id);
  v_warehouse := v_ranks[1];

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
    customer_note, created_by, notify_customer)
  values (p_store_id, v_number, v_key, v_customer_id, v_channel, v_currency, v_rate, 0, v_name, v_phone,
    v_shipping_type, v_payment.id, v_payment_snapshot, v_warehouse,
    nullif(btrim(coalesce(p_input ->> 'note', '')), ''), private.try_uuid(p_input ->> 'created_by'),
    coalesce((p_input ->> 'notify_customer')::boolean, true))
  returning * into v_order;

  for v_line in
    select v.*, p.name as product_name, p.status as product_status, p.primary_media_url,
      p.category_id, p.brand_id, x.quantity as requested
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
      -- Lock the rows the order may use in a fixed order (warehouse id: same in every checkout, no deadlocks),
      -- then reserve following the preference; an order can take from several warehouses (Roberto, D12).
      v_available := 0;
      for v_stock in
        select s.* from public.stocks s
        where s.variant_id = v_line.id and s.warehouse_id = any (v_ranks)
        order by s.warehouse_id
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
        select s.* from public.stocks s
        join unnest(v_ranks) with ordinality r(warehouse_id, rank) on r.warehouse_id = s.warehouse_id
        where s.variant_id = v_line.id
        order by r.rank
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

    select * into v_price from private.variant_sale_price(p_store_id, v_line.id, v_currency, v_rate, v_rounding, now());
    v_sort := v_sort + 1;

    insert into public.order_lines (store_id, order_id, variant_id, product_id, product_name, variant_name, sku,
      attributes, image_url, quantity, unit_price, compare_at_price, line_total, sort_order,
      unit_list_price, discount_amount, promotion_id, promotion_name)
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
      v_line.requested, v_price.unit_price, v_price.compare_at_price, v_price.unit_price * v_line.requested, v_sort,
      v_price.list_price, (v_price.list_price - v_price.unit_price) * v_line.requested, v_price.promotion_id,
      v_price.promotion_name)
    returning id into v_line_id;

    insert into public.order_line_costs (store_id, order_line_id, unit_cost, cost_currency)
    select p_store_id, v_line_id, c.cost_price, c.cost_currency
    from public.variant_costs c where c.variant_id = v_line.id;

    v_subtotal := v_subtotal + v_price.unit_price * v_line.requested;
    v_priced := v_priced || jsonb_build_object('variant_id', v_line.id, 'product_id', v_line.product_id,
      'category_id', v_line.category_id, 'brand_id', v_line.brand_id, 'quantity', v_line.requested,
      'line_total', v_price.unit_price * v_line.requested);
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

  -- Promotions: one row per promotion with the saving of its lines (already in unit_price).
  insert into public.order_discounts (store_id, order_id, kind, source_id, name, reward, value, amount, currency)
  select p_store_id, v_order.id, 'promotion', l.promotion_id, min(l.promotion_name), pr.reward, pr.value,
    sum(l.discount_amount), v_currency
  from public.order_lines l join public.promotions pr on pr.id = l.promotion_id
  where l.order_id = v_order.id and l.promotion_id is not null
  group by l.promotion_id, pr.reward, pr.value;

  -- Voucher: locked, its limits checked and its use counted now (D6); released if the order is cancelled.
  if v_code is not null then
    select * into v_voucher from private.voucher_evaluate(p_store_id, v_code, v_priced, v_subtotal, v_currency, v_rate,
      v_customer_id, v_phone, v_shipping_total, true);
    if v_voucher.error is not null then
      raise exception '%', v_voucher.error using errcode = 'P0001', hint = 'voucher_invalid';
    end if;
    v_discount := coalesce(v_voucher.amount, 0);
    v_voucher_code := v_voucher.code;
    insert into public.order_discounts (store_id, order_id, kind, source_id, code, name, reward, value, amount, currency,
      voucher_scope)
    values (p_store_id, v_order.id, 'voucher', v_voucher.voucher_id, v_voucher.code, v_voucher.name, v_voucher.reward,
      v_voucher.value, v_discount, v_currency, v_voucher.scope);
    insert into public.voucher_usages (store_id, voucher_id, order_id, customer_id, phone, amount, currency)
    values (p_store_id, v_voucher.voucher_id, v_order.id, v_customer_id, v_phone, v_discount, v_currency);
    update public.vouchers set used_count = used_count + 1 where id = v_voucher.voucher_id;
  end if;

  -- Manual discount of an admin order (D10), on what is left of the products after the voucher.
  if v_manual is not null then
    v_manual_amount := case v_manual ->> 'reward'
      when 'percent' then round(greatest(v_subtotal - v_discount, 0) * (v_manual ->> 'value')::numeric / 100, 2)
      else least(round((v_manual ->> 'value')::numeric, 2), greatest(v_subtotal - v_discount, 0))
    end;
    insert into public.order_discounts (store_id, order_id, kind, name, reward, value, amount, currency, reason)
    values (p_store_id, v_order.id, 'manual', 'Descuento manual', (v_manual ->> 'reward')::public.discount_reward,
      (v_manual ->> 'value')::numeric, v_manual_amount, v_currency,
      nullif(btrim(coalesce(v_manual ->> 'reason', '')), ''));
    v_discount := v_discount + v_manual_amount;
  end if;

  update public.orders
  set subtotal = v_subtotal,
      shipping_total = v_shipping_total,
      discount_total = v_discount,
      voucher_code = v_voucher_code,
      total = case when v_shipping_total is not null then greatest(v_subtotal + v_shipping_total - v_discount, 0) end,
      shipping_zone_id = v_zone.id,
      shipping_method_id = v_method.id,
      shipping_snapshot = v_shipping_snapshot,
      -- The warehouse that gives the most units (ties: the preferred one); the first preferred if nothing reserved.
      warehouse_id = coalesce((
        select r.warehouse_id from public.inventory_reservations r
        where r.order_id = v_order.id
        group by r.warehouse_id
        order by sum(r.quantity) desc, array_position(v_ranks, r.warehouse_id)
        limit 1
      ), v_warehouse)
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
-- Zones served by each warehouse (D11): the zone's warehouses in priority order. Empty = every warehouse.
-- ---------------------------------------------------------------------------

create function private.require_multi_warehouse(p_store_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.store_has_module(p_store_id, 'multi_warehouse') then
    raise exception 'Esta función no está incluida en el plan de la tienda'
      using errcode = 'P0001', hint = 'module_not_enabled';
  end if;
end;
$$;

create function public.set_zone_warehouses(p_store_id uuid, p_zone_id uuid, p_warehouse_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_warehouse_ids, '{}');
begin
  perform private.require_multi_warehouse(p_store_id);
  perform 1 from public.shipping_zones where id = p_zone_id and store_id = p_store_id for update;
  if not found then
    raise exception 'La zona no existe' using errcode = 'P0001', hint = 'not_found';
  end if;
  if cardinality(v_ids) > 50
     or cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x)
     or exists (
       select 1 from unnest(v_ids) x
       where not exists (select 1 from public.warehouses w where w.id = x and w.store_id = p_store_id)
     ) then
    raise exception 'Los almacenes no son válidos' using errcode = 'P0001', hint = 'invalid_reference';
  end if;

  delete from public.warehouse_shipping_zones where zone_id = p_zone_id;
  insert into public.warehouse_shipping_zones (store_id, warehouse_id, zone_id, priority)
  select p_store_id, x.id, p_zone_id, x.n - 1
  from unnest(v_ids) with ordinality x(id, n);

  return jsonb_build_object('zone_id', p_zone_id, 'warehouse_ids', to_jsonb(v_ids));
end;
$$;

-- ---------------------------------------------------------------------------
-- Transfers (D14): immediate; reserved units do not move; two movements share one transfer id.
-- p_lines: [{"variant_id": uuid, "quantity": int}] (1-100 lines).
-- ---------------------------------------------------------------------------

create function public.transfer_stock(
  p_store_id uuid,
  p_from uuid,
  p_to uuid,
  p_lines jsonb,
  p_note text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.warehouses;
  v_to public.warehouses;
  v_transfer uuid := gen_random_uuid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_line record;
  v_free int;
  v_count int := 0;
  v_units int := 0;
begin
  perform private.require_multi_warehouse(p_store_id);
  select * into v_from from public.warehouses where id = p_from and store_id = p_store_id;
  select * into v_to from public.warehouses where id = p_to and store_id = p_store_id;
  if v_from.id is null or v_to.id is null then
    raise exception 'El almacén no existe' using errcode = 'P0001', hint = 'invalid_reference';
  end if;
  if v_from.id = v_to.id then
    raise exception 'Elige dos almacenes distintos' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  if not v_to.is_active then
    raise exception 'El almacén de destino está desactivado' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'Indica qué productos mover' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  -- Variants sorted, then the two rows by warehouse id: the same lock order as the checkout.
  for v_line in
    select x.variant_id, sum(x.quantity)::int as quantity, v.store_id, v.name, p.name as product_name
    from (
      select private.try_uuid(l ->> 'variant_id') as variant_id, (l ->> 'quantity')::int as quantity
      from jsonb_array_elements(p_lines) l
    ) x
    left join public.product_variants v on v.id = x.variant_id and v.store_id = p_store_id
    left join public.products p on p.id = v.product_id
    group by x.variant_id, v.store_id, v.name, p.name
    order by x.variant_id
  loop
    if v_line.store_id is null then
      raise exception 'Un producto no existe en esta tienda' using errcode = 'P0001', hint = 'invalid_reference';
    end if;
    if v_line.quantity is null or v_line.quantity < 1 or v_line.quantity > 99999 then
      raise exception 'Cantidad no válida' using errcode = 'P0001', hint = 'invalid_input';
    end if;

    insert into public.stocks (store_id, variant_id, warehouse_id) values (p_store_id, v_line.variant_id, p_to)
    on conflict (variant_id, warehouse_id) do nothing;
    perform 1 from public.stocks
    where variant_id = v_line.variant_id and warehouse_id in (p_from, p_to)
    order by warehouse_id
    for update;

    select coalesce(sum(quantity - quantity_allocated), 0) into v_free
    from public.stocks where variant_id = v_line.variant_id and warehouse_id = p_from;
    if v_free < v_line.quantity then
      raise exception 'Solo hay % unidades libres de % en %', greatest(v_free, 0),
        btrim(coalesce(v_line.product_name, '') || ' ' || coalesce(v_line.name, '')), v_from.name
        using errcode = 'P0001', hint = 'insufficient_stock',
        detail = jsonb_build_object('variant_id', v_line.variant_id, 'available', greatest(v_free, 0))::text;
    end if;

    update public.stocks set quantity = quantity - v_line.quantity
    where variant_id = v_line.variant_id and warehouse_id = p_from;
    update public.stocks set quantity = quantity + v_line.quantity
    where variant_id = v_line.variant_id and warehouse_id = p_to;
    insert into public.stock_movements (store_id, variant_id, warehouse_id, type, quantity, note, user_id, transfer_id)
    values
      (p_store_id, v_line.variant_id, p_from, 'transfer_out', -v_line.quantity,
        coalesce(v_note, 'Hacia ' || v_to.name), p_user_id, v_transfer),
      (p_store_id, v_line.variant_id, p_to, 'transfer_in', v_line.quantity,
        coalesce(v_note, 'Desde ' || v_from.name), p_user_id, v_transfer);
    v_count := v_count + 1;
    v_units := v_units + v_line.quantity;
  end loop;

  return jsonb_build_object('transfer_id', v_transfer, 'variants', v_count, 'units', v_units);
end;
$$;

-- ---------------------------------------------------------------------------
-- elTOQUE reference rate: one row per Havana day for the whole platform (server only).
-- ---------------------------------------------------------------------------

create function public.market_rate_get(p_source text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('rate_date', m.rate_date, 'rates', m.rates, 'fetched_at', m.fetched_at)
  from private.market_rates m
  where m.source = p_source
  order by m.rate_date desc
  limit 1;
$$;

create function public.market_rate_put(p_source text, p_rate_date date, p_rates jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.market_rates (source, rate_date, rates)
  values (p_source, p_rate_date, p_rates)
  on conflict (source, rate_date) do update set rates = excluded.rates, fetched_at = now();
$$;

revoke all on function public.set_zone_warehouses(uuid, uuid, uuid[]),
  public.transfer_stock(uuid, uuid, uuid, jsonb, text, uuid),
  public.market_rate_get(text), public.market_rate_put(text, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_zone_warehouses(uuid, uuid, uuid[]),
  public.transfer_stock(uuid, uuid, uuid, jsonb, text, uuid),
  public.market_rate_get(text), public.market_rate_put(text, date, jsonb)
  to service_role;
