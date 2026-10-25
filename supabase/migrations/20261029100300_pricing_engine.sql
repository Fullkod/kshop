-- Phase 4: one pricing engine in SQL (PRP-4 D1–D11). The cart (public.price_lines), the checkout and the admin
-- "Nuevo pedido" (public.checkout_create_order), order_set_shipping and order_cancel price lines the same way:
--   * per line, the active promotion that leaves the lowest price (tie: priority, then the newest);
--   * one voucher per order on top of the promotions (order, specific lines or shipping);
--   * a manual discount for admin orders.
-- The storefront reads the promotion materialized per variant (variant_promotions, products.min_price/on_sale),
-- refreshed with the product summary, when promotions are saved and every minute for the ones that start/end.
-- Errors: P0001 with a Spanish message; hint voucher_invalid (422) for a voucher that does not apply.

create extension if not exists pg_cron;

alter table public.order_discounts add column voucher_scope public.voucher_scope;

-- ---------------------------------------------------------------------------
-- Targets and promotions
-- ---------------------------------------------------------------------------

-- Same membership as the storefront: manual products, or the rules of an automatic collection.
create function private.product_in_collection(p_product_id uuid, p_collection_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.collections col
    join public.products p on p.id = p_product_id and p.store_id = col.store_id
    where col.id = p_collection_id
      and (
        (col.rules is null and exists (
          select 1 from public.collection_products cp where cp.collection_id = col.id and cp.product_id = p.id))
        or (col.rules is not null and private.product_matches_rules(
          p.id, p.category_id, p.brand_id, p.featured, p.in_stock, p.published_at, col.rules))
      )
  );
$$;

