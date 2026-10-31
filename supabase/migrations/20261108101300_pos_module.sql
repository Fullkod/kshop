-- POS (PRP pos-offline, phase 2): the «pos» module and the server side of a counter sale. The sale already happened and
-- was already charged on a phone, maybe offline: the server records it and notes what does not add up, it never rejects
-- it for stock or price. Included in Base and Pro (Roberto, P1); it is a configurable section of the menu.

-- ---------------------------------------------------------------------------
-- Module
-- ---------------------------------------------------------------------------

insert into public.modules (code, name, description, depends_on, is_core, sort_order)
values ('pos', 'Caja', 'Venta de mostrador desde Kshop Admin, con o sin internet.', '{orders,catalog}', false,
  coalesce((select sort_order from public.modules where code = 'sales_today'), 0) + 1)
on conflict (code) do nothing;

insert into public.plan_modules (plan_id, module_code)
select id, 'pos' from public.plans where code in ('base', 'pro')
on conflict do nothing;

insert into public.store_modules (store_id, module_code, source)
select s.store_id, 'pos', 'plan'
from public.subscriptions s join public.plans p on p.id = s.plan_id
where p.code in ('base', 'pro')
on conflict do nothing;

alter table public.store_section_settings drop constraint store_section_settings_section_check;
alter table public.store_section_settings add constraint store_section_settings_section_check check (section in (
  'shipping', 'discounts', 'vouchers', 'whatsapp_notifications', 'excel_import', 'multi_warehouse',
  'multi_currency', 'themes', 'custom_domain', 'mobile_app', 'sales_today', 'finance', 'pos'));

-- ---------------------------------------------------------------------------
-- Orders without a phone, only at the counter (a filler number would receive real WhatsApp messages)
-- ---------------------------------------------------------------------------

alter table public.orders
  alter column customer_phone drop not null,
  add constraint orders_phone_required check (customer_phone is not null or channel = 'pos');

-- What belongs to the counter, without widening orders.
create table public.pos_sales (
  order_id uuid primary key,
  store_id uuid not null,
  device_id uuid not null,
  -- The number on the phone before it was uploaded.
  local_number text not null check (char_length(local_number) between 1 and 40),
  sold_at timestamptz not null,
  uploaded_at timestamptz not null default now(),
  cashier_id uuid references auth.users (id) on delete set null,
  -- [{type: 'stock_shortfall' | 'price_mismatch' | 'unknown_variant' | 'clock_skew', ...}]
  flags jsonb not null default '[]',
  foreign key (store_id, order_id) references public.orders (store_id, id) on delete cascade
);
create index pos_sales_store_idx on public.pos_sales (store_id, sold_at desc);
create index pos_sales_cashier_idx on public.pos_sales (cashier_id);

alter table public.pos_sales enable row level security;

create policy pos_sales_select on public.pos_sales
for select to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

revoke insert, update, delete on public.pos_sales from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Payments: the same terms for a payment on an order and for a counter sale
-- ---------------------------------------------------------------------------

