-- Phase 8: klauShop -> Kshop migration helpers (.titan/plans/prp-fase-8-klaushop.md).
--
-- The import script (scripts/klaushop/import.mjs, service_role) keeps a map of klauShop ids to Kshop ids so every
-- batch is idempotent and resumable, inserts the order history without reserving stock or queueing WhatsApp notices
-- (checkout_create_order and order_transition do both), and can wipe the migrated data of the target store between
-- rehearsals. Everything lives in private or is executable by service_role only: pg_graphql and PostgREST expose
-- nothing of this to anon or authenticated.

create table private.legacy_ids (
  store_id uuid not null references public.stores (id) on delete cascade,
  entity text not null check (entity in ('product', 'variant', 'media', 'category', 'collection', 'zone', 'customer',
    'address', 'order', 'order_line', 'banner', 'promotion')),
  legacy_id text not null check (char_length(legacy_id) between 1 and 200),
  new_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (store_id, entity, legacy_id)
);
create index legacy_ids_new_idx on private.legacy_ids (store_id, entity, new_id);

-- ---------------------------------------------------------------------------
-- Map readers and writers (private is not exposed by PostgREST)
-- ---------------------------------------------------------------------------

create function public.legacy_ids_list(p_store_id uuid, p_entity text)
returns table (legacy_id text, new_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select l.legacy_id, l.new_id from private.legacy_ids l
  where l.store_id = p_store_id and l.entity = p_entity;
$$;

-- p_rows: [{entity, legacy_id, new_id}]. Returns the rows inserted (existing pairs are left as they are).
create function public.legacy_ids_put(p_store_id uuid, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into private.legacy_ids (store_id, entity, legacy_id, new_id)
  select p_store_id, r ->> 'entity', r ->> 'legacy_id', (r ->> 'new_id')::uuid
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  on conflict (store_id, entity, legacy_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Order history
-- ---------------------------------------------------------------------------

-- Inserts one historical order with its lines, payment and events, numbered from the store counter, dated as in
-- klauShop. Never touches stocks, inventory_reservations or notification_log. Idempotent by legacy_id.
-- p_payload: { legacy_id, legacy_number, created_at, status, payment_status, currency, customer_id?, customer_name,
--   customer_phone, shipping_type, shipping_zone_id?, shipping_method_id?, shipping_snapshot, shipping_total?,
--   payment_method_id?, payment_snapshot, payment_reference?, customer_note?,
--   lines: [{ legacy_id, variant_id?, product_id?, product_name, variant_name, sku, attributes, image_url?,
--             quantity, unit_price, unit_list_price?, compare_at_price?, discount_amount?, line_total }] }
create function public.import_legacy_order(p_store_id uuid, p_payload jsonb, p_user_id uuid)
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
    customer_note, created_by, confirmed_at, paid_at, shipped_at, delivered_at, cancelled_at, created_at, updated_at)
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
    v_created, v_created)
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
    insert into public.order_events (store_id, order_id, type, payload, user_id, created_at)
    values (p_store_id, v_order.id, 'payment_recorded',
      jsonb_build_object('amount', v_paid, 'currency', v_order.currency), p_user_id, v_created);
  end if;

  insert into public.order_events (store_id, order_id, type, is_internal, payload, user_id, created_at) values
    (p_store_id, v_order.id, 'created', false, jsonb_build_object('channel', 'web', 'status', v_status), p_user_id, v_created),
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

-- ---------------------------------------------------------------------------
-- Rehearsals: remove everything the import created in a store (never the store, its members, subscription,
-- theme, warehouse or currencies). Refuses the platform's Demo store. The caller deletes the customer auth users
-- and the storage objects it gets back.
-- ---------------------------------------------------------------------------

create function public.legacy_wipe_store_data(p_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store public.stores;
  v_users uuid[];
  v_counts jsonb := '{}'::jsonb;
  n int;
begin
  select * into v_store from public.stores where id = p_store_id;
  if not found or v_store.slug = 'demo' then
    raise exception 'Refusing to wipe this store' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(user_id), '{}') into v_users from public.customers where store_id = p_store_id;

  delete from public.orders where store_id = p_store_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('orders', n);
  delete from public.carts where store_id = p_store_id;
  delete from public.customers where store_id = p_store_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('customers', n);
  delete from public.products where store_id = p_store_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('products', n);
  delete from public.banners where store_id = p_store_id;
  delete from public.home_sections where store_id = p_store_id;
  delete from public.collections where store_id = p_store_id;
  loop
    delete from public.categories c where c.store_id = p_store_id
      and not exists (select 1 from public.categories x where x.parent_id = c.id);
    get diagnostics n = row_count;
    exit when n = 0;
  end loop;
  delete from public.promotions where store_id = p_store_id;
  delete from public.shipping_methods where store_id = p_store_id;
  delete from public.shipping_zones where store_id = p_store_id;
  delete from public.payment_methods where store_id = p_store_id;
  delete from public.attributes where store_id = p_store_id;
  delete from public.product_types where store_id = p_store_id;
  delete from public.store_order_counters where store_id = p_store_id;
  delete from public.store_notification_contacts where store_id = p_store_id;
  delete from private.legacy_ids where store_id = p_store_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('legacy_ids', n);

  return jsonb_build_object('counts', v_counts, 'customer_user_ids', to_jsonb(v_users));
end;
$$;

revoke all on function public.legacy_ids_list(uuid, text), public.legacy_ids_put(uuid, jsonb),
  public.import_legacy_order(uuid, jsonb, uuid), public.legacy_wipe_store_data(uuid) from public, anon, authenticated;
grant execute on function public.legacy_ids_list(uuid, text), public.legacy_ids_put(uuid, jsonb),
  public.import_legacy_order(uuid, jsonb, uuid), public.legacy_wipe_store_data(uuid) to service_role;
