-- KSH0015: sell by weight or measure (lb, kg, L, m…) with decimal quantities (2 decimals, P2).
-- Products say how they are sold (sale_unit, P1) and the step of the «− +» online (quantity_step, P4); every
-- quantity column goes from int to numeric(12,2) (no data changes: 3 stays 3.00), and each order line keeps the
-- unit it was sold in. Whole units («unit», every product until now) still refuse decimals, in the functions below.
--
-- ⚠ alter column type rewrites stocks, stock_movements, order_lines… under an exclusive lock: on the Nano, out of
-- hours and with nothing else running (PRP venta-por-peso, Gotchas).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Same rules as quantityError() in @kshop/core: > 0, 2 decimals, whole for «unit», 999 u / 99 999 for measures.
create function private.quantity_ok(p_quantity numeric, p_unit text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_quantity is not null and p_quantity > 0 and p_quantity = round(p_quantity, 2)
    and case when coalesce(p_unit, 'unit') = 'unit'
      then p_quantity = trunc(p_quantity) and p_quantity <= 999
      else p_quantity <= 99999 end;
$$;

-- A line sold by weight or measure counts as one product (coupons «al menos N productos», Finanzas).
create function private.counted_quantity(p_quantity numeric, p_unit text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_unit, 'unit') = 'unit' then p_quantity else 1 end;
$$;

-- «1,5 lb», «250 g», «3» (or «3 u» with p_with_unit): WhatsApp messages and error texts, like formatQuantity().
create function private.quantity_text(p_quantity numeric, p_unit text, p_with_unit boolean default false)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(trim(trailing '.' from trim(trailing '0' from to_char(round(p_quantity, 2), 'FM9999999990.00'))), '.', ',')
    || case coalesce(p_unit, 'unit')
      when 'unit' then case when p_with_unit then ' u' else '' end
      when 'l' then ' L' when 'm2' then ' m²'
      else ' ' || p_unit end;
$$;

revoke execute on function private.quantity_ok(numeric, text) from public, anon, authenticated;
revoke execute on function private.counted_quantity(numeric, text) from public, anon, authenticated;
revoke execute on function private.quantity_text(numeric, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.products
  add column sale_unit text not null default 'unit'
    constraint products_sale_unit_check
    check (sale_unit in ('unit', 'lb', 'oz', 'kg', 'g', 'l', 'ml', 'gal', 'm', 'cm', 'yd', 'ft', 'm2')),
  add column quantity_step numeric(12, 2) constraint products_quantity_step_check check (quantity_step > 0);

comment on column public.products.sale_unit is 'KSH0015: how it is sold; unit = whole quantities (as before).';
-- products grants columns one by one (search_vector, on_sale…): the new ones are public, like the price.
grant select (sale_unit, quantity_step) on public.products to anon, authenticated;

comment on column public.products.quantity_step is 'KSH0015: step and minimum of the quantity online; null = the unit''s.';

alter table public.stocks
  alter column quantity type numeric(12, 2),
  alter column quantity_allocated type numeric(12, 2),
  alter column low_stock_threshold type numeric(12, 2);
alter table public.stock_movements alter column quantity type numeric(12, 2);
alter table public.inventory_reservations alter column quantity type numeric(12, 2);
alter table public.product_variants alter column stock_available type numeric(12, 2);

alter table public.cart_lines drop constraint cart_lines_quantity_check;
alter table public.cart_lines
  alter column quantity type numeric(12, 2),
  add constraint cart_lines_quantity_check check (quantity > 0 and quantity <= 99999);

alter table public.order_lines drop constraint order_lines_quantity_check;
alter table public.order_lines
  alter column quantity type numeric(12, 2),
  add constraint order_lines_quantity_check check (quantity > 0 and quantity <= 99999),
  add column unit text not null default 'unit'
    constraint order_lines_unit_check
    check (unit in ('unit', 'lb', 'oz', 'kg', 'g', 'l', 'ml', 'gal', 'm', 'cm', 'yd', 'ft', 'm2'));

comment on column public.order_lines.unit is 'KSH0015: the unit the line was sold in (snapshot of products.sale_unit).';

-- ---------------------------------------------------------------------------
-- Functions: quantities as numeric, the unit checked and kept on each line, amounts rounded like the phone
-- (lineTotal in @kshop/core). Bodies are the current ones with only those changes.
-- ---------------------------------------------------------------------------

create or replace function private.availability_flips(p_variant_ids uuid[], p_before jsonb)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(array_agg(distinct v.product_id), '{}')
  from public.product_variants v
  where v.id = any (p_variant_ids)
    and v.track_inventory
    and (v.stock_available > 0) is distinct from ((p_before ->> v.id::text)::numeric > 0);
$function$;

drop function if exists private.finance_lines(uuid, date, date, text);
create or replace function private.finance_lines(p_store_id uuid, p_from date, p_to date, p_currency text)
 RETURNS TABLE(line_id uuid, product_id uuid, product_name text, category_id uuid, brand_id uuid, quantity numeric, revenue numeric, cost numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with tp as (select * from private.rate_periods(p_store_id, p_currency))
  select l.id, l.product_id, l.product_name, p.category_id, p.brand_id, private.counted_quantity(l.quantity, l.unit),
    (l.line_total - case when o.subtotal > 0 then least(o.discount_total, o.subtotal) * l.line_total / o.subtotal else 0 end)
      * o.exchange_rate / tp.rate,
    c.unit_cost * l.quantity * c.cost_rate_to_base / tp.rate
  from public.orders o
  join tp on o.created_at >= tp.from_at and o.created_at < tp.to_at
  join public.order_lines l on l.order_id = o.id
  left join public.order_line_costs c on c.order_line_id = l.id
  left join public.products p on p.id = l.product_id
  where o.store_id = p_store_id and o.status <> 'cancelled'
    and o.created_at >= private.havana_start(p_from) and o.created_at < private.havana_start(p_to + 1);
$function$;

create or replace function private.order_template_vars(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'tienda', private.whatsapp_escape(s.name),
    'numero', s.order_prefix || '-' || o.number,
    'cliente', private.whatsapp_escape(o.customer_name),
    'telefono', o.customer_phone,
    'subtotal', private.money_text(o.subtotal, o.currency::text),
    'descuento', case when o.discount_total > 0 then private.money_text(o.discount_total, o.currency::text) end,
    'envio', case when o.shipping_total is null then 'a convenir' else private.money_text(o.shipping_total, o.currency::text) end,
    'total', case when o.total is null then private.money_text(o.subtotal - o.discount_total, o.currency::text) || ' + entrega'
      else private.money_text(o.total, o.currency::text) end,
    'pagado', private.money_text(o.paid_total, o.currency::text),
    'lineas', (
      select string_agg(format('• %s × %s%s — %s', private.quantity_text(l.quantity, l.unit), private.whatsapp_escape(l.product_name),
        case when l.variant_name <> '' then ' (' || private.whatsapp_escape(l.variant_name) || ')' else '' end,
        private.money_text(l.line_total, o.currency::text)), e'\n' order by l.sort_order)
      from (select * from public.order_lines where order_id = o.id order by sort_order limit 15) l),
    'entrega', coalesce(o.shipping_snapshot ->> 'method', 'A convenir')
      || coalesce(' · ' || (o.shipping_snapshot ->> 'zone'), ''),
    'zona', o.shipping_snapshot ->> 'zone',
    'direccion', coalesce(o.shipping_snapshot ->> 'address', o.shipping_snapshot -> 'pickup_point' ->> 'name'),
    'metodo_pago', coalesce(o.payment_snapshot ->> 'name', 'a acordar con la tienda'),
    'instrucciones_pago', o.payment_snapshot ->> 'instructions',
    'motivo', case when o.cancel_reason is not null then 'Motivo: ' || o.cancel_reason end,
    'enlace_pedido', private.store_public_url(o.store_id)
      || case when o.customer_id is not null then '/account/orders/' || o.id else '/order/' || o.public_token end,
    'enlace_admin', private.store_public_url(o.store_id) || '/admin/orders/' || o.id
  )
  from public.orders o join public.stores s on s.id = o.store_id
  where o.id = p_order_id;
$function$;

create or replace function private.sf_product_card(p products)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'name', p.name,
    'minPrice', p.min_price::text,
    'maxPrice', p.max_price::text,
    'inStock', p.in_stock,
    'badge', p.badge,
    'saleUnit', p.sale_unit,
    'quantityStep', p.quantity_step::text,
    'primaryMediaUrl', p.primary_media_url,
    'brands', (select jsonb_build_object('name', b.name) from public.brands b where b.id = p.brand_id),
    'productVariantsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', v.id,
        'trackInventory', v.track_inventory,
        'stockAvailable', v.stock_available::text,
        'price', v.price::text,
        'compareAtPrice', v.compare_at_price::text,
        'variantAttributeValuesCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'attributeValues', (select jsonb_build_object('value', av.value)
                                from public.attribute_values av where av.id = x.value_id)
          )) order by x.attribute_id)
          from (
            select attribute_id, value_id from public.variant_attribute_values where variant_id = v.id
            order by attribute_id limit 5
          ) x
        ), '[]'::jsonb)),
        'variantPromotions', private.sf_variant_promotion(v.id),
        'variantPricesCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'currency', x.currency, 'price', x.price::text
          )) order by x.currency)
          from (select currency, price from public.variant_prices where variant_id = v.id order by currency limit 3) x
        ), '[]'::jsonb))
      )) order by v.id)
      from (
        select id, track_inventory, stock_available, price, compare_at_price
        from public.product_variants where product_id = p.id order by id limit 20
      ) v
    ), '[]'::jsonb))
  );