-- What a payment is worth: its currency and rate, the change, and what it settles of the order. p_remaining may be
-- null (shipping to agree).
create function private.payment_terms(p_order_currency public.currency_code, p_remaining numeric, p_input jsonb)
returns table (
  amount numeric, currency public.currency_code, rate numeric, change numeric, change_currency public.currency_code,
  applied numeric
)
language plpgsql
immutable
set search_path = ''
as $$
begin
  amount := round((p_input ->> 'amount')::numeric, 2);
  if amount is null or amount <= 0 then
    raise exception 'El monto no es válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  currency := coalesce(nullif(p_input ->> 'currency', '')::public.currency_code, p_order_currency);
  rate := 1;
  if currency <> p_order_currency then
    rate := (p_input ->> 'rate')::numeric;
    if rate is null or rate <= 0 then
      raise exception 'La tasa no es válida' using errcode = 'P0001', hint = 'invalid_input';
    end if;
  end if;

  change := nullif(round((p_input ->> 'change_amount')::numeric, 2), 0);
  change_currency := nullif(p_input ->> 'change_currency', '')::public.currency_code;
  if (change is null) <> (change_currency is null) or change < 0
    or change_currency not in (p_order_currency, currency) then
    raise exception 'El vuelto no es válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  applied := case
    when change is not null and change_currency = p_order_currency then round(amount * rate, 2) - change
    else round((amount - coalesce(change, 0)) * rate, 2)
  end;
  if applied <= 0 then
    raise exception 'El vuelto no puede superar lo cobrado' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  -- A rate never lands exactly on the cent: within one cent of the balance, the payment settles it. Change in the paid
  -- currency only has its cents: one cent of it can be worth several of the order (8,50 CUP at 850).
  if currency <> p_order_currency and p_remaining > 0 and abs(applied - p_remaining) <=
    (case when change_currency = currency then greatest(0.01, round(rate * 0.01, 2)) else 0.01 end) then
    applied := p_remaining;
  end if;
  return next;
end;
$$;

revoke all on function private.payment_terms(public.currency_code, numeric, jsonb) from public, anon, authenticated;

