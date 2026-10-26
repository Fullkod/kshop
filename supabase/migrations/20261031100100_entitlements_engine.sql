-- Phase 5: modules, limits and team (PRP-5 D1–D6, D20).
--   * store_modules stays the effective table. Rows from the plan are recalculated by sync_plan_modules (a module
--     that leaves the plan is disabled, never deleted); add-ons keep the price they were bought at; grants are free.
--   * Limits: per-store override ?? the plan limit raised by the limits of the active modules (no row = no limit).
--   * Team: max_staff counts admins and staff (not the owner), checked with the subscription row locked.
--   * Coupons and the manual discount need the new vouchers module (discounts keeps the visible offers).
-- Errors: P0001 with a Spanish message and a hint (max_staff, module_dependency, forbidden, conflict, not_found).

-- ---------------------------------------------------------------------------
-- Plan modules, add-ons and grants
-- ---------------------------------------------------------------------------

create function private.sync_plan_modules(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
begin
  select plan_id into v_plan_id from public.subscriptions where store_id = p_store_id;
  if not found then
    raise exception 'La tienda no tiene suscripción' using errcode = 'P0001', hint = 'not_found';
  end if;

  insert into public.store_modules (store_id, module_code, source, enabled, limits, starts_at, ends_at)
  select p_store_id, pm.module_code, 'plan', true, pm.limits, now(), null
  from public.plan_modules pm
  where pm.plan_id = v_plan_id
  on conflict (store_id, module_code, source) do update
    set enabled = true, limits = excluded.limits, ends_at = null,
        starts_at = case when public.store_modules.enabled then public.store_modules.starts_at else now() end;

  update public.store_modules sm set enabled = false
  where sm.store_id = p_store_id and sm.source = 'plan' and sm.enabled
    and not exists (select 1 from public.plan_modules pm where pm.plan_id = v_plan_id and pm.module_code = sm.module_code);
end;
$$;

-- Plan change: modules and limits change at once; no proration (D17): the next invoice uses the new plan.
create function public.change_plan(p_store_id uuid, p_plan_code text, p_interval text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_sub public.subscriptions;
begin
  select * into v_plan from public.plans where code = p_plan_code;
  if not found then
    raise exception 'El plan no existe' using errcode = 'P0001', hint = 'not_found';
  end if;
  if p_interval = 'year' and v_plan.yearly_price is null then
    raise exception 'Este plan no tiene pago anual' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  select * into v_sub from public.subscriptions where store_id = p_store_id for update;
  if not found then
    raise exception 'La tienda no tiene suscripción' using errcode = 'P0001', hint = 'not_found';
  end if;

  update public.subscriptions
  set plan_id = v_plan.id,
      billing_interval = coalesce(p_interval, billing_interval::text)::public.billing_interval
  where store_id = p_store_id;
  perform private.sync_plan_modules(p_store_id);
  return jsonb_build_object('store_id', p_store_id, 'plan', v_plan.code);
end;
$$;

-- The modules the store has now plus the one being added must cover its dependencies.
create function private.require_module_dependencies(p_store_id uuid, p_module_code text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_missing text;
begin
  select string_agg(m.name, ', ') into v_missing
  from public.modules x
  cross join lateral unnest(x.depends_on) d(code)
  join public.modules m on m.code = d.code
  where x.code = p_module_code and not private.store_has_module(p_store_id, d.code);
  if v_missing is not null then
    raise exception 'Este módulo necesita: %', v_missing using errcode = 'P0001', hint = 'module_dependency';
  end if;
end;
$$;

-- Add-on bought (p_enabled) or removed. The price is frozen when it is bought.
create function public.set_store_addon(p_store_id uuid, p_module_code text, p_enabled boolean, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_module public.modules;
begin
  select * into v_module from public.modules where code = p_module_code;
  if not found then
    raise exception 'El módulo no existe' using errcode = 'P0001', hint = 'not_found';
  end if;
  perform 1 from public.subscriptions where store_id = p_store_id for update;
  if not found then
    raise exception 'La tienda no tiene suscripción' using errcode = 'P0001', hint = 'not_found';
  end if;

  if p_enabled then
    if v_module.addon_price is null then
      raise exception 'Este módulo no se vende suelto' using errcode = 'P0001', hint = 'invalid_input';
    end if;
    perform private.require_module_dependencies(p_store_id, p_module_code);
    insert into public.store_modules (store_id, module_code, source, enabled, price, currency, starts_at, ends_at,
      granted_by)
    values (p_store_id, p_module_code, 'addon', true, v_module.addon_price, coalesce(v_module.addon_currency, 'USD'),
      now(), null, p_user_id)
    on conflict (store_id, module_code, source) do update
      set enabled = true, price = excluded.price, currency = excluded.currency, starts_at = now(), ends_at = null,
          granted_by = excluded.granted_by
      where not public.store_modules.enabled or public.store_modules.ends_at is not null;
  else
    update public.store_modules set enabled = false
    where store_id = p_store_id and module_code = p_module_code and source = 'addon';
  end if;
  return jsonb_build_object('store_id', p_store_id, 'module', p_module_code, 'enabled', p_enabled);
end;
$$;

-- Module given by the superadmin (never billed), optionally until a date.
create function public.set_store_module_grant(
  p_store_id uuid,
  p_module_code text,
  p_enabled boolean,
  p_ends_at timestamptz,
  p_reason text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.modules where code = p_module_code) then
    raise exception 'El módulo no existe' using errcode = 'P0001', hint = 'not_found';
  end if;
  perform 1 from public.subscriptions where store_id = p_store_id for update;
  if not found then
    raise exception 'La tienda no tiene suscripción' using errcode = 'P0001', hint = 'not_found';
  end if;
  if p_enabled then
    if p_ends_at is not null and p_ends_at <= now() then
      raise exception 'La fecha de fin debe ser futura' using errcode = 'P0001', hint = 'invalid_input';
    end if;
    perform private.require_module_dependencies(p_store_id, p_module_code);
    insert into public.store_modules (store_id, module_code, source, enabled, starts_at, ends_at, granted_by, reason)
    values (p_store_id, p_module_code, 'grant', true, now(), p_ends_at, p_user_id, nullif(btrim(p_reason), ''))
    on conflict (store_id, module_code, source) do update
      set enabled = true, starts_at = now(), ends_at = excluded.ends_at, granted_by = excluded.granted_by,
          reason = excluded.reason;
  else
    update public.store_modules set enabled = false
    where store_id = p_store_id and module_code = p_module_code and source = 'grant';
  end if;
  return jsonb_build_object('store_id', p_store_id, 'module', p_module_code, 'enabled', p_enabled);
end;
$$;

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------

create or replace function private.store_limit(p_store_id uuid, p_key text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.limit_overrides ? p_key then (s.limit_overrides ->> p_key)::int
    when pl.value is null then null
    else greatest(pl.value, coalesce((
      select max((sm.limits ->> p_key)::int)
      from public.store_modules sm
      where sm.store_id = p_store_id and sm.limits ? p_key
        and private.store_has_module(p_store_id, sm.module_code) and sm.enabled
        and sm.starts_at <= now() and (sm.ends_at is null or sm.ends_at > now())), 0))
  end
  from public.subscriptions s
  left join public.plan_limits pl on pl.plan_id = s.plan_id and pl.key = p_key
  where s.store_id = p_store_id;
$$;

-- Effective limits of a store ({key: value}; a key that is missing has no limit).
create or replace function public.store_limits(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k.key, private.store_limit(p_store_id, k.key))
    filter (where private.store_limit(p_store_id, k.key) is not null), '{}'::jsonb)
  from public.subscriptions s
  cross join lateral (
    select pl.key from public.plan_limits pl where pl.plan_id = s.plan_id
    union
    select jsonb_object_keys(s.limit_overrides)
  ) k
  where s.store_id = p_store_id;
$$;

create function private.store_staff_count(p_store_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.store_members where store_id = p_store_id and role <> 'owner';
$$;

-- Limits with what is used ({max_products: {limit, used}, max_staff: {limit, used}}; limit null = no limit).
create function public.store_usage(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'max_products', jsonb_build_object(
      'limit', private.store_limit(p_store_id, 'max_products'),
      'used', (select count(*) from public.products p where p.store_id = p_store_id and p.status <> 'archived')),
    'max_staff', jsonb_build_object(
      'limit', private.store_limit(p_store_id, 'max_staff'),
      'used', private.store_staff_count(p_store_id)));
$$;

-- What the public storefront needs to know about the plan (cached with the storefront shell).
create function public.storefront_features(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'multi_currency', private.store_has_module(p_store_id, 'multi_currency'),
    'vouchers', private.store_has_module(p_store_id, 'vouchers'))
  where private.store_is_public(p_store_id);
$$;

-- ---------------------------------------------------------------------------
-- Team (D20). The API checks the caller is owner/admin; these functions check what that role may do.
-- ---------------------------------------------------------------------------

create function private.require_team_actor(p_store_id uuid, p_actor_id uuid, p_target_role public.store_role)
returns public.store_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.store_role;
begin
  select role into v_role from public.store_members where store_id = p_store_id and user_id = p_actor_id;
  if v_role is null or v_role = 'staff' then
    raise exception 'No puedes gestionar el equipo' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if p_target_role = 'owner' then
    raise exception 'El dueño de la tienda no se puede cambiar desde aquí' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if p_target_role = 'admin' and v_role <> 'owner' then
    raise exception 'Solo el dueño puede gestionar administradores' using errcode = 'P0001', hint = 'forbidden';
  end if;
  return v_role;
end;
$$;

create function public.store_member_add(p_store_id uuid, p_user_id uuid, p_role text, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.store_role := p_role::public.store_role;
  v_limit int;
begin
  perform private.require_team_actor(p_store_id, p_actor_id, v_role);
  -- Serialises additions per store (two invitations at the same time cannot both take the last place).
  perform 1 from public.subscriptions where store_id = p_store_id for update;
  if exists (select 1 from public.store_members where store_id = p_store_id and user_id = p_user_id) then
    raise exception 'Esa persona ya es del equipo' using errcode = 'P0001', hint = 'conflict';
  end if;
  v_limit := private.store_limit(p_store_id, 'max_staff');
  if v_limit is not null and private.store_staff_count(p_store_id) >= v_limit then
    raise exception 'Tu plan permite % usuarios de equipo', v_limit using errcode = 'P0001', hint = 'max_staff';
  end if;
  insert into public.store_members (store_id, user_id, role) values (p_store_id, p_user_id, v_role);
  return jsonb_build_object('store_id', p_store_id, 'user_id', p_user_id, 'role', v_role);
end;
$$;

create function public.store_member_update(p_store_id uuid, p_user_id uuid, p_role text, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.store_role;
  v_role public.store_role := p_role::public.store_role;
begin
  select role into v_current from public.store_members where store_id = p_store_id and user_id = p_user_id for update;
  if v_current is null then
    raise exception 'Esa persona no es del equipo' using errcode = 'P0001', hint = 'not_found';
  end if;
  -- Both the current and the new role must be manageable by the actor.
  perform private.require_team_actor(p_store_id, p_actor_id, v_current);
  perform private.require_team_actor(p_store_id, p_actor_id, v_role);
  update public.store_members set role = v_role where store_id = p_store_id and user_id = p_user_id;
  return jsonb_build_object('store_id', p_store_id, 'user_id', p_user_id, 'role', v_role);
end;
$$;

create function public.store_member_remove(p_store_id uuid, p_user_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.store_role;
begin
  select role into v_current from public.store_members where store_id = p_store_id and user_id = p_user_id for update;
  if v_current is null then
    raise exception 'Esa persona no es del equipo' using errcode = 'P0001', hint = 'not_found';
  end if;
  perform private.require_team_actor(p_store_id, p_actor_id, v_current);
  delete from public.store_members where store_id = p_store_id and user_id = p_user_id;
  return jsonb_build_object('store_id', p_store_id, 'user_id', p_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Coupons: the manual discount of an admin order also needs the vouchers module
-- ---------------------------------------------------------------------------

create function private.enforce_manual_discount_module()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'manual' and not private.store_has_module(new.store_id, 'vouchers') then
    raise exception 'Los descuentos manuales necesitan el módulo Cupones' using errcode = 'P0001',
      hint = 'module_not_enabled';
  end if;
  return new;
end;
$$;

create trigger order_discounts_manual_module_trigger
before insert on public.order_discounts
for each row execute function private.enforce_manual_discount_module();

-- ---------------------------------------------------------------------------
-- Vouchers: same engine as phase 4, now behind the vouchers module; price_lines tells the cart about it
-- ---------------------------------------------------------------------------

create or replace function private.voucher_evaluate(
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

create or replace function public.price_lines(p_store_id uuid, p_input jsonb)
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
    'discount_total', v_discount,
    -- The storefront shows the coupon field only with the vouchers module.
    'vouchers_enabled', private.store_has_module(p_store_id, 'vouchers')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- create_store v3: modules through sync_plan_modules (one path) and the first period (trial or one month).
-- ---------------------------------------------------------------------------

create or replace function public.create_store(
  p_name text,
  p_slug text,
  p_owner_id uuid,
  p_base_currency text,
  p_order_prefix text,
  p_whatsapp_phone text,
  p_plan_code text,
  p_trial_days int,
  p_platform_domain text,
  p_created_by uuid
)
returns public.stores
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_store public.stores;
  v_trial_end timestamptz := case when p_trial_days > 0 then now() + make_interval(days => p_trial_days) end;
begin
  select * into v_plan from public.plans where code = p_plan_code;
  if not found then
    raise exception 'Unknown plan %', p_plan_code using errcode = 'P0002';
  end if;

  insert into public.stores (slug, name, base_currency, order_prefix, whatsapp_phone, created_by)
  values (lower(p_slug), p_name, p_base_currency, upper(p_order_prefix), nullif(p_whatsapp_phone, ''), p_created_by)
  returning * into v_store;

  insert into public.store_domains (store_id, domain, type, is_primary, verified_at)
  values (v_store.id, v_store.slug || '.' || lower(p_platform_domain), 'subdomain', true, now());

  insert into public.store_members (store_id, user_id, role)
  values (v_store.id, p_owner_id, 'owner');

  -- The trial is the first period; without a trial the first month starts now (billed by billing_tick).
  insert into public.subscriptions (store_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
  values (
    v_store.id,
    v_plan.id,
    case when v_trial_end is not null then 'trialing' else 'active' end::public.subscription_status,
    v_trial_end,
    now(),
    coalesce(v_trial_end, now() + interval '1 month')
  );

  perform private.sync_plan_modules(v_store.id);

  insert into public.store_currencies (store_id, currency, is_base, sells, rate_to_base)
  values (v_store.id, v_store.base_currency, true, true, 1);

  insert into public.warehouses (store_id, name, is_default)
  values (v_store.id, 'Principal', true);

  return v_store;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function private.sync_plan_modules(uuid), private.require_module_dependencies(uuid, text),
  private.store_staff_count(uuid), private.require_team_actor(uuid, uuid, public.store_role),
  private.enforce_manual_discount_module() from public;
grant execute on function private.sync_plan_modules(uuid), private.require_module_dependencies(uuid, text),
  private.store_staff_count(uuid), private.require_team_actor(uuid, uuid, public.store_role) to service_role;

revoke all on function public.change_plan(uuid, text, text, uuid),
  public.set_store_addon(uuid, text, boolean, uuid),
  public.set_store_module_grant(uuid, text, boolean, timestamptz, text, uuid),
  public.store_usage(uuid),
  public.store_member_add(uuid, uuid, text, uuid),
  public.store_member_update(uuid, uuid, text, uuid),
  public.store_member_remove(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.change_plan(uuid, text, text, uuid),
  public.set_store_addon(uuid, text, boolean, uuid),
  public.set_store_module_grant(uuid, text, boolean, timestamptz, text, uuid),
  public.store_usage(uuid),
  public.store_member_add(uuid, uuid, text, uuid),
  public.store_member_update(uuid, uuid, text, uuid),
  public.store_member_remove(uuid, uuid, uuid)
  to service_role;

revoke all on function public.storefront_features(uuid) from public;
grant execute on function public.storefront_features(uuid) to anon, authenticated, service_role;