$function$;

create or replace function private.sf_product_full(p products)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'name', p.name,
    'description', p.description::text,
    'descriptionPlain', p.description_plain,
    'seoTitle', p.seo_title,
    'seoDescription', p.seo_description,
    'minPrice', p.min_price::text,
    'maxPrice', p.max_price::text,
    'inStock', p.in_stock,
    'primaryMediaUrl', p.primary_media_url,
    'categoryId', p.category_id,
    'saleUnit', p.sale_unit,
    'quantityStep', p.quantity_step::text,
    'brands', (select jsonb_build_object('name', b.name, 'slug', b.slug) from public.brands b where b.id = p.brand_id),
    'categories', (
      select jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'parentId', c.parent_id)
      from public.categories c where c.id = p.category_id
    ),
    'productMediaCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', m.id, 'url', m.url, 'thumbUrl', m.thumb_url, 'alt', m.alt
      )) order by m.sort_order nulls last, m.id)
      from (
        select id, url, thumb_url, alt, sort_order from public.product_media where product_id = p.id
        order by sort_order nulls last, id limit 30
      ) m
    ), '[]'::jsonb)),
    'productAttributeValuesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'valueText', a.value_text,
        'valueNumeric', a.value_numeric::text,
        'valueBoolean', a.value_boolean,
        'valueDate', a.value_date,
        'attributes', (
          select jsonb_build_object('name', t.name, 'unit', t.unit, 'visibleInStorefront', t.visible_in_storefront,
                                    'sortOrder', t.sort_order)
          from public.attributes t where t.id = a.attribute_id
        ),
        'attributeValues', (select jsonb_build_object('name', av.name) from public.attribute_values av
                            where av.id = a.value_id)
      )) order by a.id)
      from (select * from public.product_attribute_values where product_id = p.id order by id limit 50) a
    ), '[]'::jsonb)),
    'productVariantsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', v.id,
        'sku', v.sku,
        'name', v.name,
        'price', v.price::text,
        'compareAtPrice', v.compare_at_price::text,
        'trackInventory', v.track_inventory,
        'stockAvailable', v.stock_available::text,
        'variantPromotions', private.sf_variant_promotion(v.id),
        'variantPricesCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'currency', x.currency, 'price', x.price::text, 'compareAtPrice', x.compare_at_price::text
          )) order by x.currency)
          from (select * from public.variant_prices where variant_id = v.id order by currency limit 3) x
        ), '[]'::jsonb)),
        'variantMediaCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object('mediaId', x.media_id)) order by x.media_id)
          from (select media_id from public.variant_media where variant_id = v.id order by media_id limit 10) x
        ), '[]'::jsonb)),
        'variantAttributeValuesCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'attributeId', x.attribute_id,
            'valueId', x.value_id,
            'attributeValues', (
              select jsonb_build_object(
                'name', av.name, 'slug', av.slug, 'value', av.value, 'sortOrder', av.sort_order,
                'attributes', (select jsonb_build_object('name', t.name, 'slug', t.slug, 'sortOrder', t.sort_order)
                               from public.attributes t where t.id = av.attribute_id)
              )
              from public.attribute_values av where av.id = x.value_id
            )
          )) order by x.attribute_id)
          from (
            select attribute_id, value_id from public.variant_attribute_values where variant_id = v.id
            order by attribute_id limit 10
          ) x
        ), '[]'::jsonb))
      )) order by v.sort_order nulls last, v.id)
      from (
        select * from public.product_variants where product_id = p.id order by sort_order nulls last, id limit 100
      ) v
    ), '[]'::jsonb))
  );
$function$;