create or replace function public.order_record_payment(p_store_id uuid, p_order_id uuid, p_input jsonb, p_user_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_payment public.payments;
  v_method uuid := private.try_uuid(p_input ->> 'payment_method_id');
  v_terms record;
begin
  select * into v_order from public.orders where id = p_order_id and store_id = p_store_id for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'El pedido está cancelado' using errcode = 'P0001', hint = 'invalid_transition';
  end if;
  if v_method is not null and not exists (
    select 1 from public.payment_methods where id = v_method and store_id = p_store_id
  ) then
    raise exception 'El método de pago no existe' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  select * into v_terms from private.payment_terms(v_order.currency, v_order.total - v_order.paid_total, p_input);

  insert into public.payments (store_id, order_id, payment_method_id, amount, currency, applied_amount, rate_to_order,
    change_amount, change_currency, reference, evidence_path, recorded_by)
  values (p_store_id, v_order.id, v_method, v_terms.amount, v_terms.currency, v_terms.applied, v_terms.rate,
    v_terms.change, v_terms.change_currency, nullif(btrim(coalesce(p_input ->> 'reference', '')), ''),
    nullif(p_input ->> 'evidence_path', ''), p_user_id)
  returning * into v_payment;
  perform private.refresh_order_payment(v_order.id);

  insert into public.order_events (store_id, order_id, type, payload, user_id)
  values (p_store_id, v_order.id, 'payment_recorded',
    jsonb_build_object('amount', v_terms.amount, 'currency', v_terms.currency, 'applied', v_terms.applied,
      'payment_id', v_payment.id),
    p_user_id);

  return v_payment;
end;
$$;

create or replace function public.order_cancel(p_store_id uuid, p_order_id uuid, p_reason text, p_user_id uuid)
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
  v_usage public.voucher_usages;
  v_cash record;
  v_applied numeric;
begin
  select * into v_order from public.orders where id = p_order_id and store_id = p_store_id for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0001', hint = 'not_found';
  end if;
  -- A counter sale is born delivered, and it is the only way to undo one.
  if v_order.status in ('shipped', 'delivered', 'cancelled')
     and not (v_order.channel = 'pos' and v_order.status = 'delivered') then
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

  select * into v_usage from public.voucher_usages where order_id = v_order.id and released_at is null;
  if found then
    update public.vouchers set used_count = greatest(used_count - 1, 0) where id = v_usage.voucher_id;
    update public.voucher_usages set released_at = now() where id = v_usage.id;
  end if;

  if v_order.paid_total > 0 then
    -- What goes back is what entered the till, per currency. The balance moves once: the first refund carries it.
    -- Change handed out in a currency that nothing else paid comes back to the till as a payment that applies nothing.
    v_applied := v_order.paid_total;
    for v_cash in
      select x.currency, sum(x.amount) as net
      from (
        select p.currency, p.amount from public.payments p where p.order_id = v_order.id
        union all
        select p.change_currency, -p.change_amount from public.payments p
        where p.order_id = v_order.id and p.change_amount is not null
        union all
        select r.currency, -r.amount from public.refunds r where r.order_id = v_order.id
      ) x
      group by x.currency
      having sum(x.amount) <> 0
      order by x.currency = v_order.currency desc, x.currency
    loop
      if v_cash.net > 0 then
        insert into public.refunds (store_id, order_id, amount, applied_amount, currency, reason, recorded_by)
        values (p_store_id, v_order.id, v_cash.net, v_applied, v_cash.currency,
          nullif(btrim(coalesce(p_reason, '')), ''), p_user_id);
        v_applied := 0;
        insert into public.order_events (store_id, order_id, type, payload, user_id)
        values (p_store_id, v_order.id, 'refund_recorded',
          jsonb_build_object('amount', v_cash.net, 'currency', v_cash.currency), p_user_id);
      else
        insert into public.payments (store_id, order_id, amount, applied_amount, currency, reference, recorded_by)
        values (p_store_id, v_order.id, -v_cash.net, 0, v_cash.currency, 'Vuelto devuelto al cancelar', p_user_id);
      end if;
    end loop;
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
-- Catalog for the phone: one page per call, in the store's base currency and never with costs
-- ---------------------------------------------------------------------------

create function public.pos_catalog(p_store_id uuid, p_after uuid, p_limit int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with page as (
    select v.id, v.product_id, v.name, v.sku, v.price, v.stock_available, v.track_inventory, v.updated_at,
      p.name as product_name, p.primary_media_url, vp.promo_price, vp.promotion_name, vp.ends_at
    from public.product_variants v
    join public.products p on p.id = v.product_id and p.status <> 'archived'
    left join public.variant_promotions vp on vp.variant_id = v.id
    where v.store_id = p_store_id and (p_after is null or v.id > p_after)
    order by v.id
    limit least(greatest(coalesce(p_limit, 500), 1), 500)
  )
  select jsonb_build_object(
    'currency', (select base_currency from public.stores where id = p_store_id),
    'paymentMethods', case when p_after is null then coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.sort_order, m.name)
      from public.payment_methods m where m.store_id = p_store_id and m.is_active
    ), '[]'::jsonb) end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'variantId', id, 'productId', product_id, 'productName', product_name, 'variantName', name, 'sku', sku,
        'price', price, 'promoPrice', promo_price, 'promoName', promotion_name, 'promoEndsAt', ends_at,
        'stock', stock_available, 'trackInventory', track_inventory, 'imageUrl', primary_media_url
      ) order by id) from page
    ), '[]'::jsonb),
    'next', (select case when count(*) = least(greatest(coalesce(p_limit, 500), 1), 500)
      then (select id from page order by id desc limit 1) end from page)
  );
$$;

