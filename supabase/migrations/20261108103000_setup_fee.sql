-- KSH0023: the one-time setup fee (decision 31: creating the store and loading its first data) goes by itself on the
-- first invoice of each new store, so the owner sees one total and nobody has to remember the manual adjustment.
--   * subscriptions.setup_fee: what is still owed (null = nothing). Set when the superadmin creates the store, from
--     the platform setting setup_fee_usd (5 USD); stores created before this migration owe nothing.
--   * subscription_quote adds it as one line (no percentage discount on it) until an invoice carries it;
--     setup_fee_invoice_id points to that invoice. Voiding that invoice puts the fee on the next one.
--   * subscription_update accepts setup_fee while it has not been invoiced.

alter table public.subscriptions
  add column setup_fee numeric(12, 2) check (setup_fee > 0),
  add column setup_fee_invoice_id uuid references public.platform_invoices (id) on delete set null;

create index subscriptions_setup_fee_invoice_idx on public.subscriptions (setup_fee_invoice_id);

insert into private.platform_config (key, value) values ('setup_fee_usd', '5') on conflict (key) do nothing;

-- True when the fee of this subscription is already on a live (pending or paid) invoice.
create function private.setup_fee_invoiced(p_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_invoice_id is not null
    and exists (select 1 from public.platform_invoices i where i.id = p_invoice_id and i.status <> 'void');
$$;

revoke all on function private.setup_fee_invoiced(uuid) from public;
grant execute on function private.setup_fee_invoiced(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Quote: same as 20261031100300 plus the setup fee line (marked "setup": true, not stored)
-- ---------------------------------------------------------------------------

create or replace function public.subscription_quote(p_store_id uuid, p_period_start timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_plan public.plans;
  v_start timestamptz;
  v_lock numeric;
  v_lock_id uuid;
  v_price numeric;
  v_months int;
  v_lines jsonb := '[]';
  v_subtotal numeric;
  v_addon record;
  v_pct numeric;
  v_pct_id uuid;
  v_pct_reason text;
  v_discount numeric := 0;
begin
  select * into v_sub from public.subscriptions where store_id = p_store_id;
  if not found then
    raise exception 'La tienda no tiene suscripción' using errcode = 'P0001', hint = 'not_found';
  end if;
  select * into v_plan from public.plans where id = v_sub.plan_id;
  v_start := coalesce(p_period_start, v_sub.current_period_end, now());
  v_months := case v_sub.billing_interval when 'year' then 10 else 1 end;
  -- A grant counts when it is in force at the start of the period or already when the invoice is made (a founder
  -- price given right after the sign-up applies to the first month).

  select g.value, g.id into v_lock, v_lock_id from public.subscription_grants g
  where g.store_id = p_store_id and g.type = 'price_lock' and g.revoked_at is null
    and g.starts_at <= greatest(v_start, now()) and (g.ends_at is null or g.ends_at > v_start)
  order by g.created_at desc limit 1;
  v_price := coalesce(v_lock, v_sub.price_override,
    case v_sub.billing_interval when 'year' then v_plan.yearly_price end, v_plan.price * v_months);
  v_lines := v_lines || jsonb_build_object('kind', 'plan', 'module_code', null, 'grant_id', v_lock_id,
    'description', format('Plan %s (%s)%s', v_plan.name,
      case v_sub.billing_interval when 'year' then 'anual' else 'mensual' end,
      case when v_lock is not null then ' · precio congelado' else '' end),
    'quantity', 1, 'unit_amount', v_price, 'amount', v_price);
  v_subtotal := v_price;

  -- Add-ons the plan does not include, at the price they were bought at (no proration: whole periods).
  for v_addon in
    select sm.module_code, m.name, sm.price
    from public.store_modules sm join public.modules m on m.code = sm.module_code
    where sm.store_id = p_store_id and sm.source = 'addon' and sm.enabled and sm.price is not null
      and (sm.ends_at is null or sm.ends_at > v_start)
      and not exists (select 1 from public.plan_modules pm where pm.plan_id = v_sub.plan_id and pm.module_code = sm.module_code)
    order by m.sort_order, m.code
  loop
    v_lines := v_lines || jsonb_build_object('kind', 'addon', 'module_code', v_addon.module_code, 'grant_id', null,
      'description', 'Módulo ' || v_addon.name, 'quantity', v_months, 'unit_amount', v_addon.price,
      'amount', round(v_addon.price * v_months, 2));
    v_subtotal := v_subtotal + round(v_addon.price * v_months, 2);
  end loop;

  -- The best discount in force (they do not add up).
  select g.value, g.id, g.reason into v_pct, v_pct_id, v_pct_reason from public.subscription_grants g
  where g.store_id = p_store_id and g.type = 'discount_percent' and g.revoked_at is null
    and g.starts_at <= greatest(v_start, now()) and (g.ends_at is null or g.ends_at > v_start)
  order by g.value desc, g.created_at limit 1;
  if v_pct is not null then
    v_discount := round(v_subtotal * v_pct / 100, 2);
    v_lines := v_lines || jsonb_build_object('kind', 'discount', 'module_code', null, 'grant_id', v_pct_id,
      'description', format('Descuento del %s %%', trim_scale(v_pct)) || coalesce(' · ' || v_pct_reason, ''),
      'quantity', 1, 'unit_amount', -v_discount, 'amount', -v_discount);
  end if;

  -- KSH0023: the setup fee, once, after the discount (a percentage never applies to it).
  if v_sub.setup_fee is not null and not private.setup_fee_invoiced(v_sub.setup_fee_invoice_id) then
    v_lines := v_lines || jsonb_build_object('kind', 'adjustment', 'module_code', null, 'grant_id', null,
      'description', 'Puesta en marcha (crear la tienda y cargar los datos), una sola vez',
      'quantity', 1, 'unit_amount', v_sub.setup_fee, 'amount', v_sub.setup_fee, 'setup', true);
    v_subtotal := v_subtotal + v_sub.setup_fee;
  end if;

  return jsonb_build_object(
    'store_id', p_store_id,
    'plan', v_plan.code,
    'interval', v_sub.billing_interval,
    'period_start', v_start,
    'period_end', private.period_end(v_start, v_sub.billing_interval),
    'currency', 'USD',
    'lines', v_lines,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'total', v_subtotal - v_discount,
    'comped', v_sub.status = 'comped');
end;
$$;

-- ---------------------------------------------------------------------------
-- Issue: same as 20261031100300 plus remembering which invoice carries the setup fee
-- ---------------------------------------------------------------------------

create or replace function private.issue_invoice(p_store_id uuid, p_period_start timestamptz, p_actor uuid, p_now timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_quote jsonb;
  v_total numeric;
begin
  select id into v_id from public.platform_invoices
  where store_id = p_store_id and period_start = p_period_start and status <> 'void';
  if found then
    return v_id;
  end if;
  v_quote := public.subscription_quote(p_store_id, p_period_start);
  v_total := (v_quote ->> 'total')::numeric;
  insert into public.platform_invoices (store_id, number, period_start, period_end, subtotal, discount, total, status,
    issued_at, due_at, paid_at, created_by)
  values (p_store_id, private.next_invoice_number(p_now), p_period_start, (v_quote ->> 'period_end')::timestamptz,
    (v_quote ->> 'subtotal')::numeric, (v_quote ->> 'discount')::numeric, v_total,
    case when v_total = 0 then 'paid' else 'pending' end::public.invoice_status,
    p_now, p_now + make_interval(days => private.billing_int('invoice_due_days', 7)),
    case when v_total = 0 then p_now end, p_actor)
  returning id into v_id;
  insert into public.platform_invoice_lines (store_id, invoice_id, kind, module_code, grant_id, description, quantity,
    unit_amount, amount, sort_order)
  select p_store_id, v_id, (l.item ->> 'kind')::public.invoice_line_kind, l.item ->> 'module_code',
    (l.item ->> 'grant_id')::uuid, l.item ->> 'description', (l.item ->> 'quantity')::numeric,
    (l.item ->> 'unit_amount')::numeric, (l.item ->> 'amount')::numeric, l.n
  from jsonb_array_elements(v_quote -> 'lines') with ordinality as l(item, n);
  if exists (select 1 from jsonb_array_elements(v_quote -> 'lines') l(item) where (l.item ->> 'setup')::boolean) then
    update public.subscriptions set setup_fee_invoice_id = v_id where store_id = p_store_id;
  end if;
  if v_total > 0 then
    perform private.queue_billing_notice(p_store_id, 'billing_invoice_issued', private.invoice_notice_vars(v_id),
      'invoice:' || v_id || ':issued');
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Subscription settings: same as 20261031100300 plus setup_fee (number|null) while not invoiced
-- ---------------------------------------------------------------------------

create or replace function public.subscription_update(p_store_id uuid, p_patch jsonb, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_fee numeric;
begin
  select * into v_sub from public.subscriptions where store_id = p_store_id for update;
  if not found then
    raise exception 'La tienda no tiene suscripción' using errcode = 'P0001', hint = 'not_found';
  end if;
  if p_patch ? 'setup_fee' then
    v_fee := nullif((p_patch ->> 'setup_fee')::numeric, 0);
    if v_fee < 0 then
      raise exception 'La puesta en marcha no es válida' using errcode = 'P0001', hint = 'invalid_input';
    end if;
    if v_fee is distinct from v_sub.setup_fee and private.setup_fee_invoiced(v_sub.setup_fee_invoice_id) then
      raise exception 'La puesta en marcha ya está en una factura; ajústala en esa factura'
        using errcode = 'P0001', hint = 'invalid_transition';
    end if;
  end if;
  update public.subscriptions set
    price_override = case when p_patch ? 'price_override' then (p_patch ->> 'price_override')::numeric else price_override end,
    limit_overrides = case when p_patch ? 'limit_overrides' then coalesce(p_patch -> 'limit_overrides', '{}') else limit_overrides end,
    founder = case when p_patch ? 'founder' then (p_patch ->> 'founder')::boolean else founder end,
    notes = case when p_patch ? 'notes' then nullif(btrim(p_patch ->> 'notes'), '') else notes end,
    cancel_at = case when p_patch ? 'cancel_at' then (p_patch ->> 'cancel_at')::timestamptz else cancel_at end,
    setup_fee = case when p_patch ? 'setup_fee' then v_fee else setup_fee end,
    status = case
      when (p_patch ->> 'comped')::boolean is true then 'comped'
      when (p_patch ->> 'comped')::boolean is false and status = 'comped' then 'active'
      else status end
  where store_id = p_store_id;
  -- Leaving comped starts a fresh period now (billed by the next tick).
  if (p_patch ->> 'comped')::boolean is false and v_sub.status = 'comped' then
    update public.subscriptions
    set current_period_start = now(), current_period_end = private.period_end(now(), billing_interval)
    where store_id = p_store_id;
  end if;
  return jsonb_build_object('store_id', p_store_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform settings: same as 20261031100500 plus setup_fee_usd (0 = none)
-- ---------------------------------------------------------------------------

create or replace function public.platform_billing_get()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'invoice_lead_days', private.billing_int('invoice_lead_days', 5),
    'invoice_due_days', private.billing_int('invoice_due_days', 7),
    'grace_days', private.billing_int('grace_days', 7),
    'trial_reminder_days', private.billing_int('trial_reminder_days', 3),
    'default_trial_days', private.billing_int('default_trial_days', 30),
    'setup_fee_usd', coalesce((private.platform_setting('setup_fee_usd') #>> '{}')::numeric, 0),
    'billing_instructions', private.platform_setting('billing_instructions') #>> '{}',
    'support_whatsapp', private.platform_setting('support_whatsapp') #>> '{}');
$$;

create or replace function public.platform_billing_set(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  foreach v_key in array array['invoice_lead_days', 'invoice_due_days', 'grace_days', 'trial_reminder_days',
    'default_trial_days', 'setup_fee_usd', 'billing_instructions', 'support_whatsapp'] loop
    if p_input ? v_key then
      insert into private.platform_config (key, value, updated_at) values (v_key, p_input -> v_key, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
    end if;
  end loop;
  return public.platform_billing_get();
end;
$$;