create or replace function private.voucher_evaluate(p_store_id uuid, p_code text, p_lines jsonb, p_subtotal numeric, p_currency text, p_rate numeric, p_customer_id uuid, p_phone text, p_shipping numeric, p_lock boolean)
 RETURNS TABLE(voucher_id uuid, code text, name text, scope voucher_scope, reward discount_reward, value numeric, amount numeric, error text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v public.vouchers;
  v_used int;
  v_quantity numeric;
  v_eligible numeric;
begin
  code := upper(btrim(coalesce(p_code, '')));
  if p_lock then
    select * into v from public.vouchers x where x.store_id = p_store_id and x.code = upper(btrim(p_code)) for update;
  else
    select * into v from public.vouchers x where x.store_id = p_store_id and x.code = upper(btrim(p_code));
  end if;
  if not found or not v.is_active or not private.store_has_module(p_store_id, 'vouchers') then
    error := 'Este cupón no existe o ya no está activo';
    return next;
    return;
  end if;
  voucher_id := v.id; code := v.code; name := v.name; scope := v.scope; reward := v.reward; value := v.value;

  if v.starts_at > now() then
    error := 'Este cupón aún no está activo';
  elsif v.ends_at is not null and v.ends_at <= now() then
    error := 'Este cupón ha caducado';
  elsif v.usage_limit is not null and v.used_count >= v.usage_limit then
    error := 'Este cupón ya no está disponible';
  end if;
  if error is null and v.usage_per_customer is not null and (p_customer_id is not null or p_phone is not null) then
    select count(*) into v_used from public.voucher_usages u
    where u.voucher_id = v.id and u.released_at is null
      and (u.customer_id = p_customer_id or u.phone = p_phone);
    if v_used >= v.usage_per_customer then
      error := 'Ya usaste este cupón';
    end if;
  end if;
  -- KSH0015: a line sold by weight or measure counts as one product.
  select coalesce(sum(private.counted_quantity((l ->> 'quantity')::numeric, coalesce(l ->> 'unit', 'unit'))), 0)
  into v_quantity from jsonb_array_elements(p_lines) l;
  if error is null and v.min_subtotal is not null
     and p_subtotal < private.convert_from_base(v.min_subtotal, p_rate, null) then
    error := format('El pedido mínimo para este cupón es %s %s',
      to_char(private.convert_from_base(v.min_subtotal, p_rate, null), 'FM999G999G990D00'), p_currency);
  elsif error is null and v.min_quantity is not null and v_quantity < v.min_quantity then
    error := format('Este cupón necesita al menos %s productos', v.min_quantity);
  end if;
  if error is not null then
    return next;
    return;
  end if;

  if v.scope = 'shipping' then
    amount := case
      when p_shipping is null then null
      when v.reward = 'percent' then round(p_shipping * v.value / 100, 2)
      else least(private.convert_from_base(v.value, p_rate, null), p_shipping)
    end;
  else
    if v.scope = 'order' then
      v_eligible := p_subtotal;
    else
      select coalesce(sum((l ->> 'line_total')::numeric), 0) into v_eligible
      from jsonb_array_elements(p_lines) l
      where exists (
        select 1 from public.voucher_targets t
        where t.voucher_id = v.id
          and private.discount_target_matches(t.target_type, t.target_id, private.try_uuid(l ->> 'product_id'),
            private.try_uuid(l ->> 'variant_id'), private.try_uuid(l ->> 'category_id'), private.try_uuid(l ->> 'brand_id')));
      if v_eligible = 0 then
        error := 'Este cupón no aplica a los productos del carrito';
        return next;
        return;
      end if;
    end if;
    amount := case v.reward
      when 'percent' then round(v_eligible * v.value / 100, 2)
      else least(private.convert_from_base(v.value, p_rate, null), v_eligible)
    end;
  end if;
  return next;
end;
$function$;

create or replace function public.admin_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
          'quantity', l.quantity::text,
          'unit', l.unit,
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
          'evidencePath', p.evidence_path, 'paymentMethodId', p.payment_method_id, 'createdAt', p.created_at,
          'appliedAmount', p.applied_amount::text, 'rateToOrder', p.rate_to_order::text,
          'changeAmount', p.change_amount::text, 'changeCurrency', p.change_currency
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
$function$;

create or replace function public.admin_orders(p_store_id uuid, p_first integer, p_offset integer DEFAULT 0, p_statuses order_status[] DEFAULT NULL::order_status[], p_number integer DEFAULT NULL::integer, p_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_search_number integer DEFAULT NULL::integer, p_channel order_channel DEFAULT NULL::order_channel)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object('quantity', l.quantity::text, 'unit', l.unit)) order by l.id)
          from (select id, quantity, unit from public.order_lines where order_id = o.id order by id limit 100) l
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
$function$;

create or replace function public.admin_product(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object('productsCollection', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
      'id', p.id,
      'productTypeId', p.product_type_id,
      'categoryId', p.category_id,
      'brandId', p.brand_id,
      'name', p.name,
      'slug', p.slug,
      'descriptionPlain', p.description_plain,
      'status', p.status,
      'featured', p.featured,
      'badge', p.badge,
      'saleUnit', p.sale_unit,
      'quantityStep', p.quantity_step::text,
      'seoTitle', p.seo_title,
      'seoDescription', p.seo_description,
      'productTagsCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object('tag', t.tag)) order by t.tag)
        from (select tag from public.product_tags where product_id = p.id order by tag limit 30) t
      ), '[]'::jsonb)),
      'collectionProductsCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object('collectionId', c.collection_id))
          order by c.collection_id)
        from (
          select collection_id from public.collection_products where product_id = p.id order by collection_id limit 50
        ) c
      ), '[]'::jsonb)),
      'productAttributeValuesCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'attributeId', a.attribute_id, 'valueId', a.value_id, 'valueText', a.value_text,
          'valueNumeric', a.value_numeric::text, 'valueBoolean', a.value_boolean, 'valueDate', a.value_date
        )) order by a.id)
        from (select * from public.product_attribute_values where product_id = p.id order by id limit 100) a
      ), '[]'::jsonb)),
      'productMediaCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'id', m.id, 'url', m.url, 'thumbUrl', m.thumb_url, 'alt', m.alt
        )) order by m.sort_order nulls last, m.id)
        from (
          -- Not *: source_url is not granted to authenticated.
          select id, url, thumb_url, alt, sort_order from public.product_media where product_id = p.id
          order by sort_order nulls last, id limit 50
        ) m
      ), '[]'::jsonb)),
      'productVariantsCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'id', v.id,
          'sku', v.sku,
          'name', v.name,
          'price', v.price::text,
          'compareAtPrice', v.compare_at_price::text,
          'trackInventory', v.track_inventory,
          'weight', v.weight::text,
          'stockAvailable', v.stock_available::text,
          'variantCosts', (
            select jsonb_build_object('costPrice', k.cost_price::text, 'costCurrency', k.cost_currency)
            from public.variant_costs k where k.variant_id = v.id
          ),
          'variantAttributeValuesCollection', jsonb_build_object('edges', coalesce((
            select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
              'attributeId', x.attribute_id, 'valueId', x.value_id
            )) order by x.attribute_id)
            from (
              select * from public.variant_attribute_values where variant_id = v.id order by attribute_id limit 20
            ) x
          ), '[]'::jsonb)),
          'variantPricesCollection', jsonb_build_object('edges', coalesce((
            select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
              'currency', x.currency, 'price', x.price::text, 'compareAtPrice', x.compare_at_price::text
            )) order by x.currency)
            from (select * from public.variant_prices where variant_id = v.id order by currency limit 5) x
          ), '[]'::jsonb)),
          'variantMediaCollection', jsonb_build_object('edges', coalesce((
            select jsonb_agg(jsonb_build_object('node', jsonb_build_object('mediaId', x.media_id)) order by x.media_id)
            from (select media_id from public.variant_media where variant_id = v.id order by media_id limit 20) x
          ), '[]'::jsonb)),
          'stocksCollection', jsonb_build_object('edges', coalesce((
            select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
              'warehouseId', x.warehouse_id, 'quantity', x.quantity::text, 'quantityAllocated', x.quantity_allocated::text
            )) order by x.warehouse_id)
            from (select * from public.stocks where variant_id = v.id order by warehouse_id limit 20) x
          ), '[]'::jsonb))
        )) order by v.sort_order nulls last, v.id)
        from (
          select * from public.product_variants where product_id = p.id order by sort_order nulls last, id limit 100
        ) v
      ), '[]'::jsonb))
    )))
    from public.products p
    where p.id = p_product_id
  ), '[]'::jsonb)));
$function$;

create or replace function public.admin_products(p_store_id uuid, p_first integer, p_offset integer DEFAULT 0, p_query text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_low_stock boolean DEFAULT NULL::boolean, p_no_cost boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with matched as (
    select s.* from public.admin_search_products(
      p_store_id, p_query, p_status, p_category_id, null, null, p_low_stock
    ) s
    where p_no_cost is not true or exists (
      select 1 from public.product_variants v
      where v.store_id = p_store_id and v.product_id = s.id
        and not exists (select 1 from public.variant_costs c where c.variant_id = v.id)
    )
  ),
  page as (
    select * from matched order by id limit p_first + 1 offset p_offset
  )
  select jsonb_build_object('adminSearchProducts', jsonb_build_object(
    'totalCount', (select count(*) from matched),
    'pageInfo', jsonb_build_object(
      'hasNextPage', (select count(*) from page) > p_first,
      'endCursor', (p_offset + p_first)::text
    ),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'slug', p.slug,
        'status', p.status,
        'minPrice', p.min_price::text,
        'maxPrice', p.max_price::text,
        'inStock', p.in_stock,
        'primaryMediaUrl', p.primary_media_url,
        'updatedAt', p.updated_at,
        'categoryId', p.category_id,
        'saleUnit', p.sale_unit,
        'productVariantsCollection', jsonb_build_object('edges', coalesce((
          select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'id', v.id, 'sku', v.sku, 'stockAvailable', v.stock_available::text, 'trackInventory', v.track_inventory
          )) order by v.id)
          from (select * from public.product_variants where product_id = p.id order by id limit 100) v
        ), '[]'::jsonb))
      )) order by p.id)
      from (select * from page order by id limit p_first) p
    ), '[]'::jsonb)
  ));