revoke all on function public.pos_catalog(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.pos_catalog(uuid, uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- A counter sale
-- ---------------------------------------------------------------------------

-- p_sale: {id, device_id, local_number, sold_at, voided?, note?,
--   lines: [{variant_id, quantity, unit_price, product_name, variant_name?, sku?}],
--   payments: [{amount, currency?, rate?, change_amount?, change_currency?, payment_method_id?, reference?}]}
-- Repeating a sale returns the same order. Its events are internal and it never notifies anyone: uploading a day of
-- sales must not send a day of WhatsApp messages. A voided sale keeps its trace, without stock or money.
create function public.pos_record_sale(p_store_id uuid, p_sale jsonb, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := private.try_uuid(p_sale ->> 'id');
  v_device uuid := private.try_uuid(p_sale ->> 'device_id');
  v_local text := btrim(coalesce(p_sale ->> 'local_number', ''));
  v_lines jsonb := p_sale -> 'lines';
  v_voided boolean := coalesce((p_sale ->> 'voided')::boolean, false);
  v_sold_at timestamptz := (p_sale ->> 'sold_at')::timestamptz;
  v_key text;
  v_existing public.orders;
  v_store public.stores;
  v_currency public.currency_code;
  v_rounding numeric;
  v_ranks uuid[];
  v_warehouse uuid;
  v_flags jsonb := '[]';
  v_variant_ids uuid[];
  v_before jsonb;
  v_number int;
  v_order public.orders;
  v_line record;
  v_price record;
  v_unit numeric;
  v_list numeric;
  v_matches boolean;
  v_stock public.stocks;
  v_left int;
  v_take int;
  v_line_id uuid;
  v_subtotal numeric := 0;
  v_paid numeric := 0;
  v_payment jsonb;
  v_terms record;
  v_method uuid;
begin
  if v_id is null or v_device is null or v_local = '' or v_sold_at is null
     or jsonb_typeof(v_lines) is distinct from 'array' or jsonb_array_length(v_lines) not between 1 and 100 then
    raise exception 'La venta no es válida' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  v_key := 'pos:' || v_id;
  -- The same sale arriving twice at once (a retry while the first is running) must not race for the unique key.
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select * into v_existing from public.orders where store_id = p_store_id and idempotency_key = v_key;
  if found then
    return jsonb_build_object('order_id', v_existing.id, 'number', v_existing.number, 'created', false,
      'flags', (select flags from public.pos_sales where order_id = v_existing.id), 'flipped_product_ids', '[]'::jsonb);
  end if;

  select * into v_store from public.stores where id = p_store_id;
  if not found or v_store.status <> 'active' then
    raise exception 'La tienda no está disponible' using errcode = 'P0001', hint = 'store_inactive';
  end if;
  v_currency := v_store.base_currency;
  select c.rounding into v_rounding from public.store_currencies c
  where c.store_id = p_store_id and c.currency = v_currency;

  -- A phone with the wrong time must not move a sale to another day.
  if v_sold_at > now() + interval '10 minutes' then
    v_flags := v_flags || jsonb_build_object('type', 'clock_skew', 'sold_at', v_sold_at);
    v_sold_at := now();
  end if;

  v_ranks := private.order_warehouses(p_store_id, null, null);
  v_warehouse := v_ranks[1];

  select coalesce(array_agg(distinct v.id), '{}') into v_variant_ids
  from jsonb_array_elements(v_lines) l
  join public.product_variants v on v.id = private.try_uuid(l ->> 'variant_id') and v.store_id = p_store_id;
  select coalesce(jsonb_object_agg(v.id, v.stock_available), '{}') into v_before
  from public.product_variants v where v.id = any (v_variant_ids);

  insert into public.store_order_counters as c (store_id, last_number) values (p_store_id, 1001)
  on conflict (store_id) do update set last_number = c.last_number + 1
  returning last_number into v_number;

  insert into public.orders (store_id, number, idempotency_key, channel, status, currency, exchange_rate, subtotal,
    shipping_total, discount_total, total, customer_name, customer_phone, shipping_type, shipping_snapshot, warehouse_id,
    customer_note, created_by, notify_customer, confirmed_at, delivered_at, cancelled_at, cancel_reason, created_at,
    updated_at)
  values (p_store_id, v_number, v_key, 'pos',
    case when v_voided then 'cancelled' else 'delivered' end::public.order_status,
    v_currency, 1, 0, 0, 0, 0, 'Mostrador', null, 'pickup', jsonb_build_object('type', 'pickup', 'method', 'Mostrador'),
    v_warehouse, nullif(btrim(coalesce(p_sale ->> 'note', '')), ''), p_user_id, false, v_sold_at,
    case when not v_voided then v_sold_at end,
    case when v_voided then v_sold_at end,
    case when v_voided then 'Anulada en caja' end,
    v_sold_at, v_sold_at)
  returning * into v_order;

  -- In variant order: the same lock order in every sale, no deadlocks.
  for v_line in
    select l.value as raw, l.ordinality as sort_order, (l.value ->> 'quantity')::int as quantity,
      round((l.value ->> 'unit_price')::numeric, 2) as unit_price, v.*, p.primary_media_url, p.name as current_name
    from jsonb_array_elements(v_lines) with ordinality l
    left join public.product_variants v on v.id = private.try_uuid(l.value ->> 'variant_id') and v.store_id = p_store_id
    left join public.products p on p.id = v.product_id
    order by v.id nulls last, l.ordinality
  loop
    if v_line.quantity is null or v_line.quantity not between 1 and 999
       or v_line.unit_price is null or v_line.unit_price < 0 then
      raise exception 'Una línea de la venta no es válida' using errcode = 'P0001', hint = 'invalid_input';
    end if;
    v_unit := v_line.unit_price;
    -- A variant that no longer exists has no price to compare with.
    select null::numeric as list_price, null::numeric as compare_at_price, null::numeric as unit_price,
      null::uuid as promotion_id, null::text as promotion_name into v_price;
    v_matches := false;

    if v_line.id is null then
      v_flags := v_flags || jsonb_build_object('type', 'unknown_variant', 'variant_id', v_line.raw ->> 'variant_id',
        'name', v_line.raw ->> 'product_name');
    else
      select * into v_price from private.variant_sale_price(p_store_id, v_line.id, v_currency::text, 1, v_rounding, v_sold_at);
      v_matches := v_price.unit_price = v_unit;
      if not v_matches then
        v_flags := v_flags || jsonb_build_object('type', 'price_mismatch', 'variant_id', v_line.id,
          'charged', v_unit, 'expected', v_price.unit_price);
      end if;
    end if;
    v_list := greatest(coalesce(v_price.list_price, v_unit), v_unit);

    if v_line.id is not null and v_line.track_inventory and not v_voided and v_warehouse is not null then
      insert into public.stocks (store_id, variant_id, warehouse_id) values (p_store_id, v_line.id, v_warehouse)
      on conflict (variant_id, warehouse_id) do nothing;
      perform 1 from public.stocks s
      where s.variant_id = v_line.id and s.warehouse_id = any (v_ranks)
      order by s.warehouse_id
      for update of s;
      v_left := v_line.quantity;
      for v_stock in
        select s.* from public.stocks s
        join unnest(v_ranks) with ordinality r(warehouse_id, rank) on r.warehouse_id = s.warehouse_id
        where s.variant_id = v_line.id
        order by r.rank
      loop
        exit when v_left = 0;
        v_take := least(v_left, v_stock.quantity - v_stock.quantity_allocated);
        continue when v_take <= 0;
        update public.stocks set quantity = quantity - v_take
        where variant_id = v_line.id and warehouse_id = v_stock.warehouse_id;
        insert into public.stock_movements (store_id, variant_id, warehouse_id, type, quantity, order_id, user_id, note)
        values (p_store_id, v_line.id, v_stock.warehouse_id, 'sale', -v_take, v_order.id, p_user_id,
          'Venta de mostrador ' || v_number);
        -- Consumed: the cancellation puts these units back.
        insert into public.inventory_reservations (store_id, order_id, variant_id, warehouse_id, quantity, status)
        values (p_store_id, v_order.id, v_line.id, v_stock.warehouse_id, v_take, 'consumed');
        v_left := v_left - v_take;
      end loop;
      -- The stock never goes negative: what was missing stays noted for the inventory stage.
      if v_left > 0 then
        v_flags := v_flags || jsonb_build_object('type', 'stock_shortfall', 'variant_id', v_line.id, 'missing', v_left);
      end if;
    end if;

    insert into public.order_lines (store_id, order_id, variant_id, product_id, product_name, variant_name, sku,
      attributes, image_url, quantity, unit_price, compare_at_price, line_total, sort_order, unit_list_price,
      discount_amount, promotion_id, promotion_name)
    values (p_store_id, v_order.id, v_line.id, v_line.product_id,
      coalesce(v_line.current_name, nullif(btrim(coalesce(v_line.raw ->> 'product_name', '')), ''), 'Producto'),
      coalesce(v_line.name, v_line.raw ->> 'variant_name', ''), coalesce(v_line.sku, v_line.raw ->> 'sku', ''),
      coalesce((
        select jsonb_agg(jsonb_build_object('name', a.name, 'value', av.name) order by pta.sort_order, a.name)
        from public.variant_attribute_values vav
        join public.attributes a on a.id = vav.attribute_id
        join public.attribute_values av on av.id = vav.value_id
        left join public.product_type_attributes pta
          on pta.attribute_id = a.id and pta.product_type_id = (select product_type_id from public.products where id = v_line.product_id)
        where vav.variant_id = v_line.id
      ), '[]'),
      v_line.primary_media_url, v_line.quantity, v_unit, v_price.compare_at_price, v_unit * v_line.quantity,
      v_line.sort_order, v_list, (v_list - v_unit) * v_line.quantity,
      case when v_matches then v_price.promotion_id end, case when v_matches then v_price.promotion_name end)
    returning id into v_line_id;

    if v_line.id is not null then
      insert into public.order_line_costs (store_id, order_line_id, unit_cost, cost_currency)
      select p_store_id, v_line_id, c.cost_price, c.cost_currency
      from public.variant_costs c where c.variant_id = v_line.id;
    end if;

    v_subtotal := v_subtotal + v_unit * v_line.quantity;
  end loop;

  update public.orders set subtotal = v_subtotal, total = v_subtotal where id = v_order.id;

  if not v_voided then
    for v_payment in select value from jsonb_array_elements(coalesce(p_sale -> 'payments', '[]')) loop
      select * into v_terms from private.payment_terms(v_currency, v_subtotal - v_paid, v_payment);
      -- A method deleted while the phone was offline does not lose the sale.
      select m.id into v_method from public.payment_methods m
      where m.id = private.try_uuid(v_payment ->> 'payment_method_id') and m.store_id = p_store_id;
      insert into public.payments (store_id, order_id, payment_method_id, amount, currency, applied_amount, rate_to_order,
        change_amount, change_currency, reference, recorded_by, created_at)
      values (p_store_id, v_order.id, v_method, v_terms.amount, v_terms.currency, v_terms.applied, v_terms.rate,
        v_terms.change, v_terms.change_currency, nullif(btrim(coalesce(v_payment ->> 'reference', '')), ''), p_user_id,
        v_sold_at);
      insert into public.order_events (store_id, order_id, type, is_internal, payload, user_id, created_at)
      values (p_store_id, v_order.id, 'payment_recorded', true,
        jsonb_build_object('amount', v_terms.amount, 'currency', v_terms.currency, 'applied', v_terms.applied), p_user_id,
        v_sold_at);
      v_paid := v_paid + v_terms.applied;
    end loop;
    perform private.refresh_order_payment(v_order.id);
    update public.orders set paid_at = v_sold_at where id = v_order.id and payment_status = 'paid';
  end if;

  insert into public.order_events (store_id, order_id, type, is_internal, payload, user_id, created_at)
  values (p_store_id, v_order.id, 'created', true,
    jsonb_build_object('channel', 'pos', 'local_number', v_local, 'device_id', v_device), p_user_id, v_sold_at);

  insert into public.pos_sales (order_id, store_id, device_id, local_number, sold_at, cashier_id, flags)
  values (v_order.id, p_store_id, v_device, v_local, v_sold_at, p_user_id, v_flags);

  return jsonb_build_object('order_id', v_order.id, 'number', v_number, 'created', true, 'flags', v_flags,
    'flipped_product_ids', to_jsonb(private.availability_flips(v_variant_ids, v_before)));
end;
$$;

revoke all on function public.pos_record_sale(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.pos_record_sale(uuid, jsonb, uuid) to service_role;