create function private.discount_target_matches(
  p_type public.discount_target,
  p_target uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_category_id uuid,
  p_brand_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case p_type
    when 'product' then p_target = p_product_id
    when 'variant' then p_target = p_variant_id
    when 'brand' then p_target is not distinct from p_brand_id
    -- A category includes its subcategories.
    when 'category' then p_category_id is not null and exists (
      select 1 from public.categories c join public.categories t on t.id = p_target
      where c.id = p_category_id and c.path operator(extensions.<@) t.path)
    when 'collection' then private.product_in_collection(p_product_id, p_target)
  end;
$$;

-- Price after a reward. Fixed amounts are in the base currency, converted with the rate (to cents).
create function private.apply_reward(p_price numeric, p_reward public.discount_reward, p_value numeric, p_rate numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select greatest(0, case p_reward
    when 'percent' then round(p_price * (100 - p_value) / 100, 2)
    else p_price - private.convert_from_base(p_value, p_rate, null)
  end);
$$;

-- The active promotion that leaves the lowest price for a variant priced p_price (in the currency of p_rate).
create function private.best_promotion(p_store_id uuid, p_variant_id uuid, p_price numeric, p_rate numeric, p_at timestamptz)
returns table (promotion_id uuid, name text, reward public.discount_reward, value numeric, price numeric, ends_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select pr.id, pr.name, pr.reward, pr.value, private.apply_reward(p_price, pr.reward, pr.value, p_rate), pr.ends_at
  from public.product_variants v
  join public.products p on p.id = v.product_id
  join public.promotions pr on pr.store_id = v.store_id
  where v.id = p_variant_id and v.store_id = p_store_id
    and pr.is_active and pr.starts_at <= p_at and (pr.ends_at is null or pr.ends_at > p_at)
    and private.store_has_module(p_store_id, 'discounts')
    and exists (
      select 1 from public.promotion_targets t
      where t.promotion_id = pr.id
        and private.discount_target_matches(t.target_type, t.target_id, p.id, v.id, p.category_id, p.brand_id))
  order by 5, pr.priority desc, pr.created_at desc
  limit 1;
$$;

-- Sale price of a variant in a currency, with its promotion (list = price before the promotion).
create function private.variant_sale_price(
  p_store_id uuid, p_variant_id uuid, p_currency text, p_rate numeric, p_rounding numeric, p_at timestamptz
)
returns table (
  list_price numeric, compare_at_price numeric, unit_price numeric,
  promotion_id uuid, promotion_name text, reward public.discount_reward, value numeric
)
language sql
stable
set search_path = ''
as $$
  select round(b.price, 2), round(b.compare_at_price, 2), round(coalesce(bp.price, b.price), 2), bp.promotion_id,
    bp.name, bp.reward, bp.value
  from private.variant_price_in(p_variant_id, p_currency, p_rate, p_rounding) b
  left join lateral private.best_promotion(p_store_id, p_variant_id, b.price, p_rate, p_at) bp on true;
$$;

-- ---------------------------------------------------------------------------
-- Materialized promotion price for the storefront (base currency)
-- ---------------------------------------------------------------------------

create or replace function private.refresh_product_summary(p_product_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.variant_promotions where product_id = p_product_id;
  insert into public.variant_promotions (variant_id, store_id, product_id, promotion_id, promotion_name, reward, value,
    promo_price, ends_at)
  select v.id, v.store_id, v.product_id, bp.promotion_id, bp.name, bp.reward, bp.value, bp.price, bp.ends_at
  from public.product_variants v
  cross join lateral private.best_promotion(v.store_id, v.id, v.price, 1, now()) bp
  where v.product_id = p_product_id;

  update public.products p
  set min_price = s.min_price,
      max_price = s.max_price,
      in_stock = coalesce(s.in_stock, false),
      on_sale = coalesce(s.on_sale, false),
      primary_media_url = (
        select coalesce(m.thumb_url, m.url) from public.product_media m
        where m.product_id = p.id order by m.sort_order, m.created_at limit 1
      )
  from (
    select min(coalesce(vp.promo_price, v.price)) as min_price, max(coalesce(vp.promo_price, v.price)) as max_price,
           bool_or(not v.track_inventory or v.stock_available > 0) as in_stock,
           bool_or(v.compare_at_price > v.price or vp.variant_id is not null) as on_sale
    from public.product_variants v
    left join public.variant_promotions vp on vp.variant_id = v.id
    where v.product_id = p_product_id
  ) s
  where p.id = p_product_id;
end;
$$;

-- Every product of a store (after saving a promotion or when one starts/ends).
create function private.refresh_store_promotions(p_store_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_product uuid;
begin
  for v_product in select id from public.products where store_id = p_store_id loop
    perform private.refresh_product_summary(v_product);
  end loop;
end;
$$;

-- API entry point (service_role): after saving, pausing or deleting a promotion.
create function public.refresh_promotions(p_store_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.refresh_store_promotions(p_store_id);
$$;

-- pg_cron, every minute: stores with a promotion that started or ended in the last 3 minutes (overlapping
-- windows so a skipped run is covered), or with a materialized promotion already over.
create function private.refresh_promotion_boundaries()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_store uuid;
begin
  for v_store in
    select store_id from public.promotions
    where is_active
      and (starts_at between now() - interval '3 minutes' and now()
        or ends_at between now() - interval '3 minutes' and now())
    union
    select store_id from public.variant_promotions where ends_at <= now()
  loop
    perform private.refresh_store_promotions(v_store);
  end loop;
end;
$$;

-- A product that changes category or brand, or enters/leaves a manual collection, may win or lose a promotion.
create function private.product_targets_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'products' then
    perform private.refresh_product_summary(new.id);
  elsif tg_op = 'DELETE' then
    perform private.refresh_product_summary(old.product_id);
  else
    perform private.refresh_product_summary(new.product_id);
  end if;
  return null;
end;
$$;

create trigger products_promotion_targets_trigger
after update of category_id, brand_id on public.products
for each row execute function private.product_targets_changed();

create trigger collection_products_promotion_trigger
after insert or delete on public.collection_products
for each row execute function private.product_targets_changed();

-- The storefront filters use the effective price and "on sale" (compare_at_price or a promotion).
create or replace function private.product_matches_rules(
  p_product_id uuid,
  p_category_id uuid,
  p_brand_id uuid,
  p_featured boolean,
  p_in_stock boolean,
  p_published_at timestamptz,
  p_rules jsonb
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    (p_rules ->> 'categoryId' is null or p_category_id in (
      select c.id from public.categories c
      where c.path operator(extensions.<@) (
        select c2.path from public.categories c2 where c2.id = (p_rules ->> 'categoryId')::uuid)))
    and (p_rules ->> 'brandId' is null or p_brand_id = (p_rules ->> 'brandId')::uuid)
    and (jsonb_array_length(coalesce(p_rules -> 'tags', '[]')) = 0 or exists (
      select 1 from public.product_tags t
      where t.product_id = p_product_id and t.tag in (select jsonb_array_elements_text(p_rules -> 'tags'))))
    and (coalesce((p_rules ->> 'onSale')::boolean, false) = false or exists (
      select 1 from public.products x where x.id = p_product_id and x.on_sale))
    and (p_rules ->> 'newerThanDays' is null
      or p_published_at >= now() - make_interval(days => (p_rules ->> 'newerThanDays')::int))
    and (coalesce((p_rules ->> 'featured')::boolean, false) = false or p_featured)
    and (coalesce((p_rules ->> 'inStock')::boolean, false) = false or p_in_stock);
$$;

create or replace function private.storefront_product_ids(
  p_store_id uuid,
  p_query text,
  p_category_id uuid,
  p_collection_id uuid,
  p_brand_ids uuid[],
  p_value_ids uuid[],
  p_min_price numeric,
  p_max_price numeric,
  p_in_stock boolean,
  p_on_sale boolean,
  p_ignore_attribute_id uuid default null
)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  with filter_groups as (
    select av.attribute_id, array_agg(av.id) as ids
    from public.attribute_values av
    where av.store_id = p_store_id and av.id = any (p_value_ids)
      and av.attribute_id is distinct from p_ignore_attribute_id
    group by av.attribute_id
  )
  select p.id
  from public.products p
  where p.store_id = p_store_id
    and p.status = 'published'
    and (p_brand_ids is null or p.brand_id = any (p_brand_ids))
    and (p_min_price is null or p.min_price >= p_min_price)
    and (p_max_price is null or p.min_price <= p_max_price)
    and (p_in_stock is not true or p.in_stock)
    and (p_on_sale is not true or p.on_sale)
    and (p_category_id is null or p.category_id in (
      select c.id from public.categories c
      where c.store_id = p_store_id
        and c.path operator(extensions.<@) (select c2.path from public.categories c2 where c2.id = p_category_id)))
    and (p_collection_id is null or exists (
      select 1 from public.collections col
      where col.id = p_collection_id and col.store_id = p_store_id
        and (
          (col.rules is null and exists (
            select 1 from public.collection_products cp where cp.collection_id = col.id and cp.product_id = p.id))
          or (col.rules is not null and private.product_matches_rules(
            p.id, p.category_id, p.brand_id, p.featured, p.in_stock, p.published_at, col.rules))
        )))
    and not exists (
      select 1 from filter_groups g
      where not exists (
          select 1 from public.variant_attribute_values vav
          join public.product_variants v on v.id = vav.variant_id
          where v.product_id = p.id and vav.store_id = p_store_id and vav.value_id = any (g.ids))
        and not exists (
          select 1 from public.product_attribute_values pav
          where pav.product_id = p.id and pav.store_id = p_store_id and pav.value_id = any (g.ids)))
    and (
      coalesce(btrim(p_query), '') = ''
      or p.search_vector @@ websearch_to_tsquery('spanish'::regconfig, extensions.unaccent(p_query))
      or extensions.unaccent(p.name) ilike '%' || extensions.unaccent(btrim(p_query)) || '%'
      or exists (select 1 from public.product_variants v where v.product_id = p.id and v.sku ilike btrim(p_query) || '%')
      or exists (select 1 from public.brands b where b.id = p.brand_id
        and extensions.unaccent(b.name) ilike '%' || extensions.unaccent(btrim(p_query)) || '%')
      or exists (select 1 from public.categories c where c.id = p.category_id
        and extensions.unaccent(c.name) ilike '%' || extensions.unaccent(btrim(p_query)) || '%')
    );
$$;

-- ---------------------------------------------------------------------------
-- Currency of a sale and vouchers
-- ---------------------------------------------------------------------------

-- A sale currency of the store (other than the base needs multi_currency): its rate and rounding.
create function private.sale_currency(p_store_id uuid, p_currency text)
returns table (currency text, rate numeric, rounding numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_currency text := coalesce(nullif(p_currency, ''), (select base_currency::text from public.stores where id = p_store_id));
  v_is_base boolean;
begin
  select c.rate_to_base, c.rounding, c.is_base into rate, rounding, v_is_base
  from public.store_currencies c
  where c.store_id = p_store_id and c.currency::text = v_currency and c.sells;
  if not found or (not v_is_base and not private.store_has_module(p_store_id, 'multi_currency')) then
    raise exception 'La moneda % no está disponible', v_currency using errcode = 'P0001', hint = 'invalid_input';
  end if;
  currency := v_currency;
  return next;
end;
$$;

-- Evaluates a voucher for priced lines (jsonb [{product_id, variant_id, category_id, brand_id, quantity,
-- line_total}]). amount is null for a shipping voucher while the shipping cost is unknown ("to agree").
-- error is the Spanish reason when it does not apply. p_lock: row lock for the checkout (usage limits).
create function private.voucher_evaluate(
  p_store_id uuid,
  p_code text,
  p_lines jsonb,
  p_subtotal numeric,
  p_currency text,
  p_rate numeric,
  p_customer_id uuid,
  p_phone text,
  p_shipping numeric,
  p_lock boolean
)
returns table (
  voucher_id uuid, code text, name text, scope public.voucher_scope, reward public.discount_reward, value numeric,
  amount numeric, error text
)
language plpgsql
set search_path = ''
as $$
declare
  v public.vouchers;
  v_used int;
  v_quantity int;
  v_eligible numeric;
begin
  code := upper(btrim(coalesce(p_code, '')));
  if p_lock then
    select * into v from public.vouchers x where x.store_id = p_store_id and x.code = upper(btrim(p_code)) for update;
  else
    select * into v from public.vouchers x where x.store_id = p_store_id and x.code = upper(btrim(p_code));
  end if;
  if not found or not v.is_active or not private.store_has_module(p_store_id, 'discounts') then
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
  select coalesce(sum((l ->> 'quantity')::int), 0) into v_quantity from jsonb_array_elements(p_lines) l;
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
$$;

-- ---------------------------------------------------------------------------
-- price_lines: what the cart shows (no locks, no writes)
-- ---------------------------------------------------------------------------

-- p_input: { currency?, lines: [{variant_id, quantity}], voucher_code?, customer_id?, phone?, shipping_total? }
-- -> { currency, lines: [{variant_id, quantity, list_price, compare_at_price, unit_price, discount_amount,
--      line_total, promotion: {id, name, reward, value} | null}], list_subtotal, subtotal, promotion_savings,
--      voucher: {code, name, scope, reward, value, amount, error} | null, discount_total }
create function public.price_lines(p_store_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      'quantity', x.quantity, 'list_price', sp.list_price, 'compare_at_price', sp.compare_at_price,
      'unit_price', sp.unit_price, 'discount_amount', (sp.list_price - sp.unit_price) * x.quantity,
      'line_total', sp.unit_price * x.quantity,
      'promotion', case when sp.promotion_id is not null then jsonb_build_object(
        'id', sp.promotion_id, 'name', sp.promotion_name, 'reward', sp.reward, 'value', sp.value) end
    ) order by x.variant_id), '[]'),
    coalesce(sum(sp.unit_price * x.quantity), 0),
    coalesce(sum(sp.list_price * x.quantity), 0)
  into v_lines, v_subtotal, v_list
  from (
    select private.try_uuid(l ->> 'variant_id') as variant_id, sum((l ->> 'quantity')::int) as quantity
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
    'discount_total', v_discount
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Checkout with promotions, voucher and manual discount
-- ---------------------------------------------------------------------------

-- New input keys: voucher_code (optional), manual_discount {reward, value, reason} (channel admin only).
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
-- Shipping set by the staff: a shipping voucher gets its amount now (D9)
-- ---------------------------------------------------------------------------

create or replace function public.order_set_shipping(p_store_id uuid, p_order_id uuid, p_amount numeric, p_user_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_shipping numeric := round(p_amount, 2);
  v_discount numeric;
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

  update public.order_discounts d
  set amount = case d.reward
    when 'percent' then round(v_shipping * d.value / 100, 2)
    else least(private.convert_from_base(d.value, v_order.exchange_rate, null), v_shipping)
  end
  where d.order_id = v_order.id and d.kind = 'voucher' and d.voucher_scope = 'shipping';
  update public.voucher_usages u set amount = d.amount
  from public.order_discounts d
  where u.order_id = v_order.id and d.order_id = v_order.id and d.kind = 'voucher' and d.voucher_scope = 'shipping';

  select coalesce(sum(amount), 0) into v_discount
  from public.order_discounts where order_id = v_order.id and kind <> 'promotion';

  update public.orders
  set shipping_total = v_shipping,
      discount_total = v_discount,
      total = greatest(subtotal + v_shipping - v_discount, 0)
  where id = v_order.id;
  perform private.refresh_order_payment(v_order.id);

  insert into public.order_events (store_id, order_id, type, payload, user_id)
  values (p_store_id, v_order.id, 'shipping_set', jsonb_build_object('amount', v_shipping), p_user_id);

  select * into v_order from public.orders where id = p_order_id;
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancel: also releases the voucher use (D6)
-- ---------------------------------------------------------------------------

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

  select * into v_usage from public.voucher_usages where order_id = v_order.id and released_at is null;
  if found then
    update public.vouchers set used_count = greatest(used_count - 1, 0) where id = v_usage.voucher_id;
    update public.voucher_usages set released_at = now() where id = v_usage.id;
  end if;

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
-- Privileges and the boundaries job
-- ---------------------------------------------------------------------------

revoke all on function private.product_in_collection(uuid, uuid),
  private.discount_target_matches(public.discount_target, uuid, uuid, uuid, uuid, uuid),
  private.apply_reward(numeric, public.discount_reward, numeric, numeric),
  private.best_promotion(uuid, uuid, numeric, numeric, timestamptz),
  private.variant_sale_price(uuid, uuid, text, numeric, numeric, timestamptz),
  private.refresh_store_promotions(uuid), private.refresh_promotion_boundaries(),
  private.product_targets_changed(), private.sale_currency(uuid, text),
  private.voucher_evaluate(uuid, text, jsonb, numeric, text, numeric, uuid, text, numeric, boolean)
  from public;
grant execute on function private.product_in_collection(uuid, uuid),
  private.discount_target_matches(public.discount_target, uuid, uuid, uuid, uuid, uuid),
  private.apply_reward(numeric, public.discount_reward, numeric, numeric),
  private.best_promotion(uuid, uuid, numeric, numeric, timestamptz),
  private.variant_sale_price(uuid, uuid, text, numeric, numeric, timestamptz),
  private.refresh_store_promotions(uuid), private.refresh_promotion_boundaries(),
  private.sale_currency(uuid, text),
  private.voucher_evaluate(uuid, text, jsonb, numeric, text, numeric, uuid, text, numeric, boolean)
  to service_role;
-- The catalog triggers run as the writer (staff through the API = service_role, or the owner in tests).
grant execute on function private.best_promotion(uuid, uuid, numeric, numeric, timestamptz),
  private.discount_target_matches(public.discount_target, uuid, uuid, uuid, uuid, uuid),
  private.product_in_collection(uuid, uuid), private.apply_reward(numeric, public.discount_reward, numeric, numeric)
  to authenticated;

revoke all on function public.price_lines(uuid, jsonb), public.refresh_promotions(uuid) from public, anon, authenticated;
grant execute on function public.price_lines(uuid, jsonb), public.refresh_promotions(uuid) to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'kshop-promotion-boundaries';
select cron.schedule('kshop-promotion-boundaries', '* * * * *', 'select private.refresh_promotion_boundaries()');