$function$;

create or replace function public.admin_variant_search(p_store_id uuid, p_query text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object('adminSearchProducts', jsonb_build_object('edges', coalesce((
    select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'status', p.status,
      'primaryMediaUrl', p.primary_media_url,
      'saleUnit', p.sale_unit,
      'productVariantsCollection', jsonb_build_object('edges', coalesce((
        select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
          'id', v.id, 'sku', v.sku, 'name', v.name, 'price', v.price::text, 'stockAvailable', v.stock_available::text,
          'trackInventory', v.track_inventory
        )) order by v.sort_order nulls last, v.id)
        from (
          select * from public.product_variants where product_id = p.id order by sort_order nulls last, id limit 100
        ) v
      ), '[]'::jsonb))
    )) order by p.id)
    from (
      select * from public.admin_search_products(p_store_id, p_query, null, null, null, null, null)
      order by id limit 10
    ) p
  ), '[]'::jsonb)));
$function$;

create or replace function public.cart_merge(p_store_id uuid, p_guest_token uuid, p_customer_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  set quantity = least(99999, public.cart_lines.quantity + excluded.quantity);

  delete from public.carts where id = v_guest.id;
  update public.carts set updated_at = now() where id = v_target;
  return v_target;
end;
$function$;

create or replace function public.checkout_create_order(p_store_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_cost numeric;
  v_stock public.stocks;
  v_available numeric;
  v_left numeric;
  v_take numeric;
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
      p.category_id, p.brand_id, p.sale_unit, x.quantity as requested, x.override_price, x.price_note
    from (
      select private.try_uuid(l ->> 'variant_id') as variant_id, sum((l ->> 'quantity')::numeric) as quantity,
        -- KSH0011: an admin order may set the price of a line (only the channel admin uses it, below).
        (array_agg(round((l ->> 'unit_price')::numeric, 2)) filter (where l ? 'unit_price'))[1] as override_price,
        (array_agg(nullif(btrim(left(coalesce(l ->> 'price_note', ''), 200)), '')) filter (where l ? 'unit_price'))[1]
          as price_note
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
    if not private.quantity_ok(v_line.requested, v_line.sale_unit) then
      raise exception 'Cantidad no válida para %', btrim(v_line.product_name || ' ' || coalesce(v_line.name, ''))
        using errcode = 'P0001', hint = 'invalid_input';
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
        raise exception 'Solo quedan % de %', private.quantity_text(greatest(v_available, 0), v_line.sale_unit, true),
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

    -- KSH0011: the price the staff set for this line of an admin order, noted in the history (internal).
    if v_channel = 'admin' and v_line.override_price is not null then
      if v_line.override_price < 0 or v_line.override_price > 9999999999.99 then
        raise exception 'Precio no válido' using errcode = 'P0001', hint = 'invalid_input';
      end if;
      if v_line.override_price <> v_price.unit_price then
        insert into public.order_events (store_id, order_id, type, is_internal, payload, user_id)
        values (p_store_id, v_order.id, 'price_changed', true, jsonb_build_object(
          'name', btrim(v_line.product_name || ' ' || coalesce(v_line.name, '')), 'from', v_price.unit_price,
          'to', v_line.override_price, 'currency', v_currency, 'note', v_line.price_note),
          private.try_uuid(p_input ->> 'created_by'));
        v_price.list_price := greatest(coalesce(v_price.list_price, v_line.override_price), v_line.override_price);
        v_price.unit_price := v_line.override_price;
        v_price.promotion_id := null;
        v_price.promotion_name := null;
      end if;
    end if;
    -- Below cost (in the base currency): noted for the owner, without the amount of the cost.
    if v_channel = 'admin' then
      select c.cost_price * private.rate_at(p_store_id, c.cost_currency::text, now()) into v_cost
      from public.variant_costs c where c.variant_id = v_line.id;
      if v_cost is not null and v_price.unit_price * v_rate < round(v_cost, 2) then
        insert into public.order_events (store_id, order_id, type, is_internal, payload, user_id)
        values (p_store_id, v_order.id, 'below_cost', true, jsonb_build_object(
          'name', btrim(v_line.product_name || ' ' || coalesce(v_line.name, '')), 'price', v_price.unit_price,
          'currency', v_currency), private.try_uuid(p_input ->> 'created_by'));
      end if;
    end if;

    insert into public.order_lines (store_id, order_id, variant_id, product_id, product_name, variant_name, sku,
      attributes, image_url, quantity, unit_price, compare_at_price, line_total, sort_order,
      unit_list_price, discount_amount, promotion_id, promotion_name, unit)
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
      v_line.requested, v_price.unit_price, v_price.compare_at_price, round(v_price.unit_price * v_line.requested, 2), v_sort,
      v_price.list_price, round((v_price.list_price - v_price.unit_price) * v_line.requested, 2), v_price.promotion_id,
      v_price.promotion_name, v_line.sale_unit)
    returning id into v_line_id;

    insert into public.order_line_costs (store_id, order_line_id, unit_cost, cost_currency)
    select p_store_id, v_line_id, c.cost_price, c.cost_currency
    from public.variant_costs c where c.variant_id = v_line.id;

    v_subtotal := v_subtotal + round(v_price.unit_price * v_line.requested, 2);
    v_priced := v_priced || jsonb_build_object('variant_id', v_line.id, 'product_id', v_line.product_id,
      'category_id', v_line.category_id, 'brand_id', v_line.brand_id, 'quantity', v_line.requested, 'unit', v_line.sale_unit,
      'line_total', round(v_price.unit_price * v_line.requested, 2));
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
$function$;

create or replace function public.import_product(p_store_id uuid, p_job_id uuid, p_mode import_mode, p_payload jsonb, p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_product_id uuid;
  v_variant jsonb;
  v_variant_id uuid;
  v_type public.product_types;
  v_warehouse uuid;
  v_attr jsonb;
  v_value_id text;
  v_next_sort int;
begin
  select v.product_id into v_product_id
  from public.product_variants v
  where v.store_id = p_store_id
    and upper(v.sku) in (select upper(x ->> 'sku') from jsonb_array_elements(p_payload -> 'variants') x)
  limit 1;

  if v_product_id is null then
    perform public.save_product(p_store_id, p_payload, p_user_id);
    -- Movements of the initial stock belong to the job.
    update public.stock_movements m set import_job_id = p_job_id, type = 'import'
    where m.store_id = p_store_id and m.import_job_id is null and m.created_at = now()
      and m.variant_id in (
        select v.id from public.product_variants v
        where v.store_id = p_store_id
          and upper(v.sku) in (select upper(x ->> 'sku') from jsonb_array_elements(p_payload -> 'variants') x)
      );
    return 'created';
  end if;

  if p_mode = 'create_only' then
    return 'skipped';
  end if;

  select t.* into v_type from public.product_types t
  join public.products p on p.product_type_id = t.id
  where p.id = v_product_id;

  update public.products set
    name = coalesce(nullif(p_payload ->> 'name', ''), name),
    description = case when p_payload ? 'description'
      then jsonb_build_object('format', 'plain', 'text', p_payload ->> 'description') else description end,
    description_plain = coalesce(p_payload ->> 'description', description_plain),
    category_id = case when p_payload ? 'category_id' then nullif(p_payload ->> 'category_id', '')::uuid else category_id end,
    brand_id = case when p_payload ? 'brand_id' then nullif(p_payload ->> 'brand_id', '')::uuid else brand_id end,
    status = coalesce(nullif(p_payload ->> 'status', '')::public.product_status, status),
    sale_unit = coalesce(nullif(p_payload ->> 'sale_unit', ''), sale_unit)
  where id = v_product_id;

  if p_payload ? 'tags' then
    delete from public.product_tags where product_id = v_product_id;
    insert into public.product_tags (store_id, product_id, tag)
    select distinct p_store_id, v_product_id, btrim(t)
    from jsonb_array_elements_text(p_payload -> 'tags') t where btrim(t) <> '';
  end if;

  insert into public.collection_products (store_id, collection_id, product_id)
  select p_store_id, (c)::uuid, v_product_id
  from jsonb_array_elements_text(coalesce(p_payload -> 'collection_ids', '[]'::jsonb)) c
  on conflict do nothing;

  for v_attr in select * from jsonb_array_elements(coalesce(p_payload -> 'attributes', '[]'::jsonb)) loop
    delete from public.product_attribute_values
    where product_id = v_product_id and attribute_id = (v_attr ->> 'attribute_id')::uuid;
    if jsonb_array_length(coalesce(v_attr -> 'value_ids', '[]'::jsonb)) > 0 then
      for v_value_id in select * from jsonb_array_elements_text(v_attr -> 'value_ids') loop
        insert into public.product_attribute_values (store_id, product_id, attribute_id, value_id)
        values (p_store_id, v_product_id, (v_attr ->> 'attribute_id')::uuid, v_value_id::uuid);
      end loop;
    elsif nullif(v_attr ->> 'value_text', '') is not null then
      insert into public.product_attribute_values (store_id, product_id, attribute_id, value_text)
      values (p_store_id, v_product_id, (v_attr ->> 'attribute_id')::uuid, v_attr ->> 'value_text');
    end if;
  end loop;

  select id into v_warehouse from public.warehouses where store_id = p_store_id and is_default;
  select coalesce(max(sort_order) + 1, 0) into v_next_sort from public.product_variants where product_id = v_product_id;

  for v_variant in select * from jsonb_array_elements(p_payload -> 'variants') loop
    select id into v_variant_id from public.product_variants
    where store_id = p_store_id and upper(sku) = upper(v_variant ->> 'sku');

    if v_variant_id is null then
      if not v_type.has_variants then
        raise exception 'This product type has no variants' using errcode = '23514', hint = 'variants';
      end if;
      insert into public.product_variants (store_id, product_id, sku, name, sort_order, price, compare_at_price)
      values (p_store_id, v_product_id, v_variant ->> 'sku', coalesce(v_variant ->> 'name', ''), v_next_sort,
              (v_variant ->> 'price')::numeric, (v_variant ->> 'compare_at_price')::numeric)
      returning id into v_variant_id;
      v_next_sort := v_next_sort + 1;
      insert into public.variant_attribute_values (store_id, variant_id, attribute_id, value_id)
      select p_store_id, v_variant_id, (x ->> 'attribute_id')::uuid, (x ->> 'value_id')::uuid
      from jsonb_array_elements(coalesce(v_variant -> 'attribute_values', '[]'::jsonb)) x;
    else
      if (select product_id from public.product_variants where id = v_variant_id) <> v_product_id then
        raise exception 'SKU % belongs to another product', v_variant ->> 'sku' using errcode = '23505', hint = 'sku';
      end if;
      update public.product_variants set
        price = coalesce((v_variant ->> 'price')::numeric, price),
        compare_at_price = case when v_variant ? 'compare_at_price'
          then (v_variant ->> 'compare_at_price')::numeric else compare_at_price end,
        name = coalesce(nullif(v_variant ->> 'name', ''), name)
      where id = v_variant_id;
    end if;

    if jsonb_typeof(v_variant -> 'cost') = 'object' then
      insert into public.variant_costs (store_id, variant_id, cost_price, cost_currency)
      values (p_store_id, v_variant_id, (v_variant -> 'cost' ->> 'price')::numeric, v_variant -> 'cost' ->> 'currency')
      on conflict (variant_id) do update set cost_price = excluded.cost_price, cost_currency = excluded.cost_currency;
    end if;

    if (v_variant ->> 'stock') is not null then
      perform public.set_stock_quantity(
        p_store_id, v_variant_id, v_warehouse, (v_variant ->> 'stock')::numeric, 'import', null, p_user_id, p_job_id
      );
    end if;
  end loop;

  perform private.refresh_product_summary(v_product_id);
  return 'updated';
end;
$function$;

create or replace function public.import_variant_extras(p_store_id uuid, p_job_id uuid, p_variants jsonb, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item jsonb;
  v_variant_id uuid;
  v_price record;
  v_stock record;
  v_warehouse public.warehouses;
begin
  for v_item in select x from jsonb_array_elements(coalesce(p_variants, '[]')) x loop
    select v.id into v_variant_id from public.product_variants v
    where v.store_id = p_store_id and upper(v.sku) = upper(v_item ->> 'sku');
    continue when v_variant_id is null;

    -- Fixed price per sale currency (the variant_prices trigger requires multi_currency).
    for v_price in select key as currency, value::numeric as price from jsonb_each_text(coalesce(v_item -> 'prices', '{}'))
    loop
      if not exists (
        select 1 from public.store_currencies c
        where c.store_id = p_store_id and c.currency::text = v_price.currency and c.sells and not c.is_base
      ) then
        raise exception 'La tienda no vende en %', v_price.currency using errcode = 'P0001', hint = 'invalid_input';
      end if;
      insert into public.variant_prices (store_id, variant_id, currency, price)
      values (p_store_id, v_variant_id, v_price.currency::public.currency_code, v_price.price)
      on conflict (variant_id, currency) do update set price = excluded.price;
    end loop;

    for v_stock in select key as warehouse_id, value::numeric as quantity from jsonb_each_text(coalesce(v_item -> 'stocks', '{}'))
    loop
      select * into v_warehouse from public.warehouses
      where id = private.try_uuid(v_stock.warehouse_id) and store_id = p_store_id;
      if v_warehouse.id is null then
        raise exception 'El almacén no existe en esta tienda' using errcode = 'P0001', hint = 'invalid_reference';
      end if;
      if not v_warehouse.is_default then
        perform private.require_multi_warehouse(p_store_id);
      end if;
      perform public.set_stock_quantity(p_store_id, v_variant_id, v_warehouse.id, v_stock.quantity, 'import', null,
        p_user_id, p_job_id);
    end loop;
  end loop;
end;
$function$;

create or replace function public.pos_catalog(p_store_id uuid, p_after uuid, p_limit integer, p_with_costs boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with page as (
    select v.id, v.product_id, v.name, v.sku, v.price, v.stock_available, v.track_inventory, v.updated_at,
      p.name as product_name, p.primary_media_url, p.sale_unit, p.quantity_step, vp.promo_price, vp.promotion_name, vp.ends_at,
      case when p_with_costs and c.variant_id is not null
        then round(c.cost_price * private.rate_at(p_store_id, c.cost_currency::text, now()), 2) end as cost
    from public.product_variants v
    join public.products p on p.id = v.product_id and p.status <> 'archived'
    left join public.variant_promotions vp on vp.variant_id = v.id
    left join public.variant_costs c on c.variant_id = v.id
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
        'stock', stock_available, 'trackInventory', track_inventory, 'imageUrl', primary_media_url,
        'saleUnit', sale_unit, 'quantityStep', quantity_step
      ) || case when p_with_costs then jsonb_build_object('cost', cost) else '{}'::jsonb end
      order by id) from page
    ), '[]'::jsonb),
    'next', (select case when count(*) = least(greatest(coalesce(p_limit, 500), 1), 500)
      then (select id from page order by id desc limit 1) end from page)
  );
$function$;

create or replace function public.pos_record_sale(p_store_id uuid, p_sale jsonb, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_left numeric;
  v_take numeric;
  v_line_id uuid;
  v_subtotal numeric := 0;
  v_paid numeric := 0;
  v_payment jsonb;
  v_terms record;
  v_method uuid;
  v_cost numeric;
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
    select l.value as raw, l.ordinality as sort_order, round((l.value ->> 'quantity')::numeric, 2) as quantity,
      round((l.value ->> 'unit_price')::numeric, 2) as unit_price, v.*, p.primary_media_url, p.name as current_name,
      coalesce(nullif(l.value ->> 'unit', ''), p.sale_unit, 'unit') as sale_unit
    from jsonb_array_elements(v_lines) with ordinality l
    left join public.product_variants v on v.id = private.try_uuid(l.value ->> 'variant_id') and v.store_id = p_store_id
    left join public.products p on p.id = v.product_id
    order by v.id nulls last, l.ordinality
  loop
    -- KSH0015: the sale already happened: a decimal is taken as sold (the phone knew the unit).
    if v_line.quantity is null or v_line.quantity <= 0 or v_line.quantity > 99999
       or v_line.sale_unit not in ('unit','lb','oz','kg','g','l','ml','gal','m','cm','yd','ft','m2')
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
      -- KSH0011: a price the cashier changed on purpose (with its optional reason) is not a stale catalog.
      if not v_matches and coalesce((v_line.raw ->> 'price_changed')::boolean, false) then
        v_flags := v_flags || jsonb_build_object('type', 'price_changed', 'variant_id', v_line.id,
          'charged', v_unit, 'expected', v_price.unit_price,
          'note', nullif(btrim(left(coalesce(v_line.raw ->> 'price_note', ''), 200)), ''));
      elsif not v_matches then
        v_flags := v_flags || jsonb_build_object('type', 'price_mismatch', 'variant_id', v_line.id,
          'charged', v_unit, 'expected', v_price.unit_price);
      end if;
      -- Below cost: the owner reads it in the order; the amount of the cost never travels in the note.
      select round(c.cost_price * private.rate_at(p_store_id, c.cost_currency::text, v_sold_at), 2) into v_cost
      from public.variant_costs c where c.variant_id = v_line.id;
      if v_cost is not null and v_unit < v_cost then
        v_flags := v_flags || jsonb_build_object('type', 'below_cost', 'variant_id', v_line.id, 'charged', v_unit);
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
      discount_amount, promotion_id, promotion_name, unit)
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
      v_line.primary_media_url, v_line.quantity, v_unit, v_price.compare_at_price, round(v_unit * v_line.quantity, 2),
      v_line.sort_order, v_list, round((v_list - v_unit) * v_line.quantity, 2),
      case when v_matches then v_price.promotion_id end, case when v_matches then v_price.promotion_name end,
      v_line.sale_unit)
    returning id into v_line_id;

    if v_line.id is not null then
      insert into public.order_line_costs (store_id, order_line_id, unit_cost, cost_currency)
      select p_store_id, v_line_id, c.cost_price, c.cost_currency
      from public.variant_costs c where c.variant_id = v_line.id;
    end if;

    v_subtotal := v_subtotal + round(v_unit * v_line.quantity, 2);
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
$function$;

