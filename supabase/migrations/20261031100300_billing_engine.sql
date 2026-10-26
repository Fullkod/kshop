-- Phase 5: billing engine (PRP-5 D8–D19 with Roberto's answers: USD, cash in person, no receipts, no proration).
--   * subscription_quote: the one price calculation (plan, add-ons, best discount grant) used by invoices and both
--     admin screens. price_lock and price_override are the price per billing interval of the subscription; add-ons
--     cost 10 months on a yearly plan (same 2 free months as the plans).
--   * Invoices are snapshots (lines copied); one per store and period; numbered KS-YYYY-NNNN.
--   * billing_tick(p_now) runs daily (pg_cron) and is idempotent: rolls periods, issues invoices ahead, reminds,
--     marks past_due and suspends after the grace days. p_now lets the tests travel in time.
--   * Paying (or voiding) the overdue invoices reactivates what the billing suspended; a manual suspension stays.
--   * Billing notices go to the store WhatsApp through the platform outbox, with or without whatsapp_notifications.
-- Errors: P0001 with a Spanish message and a hint (not_found, invalid_input, invalid_transition).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.billing_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((private.platform_setting(p_key) #>> '{}')::int, p_default);
$$;

create function private.havana_date(p_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_at at time zone 'America/Havana', 'DD/MM/YYYY');
$$;

create function private.period_end(p_start timestamptz, p_interval public.billing_interval)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select p_start + case p_interval when 'year' then interval '1 year' else interval '1 month' end;
$$;

create function private.next_invoice_number(p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year int := extract(year from p_at at time zone 'America/Havana')::int;
  v_number int;
begin
  insert into private.platform_invoice_counters as c (year, last_number) values (v_year, 1)
  on conflict (year) do update set last_number = c.last_number + 1
  returning last_number into v_number;
  return format('KS-%s-%s', v_year, lpad(v_number::text, 4, '0'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Billing notices (platform templates, audience store; the store cannot override them)
-- ---------------------------------------------------------------------------

insert into public.whatsapp_templates (store_id, event, audience, body) values
  (null, 'billing_invoice_issued', 'store',
   e'Tu factura *{{factura}}* de {{total}} ({{plan}}, {{periodo}}) vence el {{vence}}.\n{{instrucciones}}'),
  (null, 'billing_invoice_reminder', 'store',
   e'Recordatorio: la factura *{{factura}}* de {{total}} vence el {{vence}}.\n{{instrucciones}}'),
  (null, 'billing_past_due', 'store',
   e'La factura *{{factura}}* de {{total}} venció. Si no se paga antes del {{suspension}}, la tienda se suspenderá.\n{{instrucciones}}'),
  (null, 'billing_store_suspended', 'store',
   e'Tu tienda se suspendió por falta de pago: los clientes no pueden comprar hasta que se pague la factura *{{factura}}* ({{total}}). Tus datos están a salvo.\n{{instrucciones}}'),
  (null, 'billing_payment_received', 'store', e'Recibimos tu pago de {{pagado}} de la factura *{{factura}}*. ¡Gracias!'),
  (null, 'billing_trial_ending', 'store',
   e'Tu prueba gratis de Kshop termina el {{fin_prueba}}. Después: {{plan}}, {{total}}.\n{{instrucciones}}')
on conflict do nothing;

-- Billing templates are the platform's: the store's staff does not see them (only the superadmin).
drop policy "whatsapp_templates: platform defaults and own store" on public.whatsapp_templates;
create policy "whatsapp_templates: platform defaults and own store" on public.whatsapp_templates for select
to authenticated
using ((store_id is null and event not like 'billing\_%' and exists (select 1 from private.my_store_ids()))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create function private.queue_billing_notice(p_store_id uuid, p_event text, p_vars jsonb, p_dedupe_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := coalesce(private.platform_setting('whatsapp_mode') #>> '{}', 'off');
  v_support text := private.platform_setting('support_whatsapp') #>> '{}';
  v_store public.stores;
  v_body text;
begin
  if v_mode = 'off' then
    return;
  end if;
  select * into v_store from public.stores where id = p_store_id;
  if v_store.whatsapp_phone is null then
    return;
  end if;
  select t.body into v_body from public.whatsapp_templates t
  where t.store_id is null and t.event = p_event and t.audience = 'store' and t.is_active;
  if v_body is null then
    return;
  end if;
  insert into public.notification_log (store_id, audience, event, recipient, message, status, sent_at, dedupe_key)
  values (p_store_id, 'store', p_event, v_store.whatsapp_phone,
    '*Kshop · ' || private.whatsapp_escape(v_store.name) || e'*\n'
      || private.render_whatsapp_template(v_body, p_vars || jsonb_build_object(
        'instrucciones', private.platform_setting('billing_instructions') #>> '{}'))
      || e'\n\n_Aviso de Kshop' || coalesce('. Soporte: +' || regexp_replace(v_support, '\D', '', 'g'), '') || '._',
    case when v_mode = 'live' then 'pending' else 'simulated' end::public.notification_status,
    case when v_mode = 'live' then null else now() end,
    p_dedupe_key)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
exception when others then
  -- A notice never breaks billing.
  null;
end;
$$;

create function private.invoice_notice_vars(p_invoice_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'factura', i.number,
    'total', private.money_text(i.total, i.currency::text),
    'pagado', private.money_text(i.amount_paid, i.currency::text),
    'plan', coalesce((select l.description from public.platform_invoice_lines l
      where l.invoice_id = i.id and l.kind = 'plan' limit 1), 'Kshop'),
    'periodo', private.havana_date(i.period_start) || ' – ' || private.havana_date(i.period_end),
    'vence', private.havana_date(i.due_at),
    'suspension', private.havana_date(i.due_at + make_interval(days => private.billing_int('grace_days', 7))))
  from public.platform_invoices i where i.id = p_invoice_id;
$$;

-- ---------------------------------------------------------------------------
-- Quote (D10)
-- ---------------------------------------------------------------------------

create function public.subscription_quote(p_store_id uuid, p_period_start timestamptz default null)
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

  select g.value, g.id into v_lock, v_lock_id from public.subscription_grants g
  where g.store_id = p_store_id and g.type = 'price_lock' and g.revoked_at is null
    and g.starts_at <= v_start and (g.ends_at is null or g.ends_at > v_start)
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
    and g.starts_at <= v_start and (g.ends_at is null or g.ends_at > v_start)
  order by g.value desc, g.created_at limit 1;
  if v_pct is not null then
    v_discount := round(v_subtotal * v_pct / 100, 2);
    v_lines := v_lines || jsonb_build_object('kind', 'discount', 'module_code', null, 'grant_id', v_pct_id,
      'description', format('Descuento del %s %%', trim_scale(v_pct)) || coalesce(' · ' || v_pct_reason, ''),
      'quantity', 1, 'unit_amount', -v_discount, 'amount', -v_discount);
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
-- Invoices (D11) and payments (D12)
-- ---------------------------------------------------------------------------

-- Issues the invoice of a period (or returns the open one). Caller holds the subscription lock.
create function private.issue_invoice(p_store_id uuid, p_period_start timestamptz, p_actor uuid, p_now timestamptz)
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
  if v_total > 0 then
    perform private.queue_billing_notice(p_store_id, 'billing_invoice_issued', private.invoice_notice_vars(v_id),
      'invoice:' || v_id || ':issued');
  end if;
  return v_id;
end;
$$;

-- After a payment or a void: no overdue invoice left -> active again, and the store reopens if billing closed it.
create function private.refresh_billing_state(p_store_id uuid, p_now timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.subscription_status;
begin
  select status into v_status from public.subscriptions where store_id = p_store_id for update;
  if v_status not in ('past_due', 'suspended') then
    return false;
  end if;
  if exists (select 1 from public.platform_invoices
             where store_id = p_store_id and status = 'pending' and due_at <= p_now) then
    return false;
  end if;
  update public.subscriptions set status = 'active' where store_id = p_store_id;
  update public.stores set status = 'active', suspended_reason = null
  where id = p_store_id and status = 'suspended' and suspended_reason = 'billing';
  return true;
end;
$$;

-- Superadmin: issue now the next invoice not issued yet (the current period when it has none, else the next one).
create function public.platform_invoice_issue(p_store_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_start timestamptz;
  v_id uuid;
begin
  select * into v_sub from public.subscriptions where store_id = p_store_id for update;
  if not found then
    raise exception 'La tienda no tiene suscripción' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_sub.status in ('comped', 'cancelled') then
    raise exception 'Esta tienda no se factura (cortesía o cancelada)' using errcode = 'P0001', hint = 'invalid_transition';
  end if;
  v_start := case
    when v_sub.status <> 'trialing' and not exists (select 1 from public.platform_invoices i where i.store_id = p_store_id
      and i.period_start = v_sub.current_period_start and i.status <> 'void') then v_sub.current_period_start
    else v_sub.current_period_end end;
  v_id := private.issue_invoice(p_store_id, v_start, p_actor, now());
  return jsonb_build_object('store_id', p_store_id, 'invoice_id', v_id);
end;
$$;

-- Superadmin: a manual line (positive charge or negative credit) on an open invoice.
create function public.platform_invoice_adjust(p_invoice_id uuid, p_description text, p_amount numeric, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.platform_invoices;
begin
  select * into v_inv from public.platform_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'La factura no existe' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'Solo se ajustan facturas pendientes' using errcode = 'P0001', hint = 'invalid_transition';
  end if;
  if coalesce(btrim(p_description), '') = '' or p_amount is null or p_amount = 0
     or v_inv.subtotal + p_amount < v_inv.discount then
    raise exception 'El ajuste no es válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  insert into public.platform_invoice_lines (store_id, invoice_id, kind, description, quantity, unit_amount, amount,
    sort_order)
  values (v_inv.store_id, v_inv.id, 'adjustment', btrim(p_description), 1, round(p_amount, 2), round(p_amount, 2),
    (select coalesce(max(sort_order), 0) + 1 from public.platform_invoice_lines where invoice_id = v_inv.id));
  update public.platform_invoices
  set subtotal = subtotal + round(p_amount, 2), total = subtotal + round(p_amount, 2) - discount,
      status = case when amount_paid >= subtotal + round(p_amount, 2) - discount then 'paid' else status end,
      paid_at = case when amount_paid >= subtotal + round(p_amount, 2) - discount then now() else paid_at end
  where id = v_inv.id;
  perform private.refresh_billing_state(v_inv.store_id, now());
  return jsonb_build_object('store_id', v_inv.store_id, 'invoice_id', v_inv.id);
end;
$$;

create function public.platform_invoice_void(p_invoice_id uuid, p_reason text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.platform_invoices;
begin
  select * into v_inv from public.platform_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'La factura no existe' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_inv.status <> 'pending' or v_inv.amount_paid > 0 then
    raise exception 'Solo se anulan facturas pendientes y sin pagos' using errcode = 'P0001', hint = 'invalid_transition';
  end if;
  update public.platform_invoices set status = 'void', void_reason = nullif(btrim(p_reason), '') where id = v_inv.id;
  perform private.refresh_billing_state(v_inv.store_id, now());
  return jsonb_build_object('store_id', v_inv.store_id, 'invoice_id', v_inv.id);
end;
$$;

-- Payment received in person (USD, cash by default). The invoice is paid when the payments cover its total.
create function public.record_platform_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_notes text,
  p_paid_at timestamptz,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.platform_invoices;
  v_payment_id uuid;
  v_reactivated boolean;
begin
  select * into v_inv from public.platform_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'La factura no existe' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'Esta factura no está pendiente de pago' using errcode = 'P0001', hint = 'invalid_transition';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe debe ser mayor que cero' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  insert into public.platform_payments (store_id, invoice_id, amount, method, reference, notes, paid_at, recorded_by)
  values (v_inv.store_id, v_inv.id, round(p_amount, 2), coalesce(p_method, 'cash')::public.payment_method,
    nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''), coalesce(p_paid_at, now()), p_actor)
  returning id into v_payment_id;
  update public.platform_invoices
  set amount_paid = amount_paid + round(p_amount, 2),
      status = (case when amount_paid + round(p_amount, 2) >= total then 'paid' else 'pending' end)::public.invoice_status,
      paid_at = case when amount_paid + round(p_amount, 2) >= total then coalesce(p_paid_at, now()) end
  where id = v_inv.id
  returning * into v_inv;
  -- Overdue is judged at the moment of the payment.
  v_reactivated := private.refresh_billing_state(v_inv.store_id, coalesce(p_paid_at, now()));
  perform private.queue_billing_notice(v_inv.store_id, 'billing_payment_received',
    private.invoice_notice_vars(v_inv.id) || jsonb_build_object('pagado', private.money_text(round(p_amount, 2), 'USD')),
    'payment:' || v_payment_id);
  return jsonb_build_object('store_id', v_inv.store_id, 'invoice_id', v_inv.id, 'status', v_inv.status,
    'reactivated', v_reactivated);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants (D9) and subscription settings
-- ---------------------------------------------------------------------------

-- free_days moves the end of the current period (and of the trial) and the periods of invoices already issued for
-- later periods; discount_percent and price_lock apply to every invoice while in force.
create function public.subscription_add_grant(
  p_store_id uuid,
  p_type text,
  p_value numeric,
  p_reason text,
  p_ends_at timestamptz,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_id uuid;
  v_days interval;
begin
  select * into v_sub from public.subscriptions where store_id = p_store_id for update;
  if not found then
    raise exception 'La tienda no tiene suscripción' using errcode = 'P0001', hint = 'not_found';
  end if;
  if p_ends_at is not null and p_ends_at <= now() then
    raise exception 'La fecha de fin debe ser futura' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  insert into public.subscription_grants (store_id, type, value, reason, ends_at, granted_by)
  values (p_store_id, p_type::public.grant_type, p_value, nullif(btrim(p_reason), ''),
    case when p_type = 'free_days' then null else p_ends_at end, p_actor)
  returning id into v_id;

  if p_type = 'free_days' then
    v_days := make_interval(days => p_value::int);
    update public.platform_invoices
    set period_start = period_start + v_days, period_end = period_end + v_days
    where store_id = p_store_id and status <> 'void' and period_start >= v_sub.current_period_end;
    update public.subscriptions
    set current_period_end = current_period_end + v_days,
        trial_ends_at = case when status = 'trialing' then trial_ends_at + v_days else trial_ends_at end
    where store_id = p_store_id;
  end if;
  return jsonb_build_object('store_id', p_store_id, 'grant_id', v_id);
end;
$$;

-- Revoking stops a discount or a frozen price for the next invoices (days already given stay given).
create function public.subscription_revoke_grant(p_grant_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
begin
  update public.subscription_grants set revoked_at = now()
  where id = p_grant_id and revoked_at is null
  returning store_id into v_store_id;
  if v_store_id is null then
    raise exception 'El regalo no existe o ya se quitó' using errcode = 'P0001', hint = 'not_found';
  end if;
  return jsonb_build_object('store_id', v_store_id, 'grant_id', p_grant_id);
end;
$$;

-- Superadmin settings of a subscription. Keys (all optional): price_override (number|null), limit_overrides
-- ({max_products?, max_staff?}), founder, notes, cancel_at (timestamptz|null), comped (true: never billed;
-- false: billed again from now).
create function public.subscription_update(p_store_id uuid, p_patch jsonb, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  select * into v_sub from public.subscriptions where store_id = p_store_id for update;
  if not found then
    raise exception 'La tienda no tiene suscripción' using errcode = 'P0001', hint = 'not_found';
  end if;
  update public.subscriptions set
    price_override = case when p_patch ? 'price_override' then (p_patch ->> 'price_override')::numeric else price_override end,
    limit_overrides = case when p_patch ? 'limit_overrides' then coalesce(p_patch -> 'limit_overrides', '{}') else limit_overrides end,
    founder = case when p_patch ? 'founder' then (p_patch ->> 'founder')::boolean else founder end,
    notes = case when p_patch ? 'notes' then nullif(btrim(p_patch ->> 'notes'), '') else notes end,
    cancel_at = case when p_patch ? 'cancel_at' then (p_patch ->> 'cancel_at')::timestamptz else cancel_at end,
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
-- Daily cycle (D14, D15)
-- ---------------------------------------------------------------------------

create function public.billing_tick(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead interval := make_interval(days => private.billing_int('invoice_lead_days', 5));
  v_grace interval := make_interval(days => private.billing_int('grace_days', 7));
  v_trial_notice interval := make_interval(days => private.billing_int('trial_reminder_days', 3));
  v_sub public.subscriptions;
  v_overdue public.platform_invoices;
  v_inv record;
  v_issued int := 0;
  v_past_due int := 0;
  v_suspended int := 0;
begin
  for v_sub in
    select * from public.subscriptions
    where status not in ('comped', 'cancelled')
    order by store_id
    for update skip locked
  loop
    -- Cancellation date reached: no more invoices, store closed (it is not a billing suspension).
    if v_sub.cancel_at is not null and v_sub.cancel_at <= p_now then
      update public.subscriptions set status = 'cancelled' where store_id = v_sub.store_id;
      update public.stores set status = 'suspended', suspended_reason = 'manual'
      where id = v_sub.store_id and status = 'active';
      continue;
    end if;

    -- Roll finished periods (the trial ends into the first paid period).
    while v_sub.current_period_end <= p_now loop
      update public.subscriptions
      set current_period_start = current_period_end,
          current_period_end = private.period_end(current_period_end, billing_interval),
          status = case when status = 'trialing' then 'active' else status end
      where store_id = v_sub.store_id
      returning * into v_sub;
    end loop;

    -- The current period (a store without trial) and the next one, invoice_lead_days ahead.
    if v_sub.status <> 'trialing' and not exists (select 1 from public.platform_invoices i
        where i.store_id = v_sub.store_id and i.period_start = v_sub.current_period_start and i.status <> 'void') then
      perform private.issue_invoice(v_sub.store_id, v_sub.current_period_start, null, p_now);
      v_issued := v_issued + 1;
    end if;
    if p_now >= v_sub.current_period_end - v_lead and not exists (select 1 from public.platform_invoices i
        where i.store_id = v_sub.store_id and i.period_start = v_sub.current_period_end and i.status <> 'void') then
      perform private.issue_invoice(v_sub.store_id, v_sub.current_period_end, null, p_now);
      v_issued := v_issued + 1;
    end if;

    -- Reminders: end of the trial, the day before an invoice is due.
    if v_sub.status = 'trialing' and v_sub.trial_ends_at - v_trial_notice <= p_now then
      perform private.queue_billing_notice(v_sub.store_id, 'billing_trial_ending',
        coalesce(private.invoice_notice_vars((select i.id from public.platform_invoices i
          where i.store_id = v_sub.store_id and i.period_start = v_sub.current_period_end and i.status <> 'void')),
          jsonb_build_object('total', private.money_text((public.subscription_quote(v_sub.store_id) ->> 'total')::numeric, 'USD'),
            'plan', (select 'Plan ' || p.name from public.plans p where p.id = v_sub.plan_id)))
          || jsonb_build_object('fin_prueba', private.havana_date(v_sub.trial_ends_at)),
        'trial:' || v_sub.store_id || ':' || v_sub.trial_ends_at::date);
    end if;
    for v_inv in
      select i.id from public.platform_invoices i
      where i.store_id = v_sub.store_id and i.status = 'pending' and i.due_at > p_now
        and i.due_at - interval '1 day' <= p_now
    loop
      perform private.queue_billing_notice(v_sub.store_id, 'billing_invoice_reminder',
        private.invoice_notice_vars(v_inv.id), 'invoice:' || v_inv.id || ':reminder');
    end loop;

    -- Overdue: past_due at once, suspended after the grace days.
    select * into v_overdue from public.platform_invoices i
    where i.store_id = v_sub.store_id and i.status = 'pending' and i.due_at <= p_now
    order by i.due_at limit 1;
    if found then
      if v_sub.status in ('active', 'trialing') then
        update public.subscriptions set status = 'past_due' where store_id = v_sub.store_id returning * into v_sub;
        perform private.queue_billing_notice(v_sub.store_id, 'billing_past_due',
          private.invoice_notice_vars(v_overdue.id), 'invoice:' || v_overdue.id || ':past_due');
        v_past_due := v_past_due + 1;
      end if;
      if v_sub.status = 'past_due' and v_overdue.due_at + v_grace <= p_now then
        update public.subscriptions set status = 'suspended' where store_id = v_sub.store_id;
        update public.stores set status = 'suspended', suspended_reason = 'billing'
        where id = v_sub.store_id and status = 'active';
        perform private.queue_billing_notice(v_sub.store_id, 'billing_store_suspended',
          private.invoice_notice_vars(v_overdue.id), 'invoice:' || v_overdue.id || ':suspended');
        v_suspended := v_suspended + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('issued', v_issued, 'past_due', v_past_due, 'suspended', v_suspended);
end;
$$;

-- ≈ 06:00 in Havana.
select cron.schedule('kshop-billing-tick', '0 11 * * *', 'select public.billing_tick()');

-- ---------------------------------------------------------------------------
-- Privileges: server only
-- ---------------------------------------------------------------------------

revoke all on function private.billing_int(text, int), private.havana_date(timestamptz),
  private.period_end(timestamptz, public.billing_interval), private.next_invoice_number(timestamptz),
  private.queue_billing_notice(uuid, text, jsonb, text), private.invoice_notice_vars(uuid),
  private.issue_invoice(uuid, timestamptz, uuid, timestamptz), private.refresh_billing_state(uuid, timestamptz)
  from public;
grant execute on function private.billing_int(text, int), private.havana_date(timestamptz),
  private.period_end(timestamptz, public.billing_interval), private.next_invoice_number(timestamptz),
  private.queue_billing_notice(uuid, text, jsonb, text), private.invoice_notice_vars(uuid),
  private.issue_invoice(uuid, timestamptz, uuid, timestamptz), private.refresh_billing_state(uuid, timestamptz)
  to service_role;

revoke all on function public.subscription_quote(uuid, timestamptz), public.platform_invoice_issue(uuid, uuid),
  public.platform_invoice_adjust(uuid, text, numeric, uuid), public.platform_invoice_void(uuid, text, uuid),
  public.record_platform_payment(uuid, numeric, text, text, text, timestamptz, uuid),
  public.subscription_add_grant(uuid, text, numeric, text, timestamptz, uuid),
  public.subscription_revoke_grant(uuid, uuid), public.subscription_update(uuid, jsonb, uuid),
  public.billing_tick(timestamptz)
  from public, anon, authenticated;
grant execute on function public.subscription_quote(uuid, timestamptz), public.platform_invoice_issue(uuid, uuid),
  public.platform_invoice_adjust(uuid, text, numeric, uuid), public.platform_invoice_void(uuid, text, uuid),
  public.record_platform_payment(uuid, numeric, text, text, text, timestamptz, uuid),
  public.subscription_add_grant(uuid, text, numeric, text, timestamptz, uuid),
  public.subscription_revoke_grant(uuid, uuid), public.subscription_update(uuid, jsonb, uuid),
  public.billing_tick(timestamptz)
  to service_role;