create or replace function public.price_lines(p_store_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cur record;
  v_lines jsonb;
  v_subtotal numeric;
  v_list numeric;
  v_voucher record;
  v_voucher_json jsonb;
  v_discount numeric := 0;
  v_code text := nullif(btrim(coalesce(p_input ->> 'voucher_code', '')), '');
begin
  select * into v_cur from private.sale_currency(p_store_id, p_input ->> 'currency');

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'variant_id', x.variant_id, 'product_id', v.product_id, 'category_id', p.category_id, 'brand_id', p.brand_id,
      'quantity', x.quantity, 'unit', p.sale_unit, 'list_price', sp.list_price, 'compare_at_price', sp.compare_at_price,
      'unit_price', sp.unit_price, 'discount_amount', round((sp.list_price - sp.unit_price) * x.quantity, 2),
      'line_total', round(sp.unit_price * x.quantity, 2),
      'promotion', case when sp.promotion_id is not null then jsonb_build_object(
        'id', sp.promotion_id, 'name', sp.promotion_name, 'reward', sp.reward, 'value', sp.value) end
    ) order by x.variant_id), '[]'),
    coalesce(sum(round(sp.unit_price * x.quantity, 2)), 0),
    coalesce(sum(round(sp.list_price * x.quantity, 2)), 0)
  into v_lines, v_subtotal, v_list
  from (
    select private.try_uuid(l ->> 'variant_id') as variant_id, sum((l ->> 'quantity')::numeric) as quantity
    from jsonb_array_elements(coalesce(p_input -> 'lines', '[]')) l
    group by 1
  ) x
  join public.product_variants v on v.id = x.variant_id and v.store_id = p_store_id
  join public.products p on p.id = v.product_id
  cross join lateral private.variant_sale_price(p_store_id, v.id, v_cur.currency, v_cur.rate, v_cur.rounding, now()) sp;

  if v_code is not null then
    select * into v_voucher from private.voucher_evaluate(p_store_id, v_code, v_lines, v_subtotal, v_cur.currency,
      v_cur.rate, private.try_uuid(p_input ->> 'customer_id'), nullif(p_input ->> 'phone', ''),
      (p_input ->> 'shipping_total')::numeric, false);
    v_voucher_json := jsonb_build_object('code', v_voucher.code, 'name', v_voucher.name, 'scope', v_voucher.scope,
      'reward', v_voucher.reward, 'value', v_voucher.value, 'amount', v_voucher.amount, 'error', v_voucher.error);
    if v_voucher.error is null then
      v_discount := coalesce(v_voucher.amount, 0);
    end if;
  end if;

  return jsonb_build_object(
    'currency', v_cur.currency,
    'lines', v_lines,
    'list_subtotal', v_list,
    'subtotal', v_subtotal,
    'promotion_savings', v_list - v_subtotal,
    'voucher', v_voucher_json,
    'discount_total', v_discount,
    -- The storefront shows the coupon field only with the vouchers module.
    'vouchers_enabled', private.store_has_module(p_store_id, 'vouchers')
  );
end;
$function$;

create or replace function public.save_product(p_store_id uuid, p_input jsonb, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_product_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_type public.product_types;
  v_default_warehouse uuid;
  v_variant jsonb;
  v_variant_id uuid;
  v_keep_variants uuid[] := '{}';
  v_attr jsonb;
  v_value_id text;
  v_count int;
begin
  select * into v_type
  from public.product_types
  where store_id = p_store_id and id = (p_input ->> 'product_type_id')::uuid;
  if not found then
    raise exception 'Product type not found' using errcode = '23503', hint = 'product_type_id';
  end if;

  v_count := jsonb_array_length(coalesce(p_input -> 'variants', '[]'::jsonb));
  if v_count = 0 then
    raise exception 'A product needs at least one variant' using errcode = '23514', hint = 'variants';
  end if;
  if not v_type.has_variants and v_count > 1 then
    raise exception 'This product type has no variants' using errcode = '23514', hint = 'variants';
  end if;

  if v_product_id is null then
    insert into public.products (
      store_id, product_type_id, category_id, brand_id, name, slug, description, description_plain, status,
      featured, badge, seo_title, seo_description, sale_unit, quantity_step
    ) values (
      p_store_id,
      v_type.id,
      nullif(p_input ->> 'category_id', '')::uuid,
      nullif(p_input ->> 'brand_id', '')::uuid,
      p_input ->> 'name',
      p_input ->> 'slug',
      jsonb_build_object('format', 'plain', 'text', coalesce(p_input ->> 'description', '')),
      coalesce(p_input ->> 'description', ''),
      coalesce(p_input ->> 'status', 'draft')::public.product_status,
      coalesce((p_input ->> 'featured')::boolean, false),
      nullif(p_input ->> 'badge', ''),
      nullif(p_input ->> 'seo_title', ''),
      nullif(p_input ->> 'seo_description', ''),
      coalesce(nullif(p_input ->> 'sale_unit', ''), 'unit'),
      nullif(p_input ->> 'quantity_step', '')::numeric
    )
    returning id into v_product_id;
  else
    update public.products set
      product_type_id = v_type.id,
      category_id = nullif(p_input ->> 'category_id', '')::uuid,
      brand_id = nullif(p_input ->> 'brand_id', '')::uuid,
      name = p_input ->> 'name',
      slug = p_input ->> 'slug',
      description = jsonb_build_object('format', 'plain', 'text', coalesce(p_input ->> 'description', '')),
      description_plain = coalesce(p_input ->> 'description', ''),
      status = coalesce(p_input ->> 'status', 'draft')::public.product_status,
      featured = coalesce((p_input ->> 'featured')::boolean, false),
      badge = nullif(p_input ->> 'badge', ''),
      seo_title = nullif(p_input ->> 'seo_title', ''),
      seo_description = nullif(p_input ->> 'seo_description', ''),
      sale_unit = case when p_input ? 'sale_unit' then coalesce(nullif(p_input ->> 'sale_unit', ''), 'unit') else sale_unit end,
      quantity_step = case when p_input ? 'quantity_step' then nullif(p_input ->> 'quantity_step', '')::numeric
        else quantity_step end
    where store_id = p_store_id and id = v_product_id;
    if not found then
      raise exception 'Product not found' using errcode = 'P0002';
    end if;
  end if;

  -- Tags
  delete from public.product_tags where product_id = v_product_id;
  insert into public.product_tags (store_id, product_id, tag)
  select distinct p_store_id, v_product_id, btrim(t)
  from jsonb_array_elements_text(coalesce(p_input -> 'tags', '[]'::jsonb)) t
  where btrim(t) <> '';

  -- Collections (keep the position of the ones that stay)
  delete from public.collection_products cp
  where cp.product_id = v_product_id
    and cp.collection_id not in (
      select (c)::uuid from jsonb_array_elements_text(coalesce(p_input -> 'collection_ids', '[]'::jsonb)) c
    );
  insert into public.collection_products (store_id, collection_id, product_id, sort_order)
  select p_store_id, (c)::uuid, v_product_id,
         coalesce((select max(cp.sort_order) + 1 from public.collection_products cp where cp.collection_id = (c)::uuid), 0)
  from jsonb_array_elements_text(coalesce(p_input -> 'collection_ids', '[]'::jsonb)) c
  on conflict (collection_id, product_id) do nothing;

  -- Product attributes (must be product-scoped attributes of the type)
  delete from public.product_attribute_values where product_id = v_product_id;
  for v_attr in select * from jsonb_array_elements(coalesce(p_input -> 'attributes', '[]'::jsonb)) loop
    if not exists (
      select 1 from public.product_type_attributes pta
      where pta.product_type_id = v_type.id and pta.attribute_id = (v_attr ->> 'attribute_id')::uuid and pta.scope = 'product'
    ) then
      raise exception 'Attribute is not a product attribute of this type' using errcode = '23514', hint = 'attributes';
    end if;
    if jsonb_array_length(coalesce(v_attr -> 'value_ids', '[]'::jsonb)) > 0 then
      for v_value_id in select * from jsonb_array_elements_text(v_attr -> 'value_ids') loop
        insert into public.product_attribute_values (store_id, product_id, attribute_id, value_id)
        values (p_store_id, v_product_id, (v_attr ->> 'attribute_id')::uuid, v_value_id::uuid);
      end loop;
    elsif coalesce(v_attr ->> 'value_text', v_attr ->> 'value_numeric', v_attr ->> 'value_boolean', v_attr ->> 'value_date') is not null then
      insert into public.product_attribute_values (
        store_id, product_id, attribute_id, value_text, value_numeric, value_boolean, value_date
      ) values (
        p_store_id, v_product_id, (v_attr ->> 'attribute_id')::uuid,
        nullif(v_attr ->> 'value_text', ''), (v_attr ->> 'value_numeric')::numeric,
        (v_attr ->> 'value_boolean')::boolean, (v_attr ->> 'value_date')::date
      );
    end if;
  end loop;

  select id into v_default_warehouse from public.warehouses where store_id = p_store_id and is_default;

  -- Variants: existing ones (by id) are updated, new ones inserted, missing ones deleted.
  for v_variant in select * from jsonb_array_elements(p_input -> 'variants') loop
    v_variant_id := nullif(v_variant ->> 'id', '')::uuid;
    if v_variant_id is null then
      insert into public.product_variants (
        store_id, product_id, sku, name, sort_order, is_default, track_inventory, weight, price, compare_at_price
      ) values (
        p_store_id, v_product_id, v_variant ->> 'sku', coalesce(v_variant ->> 'name', ''),
        coalesce((v_variant ->> 'sort_order')::int, 0), not v_type.has_variants,
        coalesce((v_variant ->> 'track_inventory')::boolean, true), (v_variant ->> 'weight')::numeric,
        (v_variant ->> 'price')::numeric, (v_variant ->> 'compare_at_price')::numeric
      )
      returning id into v_variant_id;
    else
      update public.product_variants set
        sku = v_variant ->> 'sku',
        name = coalesce(v_variant ->> 'name', ''),
        sort_order = coalesce((v_variant ->> 'sort_order')::int, 0),
        is_default = not v_type.has_variants,
        track_inventory = coalesce((v_variant ->> 'track_inventory')::boolean, true),
        weight = (v_variant ->> 'weight')::numeric,
        price = (v_variant ->> 'price')::numeric,
        compare_at_price = (v_variant ->> 'compare_at_price')::numeric
      where store_id = p_store_id and product_id = v_product_id and id = v_variant_id;
      if not found then
        raise exception 'Variant not found in this product' using errcode = 'P0002', hint = 'variants';
      end if;
    end if;
    v_keep_variants := v_keep_variants || v_variant_id;

    -- Variant attributes (variant-scoped attributes of the type)
    delete from public.variant_attribute_values where variant_id = v_variant_id;
    for v_attr in select * from jsonb_array_elements(coalesce(v_variant -> 'attribute_values', '[]'::jsonb)) loop
      if not exists (
        select 1 from public.product_type_attributes pta
        where pta.product_type_id = v_type.id and pta.attribute_id = (v_attr ->> 'attribute_id')::uuid and pta.scope = 'variant'
      ) then
        raise exception 'Attribute is not a variant attribute of this type' using errcode = '23514', hint = 'variants';
      end if;
      insert into public.variant_attribute_values (store_id, variant_id, attribute_id, value_id)
      values (p_store_id, v_variant_id, (v_attr ->> 'attribute_id')::uuid, (v_attr ->> 'value_id')::uuid);
    end loop;

    -- Cost (private)
    if v_variant ? 'cost' then
      if jsonb_typeof(v_variant -> 'cost') = 'null' then
        delete from public.variant_costs where variant_id = v_variant_id;
      else
        insert into public.variant_costs (store_id, variant_id, cost_price, cost_currency)
        values (p_store_id, v_variant_id, (v_variant -> 'cost' ->> 'price')::numeric, v_variant -> 'cost' ->> 'currency')
        on conflict (variant_id) do update
        set cost_price = excluded.cost_price, cost_currency = excluded.cost_currency;
      end if;
    end if;

    -- Per-currency price overrides (multi_currency, enforced by trigger)
    if v_variant ? 'prices' then
      delete from public.variant_prices where variant_id = v_variant_id;
      insert into public.variant_prices (store_id, variant_id, currency, price, compare_at_price)
      select p_store_id, v_variant_id, x ->> 'currency', (x ->> 'price')::numeric, (x ->> 'compare_at_price')::numeric
      from jsonb_array_elements(v_variant -> 'prices') x;
    end if;

    -- Stock in the default warehouse ("flat" editing); per-warehouse editing uses set_stock_quantity.
    if (v_variant ->> 'stock') is not null then
      perform public.set_stock_quantity(
        p_store_id, v_variant_id, v_default_warehouse, (v_variant ->> 'stock')::numeric, 'adjustment', null, p_user_id
      );
    end if;

    -- Media assigned to the variant
    if v_variant ? 'media_ids' then
      delete from public.variant_media where variant_id = v_variant_id;
      insert into public.variant_media (store_id, variant_id, media_id)
      select p_store_id, v_variant_id, (m)::uuid from jsonb_array_elements_text(v_variant -> 'media_ids') m;
    end if;
  end loop;

  delete from public.product_variants
  where product_id = v_product_id and not (id = any (v_keep_variants));

  -- Recompute the denormalized summary once all children are in place.
  perform private.refresh_product_summary(v_product_id);

  return v_product_id;
end;
$function$;

drop function if exists public.set_stock_quantity(uuid, uuid, uuid, integer, public.stock_movement_type, text, uuid, uuid);
create or replace function public.set_stock_quantity(p_store_id uuid, p_variant_id uuid, p_warehouse_id uuid, p_quantity numeric, p_type stock_movement_type, p_note text, p_user_id uuid, p_import_job_id uuid DEFAULT NULL::uuid)
 RETURNS stocks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_stock public.stocks;
  v_delta numeric;
  v_unit text;
begin
  if p_quantity < 0 then
    raise exception 'Quantity cannot be negative' using errcode = '23514';
  end if;
  -- KSH0015: decimals only for products sold by weight or measure, 2 at most.
  select p.sale_unit into v_unit from public.product_variants v join public.products p on p.id = v.product_id
  where v.id = p_variant_id and v.store_id = p_store_id;
  if p_quantity <> round(p_quantity, 2) or (coalesce(v_unit, 'unit') = 'unit' and p_quantity <> trunc(p_quantity)) then
    raise exception 'Este producto se vende por unidades enteras' using errcode = 'P0001', hint = 'invalid_quantity';
  end if;

  insert into public.stocks (store_id, variant_id, warehouse_id, quantity)
  values (p_store_id, p_variant_id, p_warehouse_id, 0)
  on conflict (variant_id, warehouse_id) do nothing;

  select * into v_stock
  from public.stocks
  where variant_id = p_variant_id and warehouse_id = p_warehouse_id and store_id = p_store_id
  for update;
  if not found then
    raise exception 'Stock row not found for this store' using errcode = '23503';
  end if;
  if p_quantity < v_stock.quantity_allocated then
    raise exception 'Quantity below reserved units (%)', v_stock.quantity_allocated
      using errcode = '23514', hint = 'below_allocated';
  end if;

  v_delta := p_quantity - v_stock.quantity;
  if v_delta = 0 then
    return v_stock;
  end if;

  update public.stocks set quantity = p_quantity
  where variant_id = p_variant_id and warehouse_id = p_warehouse_id
  returning * into v_stock;

  insert into public.stock_movements (store_id, variant_id, warehouse_id, type, quantity, note, user_id, import_job_id)
  values (p_store_id, p_variant_id, p_warehouse_id, p_type, v_delta, p_note, p_user_id, p_import_job_id);

  return v_stock;
end;
$function$;

create or replace function public.transfer_stock(p_store_id uuid, p_from uuid, p_to uuid, p_lines jsonb, p_note text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_from public.warehouses;
  v_to public.warehouses;
  v_transfer uuid := gen_random_uuid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_line record;
  v_free numeric;
  v_count int := 0;
  v_units numeric := 0;
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
    select x.variant_id, sum(x.quantity) as quantity, v.store_id, v.name, p.name as product_name, p.sale_unit
    from (
      select private.try_uuid(l ->> 'variant_id') as variant_id, (l ->> 'quantity')::numeric as quantity
      from jsonb_array_elements(p_lines) l
    ) x
    left join public.product_variants v on v.id = x.variant_id and v.store_id = p_store_id
    left join public.products p on p.id = v.product_id
    group by x.variant_id, v.store_id, v.name, p.name, p.sale_unit
    order by x.variant_id
  loop
    if v_line.store_id is null then
      raise exception 'Un producto no existe en esta tienda' using errcode = 'P0001', hint = 'invalid_reference';
    end if;
    if not private.quantity_ok(v_line.quantity, v_line.sale_unit) then
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
      raise exception 'Solo hay % libres de % en %', private.quantity_text(greatest(v_free, 0), v_line.sale_unit, true),
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
    v_units := v_units + private.counted_quantity(v_line.quantity, v_line.sale_unit);
  end loop;

  return jsonb_build_object('transfer_id', v_transfer, 'variants', v_count, 'units', v_units);
end;
$function$;

drop function if exists public.warehouse_stock(uuid, uuid, text, integer);
create or replace function public.warehouse_stock(p_store_id uuid, p_warehouse_id uuid, p_query text, p_limit integer)
 RETURNS TABLE(variant_id uuid, product_name text, variant_name text, sku text, quantity numeric, allocated numeric, sale_unit text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select v.id, p.name, v.name, v.sku, coalesce(s.quantity, 0), coalesce(s.quantity_allocated, 0), p.sale_unit
  from public.product_variants v
  join public.products p on p.id = v.product_id
  left join public.stocks s on s.variant_id = v.id and s.warehouse_id = p_warehouse_id
  where v.store_id = p_store_id and p.status <> 'archived' and v.track_inventory
    and case
      when nullif(btrim(coalesce(p_query, '')), '') is null then coalesce(s.quantity, 0) > 0
      else v.sku ilike '%' || btrim(p_query) || '%' or p.name ilike '%' || btrim(p_query) || '%'
    end
  order by p.name, v.sort_order, v.sku
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$function$;

drop function if exists public.warehouse_totals(uuid);
create or replace function public.warehouse_totals(p_store_id uuid)
 RETURNS TABLE(warehouse_id uuid, variants integer, units numeric, reserved numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select w.id,
    count(s.variant_id) filter (where s.quantity > 0)::int,
    coalesce(sum(s.quantity), 0),
    coalesce(sum(s.quantity_allocated), 0)
  from public.warehouses w
  left join public.stocks s on s.warehouse_id = w.id
  where w.store_id = p_store_id
  group by w.id;
$function$;

revoke execute on function public.set_stock_quantity(uuid, uuid, uuid, numeric, public.stock_movement_type, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_stock_quantity(uuid, uuid, uuid, numeric, public.stock_movement_type, text, uuid, uuid) to service_role;
revoke execute on function public.warehouse_stock(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.warehouse_stock(uuid, uuid, text, integer) to service_role;
revoke execute on function public.warehouse_totals(uuid) from public, anon, authenticated;
grant execute on function public.warehouse_totals(uuid) to service_role;
revoke execute on function private.finance_lines(uuid, date, date, text) from public, anon, authenticated;
