-- KSH0002: an order can be paid in several currencies ("50 USD and the rest in CUP"), at a rate agreed on each payment.
-- amount/currency stay what entered the till; applied_amount is what it settles of the order, in the order currency,
-- frozen at the agreed rate so the balance never depends on today's rates. Change is money leaving the till.

alter table public.payments
  add column applied_amount numeric(12, 2),
  -- Units of the order currency per 1 of the payment currency.
  add column rate_to_order numeric(18, 8) not null default 1 check (rate_to_order > 0),
  add column change_amount numeric(12, 2) check (change_amount is null or change_amount > 0),
  add column change_currency public.currency_code,
  add constraint payments_change_complete check ((change_amount is null) = (change_currency is null));
alter table public.refunds add column applied_amount numeric(12, 2);

update public.payments set applied_amount = amount;
update public.refunds set applied_amount = amount;

alter table public.payments
  alter column applied_amount set not null,
  add constraint payments_applied_not_negative check (applied_amount >= 0);
alter table public.refunds
  alter column applied_amount set not null,
  add constraint refunds_applied_not_negative check (applied_amount >= 0);

-- Whoever inserts without it (mark as paid, legacy import) records money in the order currency.
create function private.default_applied_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.applied_amount := coalesce(new.applied_amount, new.amount);
  return new;
end;
$$;
revoke all on function private.default_applied_amount() from public, anon, authenticated;

create trigger payments_default_applied before insert on public.payments
  for each row execute function private.default_applied_amount();
create trigger refunds_default_applied before insert on public.refunds
  for each row execute function private.default_applied_amount();

-- paid_total and payment_status from what payments and refunds settle, in the order currency.
create or replace function private.refresh_order_payment(p_order_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_paid numeric;
  v_refunded numeric;
begin
  select coalesce(sum(applied_amount), 0) into v_paid from public.payments where order_id = p_order_id;
  select coalesce(sum(applied_amount), 0) into v_refunded from public.refunds where order_id = p_order_id;

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

-- Records a manual payment (D12), in the order currency or in another one at the agreed rate. Change may be given in
-- the order currency or in the one paid with.
create or replace function public.order_record_payment(p_store_id uuid, p_order_id uuid, p_input jsonb, p_user_id uuid)
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
  v_currency public.currency_code;
  v_rate numeric := 1;
  v_change numeric := round((p_input ->> 'change_amount')::numeric, 2);
  v_change_currency public.currency_code := nullif(p_input ->> 'change_currency', '')::public.currency_code;
  v_applied numeric;
  v_remaining numeric;
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

  v_currency := coalesce(nullif(p_input ->> 'currency', '')::public.currency_code, v_order.currency);
  if v_currency <> v_order.currency then
    v_rate := (p_input ->> 'rate')::numeric;
    if v_rate is null or v_rate <= 0 then
      raise exception 'La tasa no es válida' using errcode = 'P0001', hint = 'invalid_input';
    end if;
  end if;

  if v_change = 0 then
    v_change := null;
  end if;
  if (v_change is null) <> (v_change_currency is null) or v_change < 0
    or v_change_currency not in (v_order.currency, v_currency) then
    raise exception 'El vuelto no es válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  v_applied := case
    when v_change is not null and v_change_currency = v_order.currency then round(v_amount * v_rate, 2) - v_change
    else round((v_amount - coalesce(v_change, 0)) * v_rate, 2)
  end;
  if v_applied <= 0 then
    raise exception 'El vuelto no puede superar lo cobrado' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  -- A rate never lands exactly on the cent: within one cent of the balance, the payment settles it.
  v_remaining := v_order.total - v_order.paid_total;
  if v_currency <> v_order.currency and v_remaining > 0 and abs(v_applied - v_remaining) <= 0.01 then
    v_applied := v_remaining;
  end if;

  insert into public.payments (store_id, order_id, payment_method_id, amount, currency, applied_amount, rate_to_order,
    change_amount, change_currency, reference, evidence_path, recorded_by)
  values (p_store_id, v_order.id, v_method, v_amount, v_currency, v_applied, v_rate, v_change, v_change_currency,
    nullif(btrim(coalesce(p_input ->> 'reference', '')), ''), nullif(p_input ->> 'evidence_path', ''), p_user_id)
  returning * into v_payment;
  perform private.refresh_order_payment(v_order.id);

  insert into public.order_events (store_id, order_id, type, payload, user_id)
  values (p_store_id, v_order.id, 'payment_recorded',
    jsonb_build_object('amount', v_amount, 'currency', v_currency, 'applied', v_applied, 'payment_id', v_payment.id),
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

-- Ventas de hoy: the till per currency, net of the change given.
create or replace function public.sales_today(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select (date_trunc('day', now() at time zone 'America/Havana')) at time zone 'America/Havana' as day_start
  ),
  orders_today as (
    select o.currency, count(*) as orders, sum(coalesce(o.total, o.subtotal)) as amount
    from public.orders o, bounds b
    where o.store_id = p_store_id and o.created_at >= b.day_start and o.status <> 'cancelled'
    group by o.currency
  ),
  cash_today as (
    select currency, sum(amount) as amount from (
      select p.currency, p.amount from public.payments p, bounds b
      where p.store_id = p_store_id and p.created_at >= b.day_start
      union all
      select p.change_currency, -p.change_amount from public.payments p, bounds b
      where p.store_id = p_store_id and p.change_amount is not null and p.created_at >= b.day_start
      union all
      select r.currency, -r.amount from public.refunds r, bounds b
      where r.store_id = p_store_id and r.created_at >= b.day_start
    ) x
    group by currency
  )
  select jsonb_build_object(
    'day_start', (select day_start from bounds),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'orders', orders, 'amount', amount)
      order by currency) from orders_today), '[]'),
    'received', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount)
      order by currency) from cash_today), '[]'),
    'pending', (select count(*) from public.orders o
      where o.store_id = p_store_id and o.status in ('pending_confirmation', 'pending_payment'))
  );
$$;

-- Finanzas: the till per currency as received; the equivalent uses the agreed rate, through what was applied.
create or replace function public.finance_summary(p_store_id uuid, p_from date, p_to date, p_currency text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int := p_to - p_from + 1;
  v_result jsonb;
begin
  perform private.finance_check_period(p_from, p_to);

  with tp as (
    select * from private.rate_periods(p_store_id, p_currency)
  ),
  ord as (
    select o.currency::text as currency, o.created_at, coalesce(o.total, o.subtotal) as amount,
      greatest(coalesce(o.total, o.subtotal) - o.paid_total, 0) as pending,
      coalesce(o.shipping_total, 0) as shipping, o.exchange_rate / tp.rate as f
    from public.orders o
    join tp on o.created_at >= tp.from_at and o.created_at < tp.to_at
    where o.store_id = p_store_id and o.status <> 'cancelled'
      and o.created_at >= private.havana_start(p_from - v_days) and o.created_at < private.havana_start(p_to + 1)
  ),
  sold as (
    select currency, count(*) as orders, sum(amount) as amount, sum(pending) as pending, sum(amount * f) as eq,
      sum(pending * f) as pending_eq, sum(shipping * f) as shipping_eq
    from ord where created_at >= private.havana_start(p_from)
    group by currency
  ),
  previous as (
    select count(*) as orders, sum(amount * f) as eq
    from ord where created_at < private.havana_start(p_from)
  ),
  cash as (
    select x.currency, sum(x.amount) as amount, sum(x.base / tp.rate) as eq
    from (
      select p.currency::text as currency, p.amount, p.created_at as at, p.applied_amount * o.exchange_rate as base
      from public.payments p join public.orders o on o.id = p.order_id
      where p.store_id = p_store_id
        and p.created_at >= private.havana_start(p_from) and p.created_at < private.havana_start(p_to + 1)
      union all
      select p.change_currency::text, -p.change_amount, p.created_at, 0
      from public.payments p
      where p.store_id = p_store_id and p.change_amount is not null
        and p.created_at >= private.havana_start(p_from) and p.created_at < private.havana_start(p_to + 1)
      union all
      select r.currency::text, -r.amount, r.created_at, -r.applied_amount * o.exchange_rate
      from public.refunds r join public.orders o on o.id = r.order_id
      where r.store_id = p_store_id
        and r.created_at >= private.havana_start(p_from) and r.created_at < private.havana_start(p_to + 1)
    ) x
    join tp on x.at >= tp.from_at and x.at < tp.to_at
    group by x.currency
  ),
  spent as (
    select e.currency::text as currency, sum(e.amount) as amount,
      sum(e.amount * private.rate_at(p_store_id, e.currency::text, private.havana_start(e.spent_on + 1)) / tp.rate) as eq
    from public.expenses e
    join tp on private.havana_start(e.spent_on + 1) >= tp.from_at and private.havana_start(e.spent_on + 1) < tp.to_at
    where e.store_id = p_store_id and e.spent_on between p_from and p_to
    group by e.currency
  ),
  margin as (
    select coalesce(sum(revenue) filter (where cost is not null), 0) as revenue,
      coalesce(sum(cost), 0) as cost,
      count(*) filter (where cost is null) as without_cost
    from private.finance_lines(p_store_id, p_from, p_to, p_currency)
  )
  select jsonb_build_object(
    'currency', p_currency,
    'from', p_from,
    'to', p_to,
    'sold', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'orders', orders,
      'amount', round(amount, 2), 'pending', round(pending, 2)) order by currency) from sold), '[]'),
    'collected', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2))
      order by currency) from cash), '[]'),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2))
      order by currency) from spent), '[]'),
    'totals', jsonb_build_object(
      'orders', coalesce((select sum(orders) from sold), 0),
      'sold', round(coalesce((select sum(eq) from sold), 0), 2),
      'pending', round(coalesce((select sum(pending_eq) from sold), 0), 2),
      'shipping', round(coalesce((select sum(shipping_eq) from sold), 0), 2),
      'collected', round(coalesce((select sum(eq) from cash), 0), 2),
      'expenses', round(coalesce((select sum(eq) from spent), 0), 2),
      'avg_ticket', round(coalesce((select sum(eq) / nullif(sum(orders), 0) from sold), 0), 2),
      'margin', round((select revenue - cost from margin), 2),
      'net', round((select revenue - cost from margin) - coalesce((select sum(eq) from spent), 0), 2),
      'lines_without_cost', (select without_cost from margin)
    ),
    'previous', jsonb_build_object(
      'from', p_from - v_days,
      'to', p_from - 1,
      'orders', (select orders from previous),
      'sold', round(coalesce((select eq from previous), 0), 2)
    )
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.finance_daily(p_store_id uuid, p_from date, p_to date, p_currency text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.finance_check_period(p_from, p_to);

  with tp as (
    select * from private.rate_periods(p_store_id, p_currency)
  ),
  days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  rows as (
    select (o.created_at at time zone 'America/Havana')::date as day, 'sold' as kind, o.currency::text as currency,
      coalesce(o.total, o.subtotal) as amount, coalesce(o.total, o.subtotal) * o.exchange_rate / tp.rate as eq,
      1 as orders
    from public.orders o
    join tp on o.created_at >= tp.from_at and o.created_at < tp.to_at
    where o.store_id = p_store_id and o.status <> 'cancelled'
      and o.created_at >= private.havana_start(p_from) and o.created_at < private.havana_start(p_to + 1)
    union all
    select (x.at at time zone 'America/Havana')::date, 'collected', x.currency, x.amount, x.base / tp.rate, 0
    from (
      select p.currency::text as currency, p.amount, p.created_at as at, p.applied_amount * o.exchange_rate as base
      from public.payments p join public.orders o on o.id = p.order_id
      where p.store_id = p_store_id
        and p.created_at >= private.havana_start(p_from) and p.created_at < private.havana_start(p_to + 1)
      union all
      select p.change_currency::text, -p.change_amount, p.created_at, 0
      from public.payments p
      where p.store_id = p_store_id and p.change_amount is not null
        and p.created_at >= private.havana_start(p_from) and p.created_at < private.havana_start(p_to + 1)
      union all
      select r.currency::text, -r.amount, r.created_at, -r.applied_amount * o.exchange_rate
      from public.refunds r join public.orders o on o.id = r.order_id
      where r.store_id = p_store_id
        and r.created_at >= private.havana_start(p_from) and r.created_at < private.havana_start(p_to + 1)
    ) x
    join tp on x.at >= tp.from_at and x.at < tp.to_at
    union all
    select e.spent_on, 'expenses', e.currency::text, e.amount,
      e.amount * private.rate_at(p_store_id, e.currency::text, private.havana_start(e.spent_on + 1)) / tp.rate, 0
    from public.expenses e
    join tp on private.havana_start(e.spent_on + 1) >= tp.from_at and private.havana_start(e.spent_on + 1) < tp.to_at
    where e.store_id = p_store_id and e.spent_on between p_from and p_to
  ),
  per_currency as (
    select day, kind, currency, sum(amount) as amount, sum(eq) as eq, sum(orders) as orders
    from rows group by day, kind, currency
  ),
  per_day as (
    select day,
      sum(orders) filter (where kind = 'sold') as orders,
      jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2)) order by currency)
        filter (where kind = 'sold') as sold,
      jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2)) order by currency)
        filter (where kind = 'collected') as collected,
      jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2)) order by currency)
        filter (where kind = 'expenses') as expenses,
      sum(eq) filter (where kind = 'sold') as sold_eq,
      sum(eq) filter (where kind = 'collected') as collected_eq,
      sum(eq) filter (where kind = 'expenses') as expenses_eq
    from per_currency group by day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', d.day,
    'orders', coalesce(x.orders, 0),
    'sold', coalesce(x.sold, '[]'),
    'collected', coalesce(x.collected, '[]'),
    'expenses', coalesce(x.expenses, '[]'),
    'sold_eq', round(coalesce(x.sold_eq, 0), 2),
    'collected_eq', round(coalesce(x.collected_eq, 0), 2),
    'expenses_eq', round(coalesce(x.expenses_eq, 0), 2)
  ) order by d.day), '[]')
  into v_result
  from days d left join per_day x on x.day = d.day;
  return v_result;
end;
$$;

-- Inicio: what was received, at the rate agreed on each payment.
create or replace function public.admin_home_summary(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select
      (date_trunc('day', now() at time zone 'America/Havana')) at time zone 'America/Havana' as day_start,
      (date_trunc('month', now() at time zone 'America/Havana')) at time zone 'America/Havana' as month_start
  ),
  days as (
    select generate_series(0, 6) as ago
  ),
  week as (
    select d.ago,
      ((select day_start from bounds) - make_interval(days => d.ago)) as day_start,
      (select count(*) from public.orders o
        where o.store_id = p_store_id and o.status <> 'cancelled'
          and o.created_at >= (select day_start from bounds) - make_interval(days => d.ago)
          and o.created_at < (select day_start from bounds) - make_interval(days => d.ago - 1)) as orders,
      (select coalesce(sum(coalesce(o.total, o.subtotal) * o.exchange_rate), 0) from public.orders o
        where o.store_id = p_store_id and o.status <> 'cancelled'
          and o.created_at >= (select day_start from bounds) - make_interval(days => d.ago)
          and o.created_at < (select day_start from bounds) - make_interval(days => d.ago - 1)) as amount
    from days d
  ),
  ranges as (
    select 'day' as period, b.day_start as cur_from, b.day_start - interval '1 day' as prev_from,
      b.day_start as prev_to
    from bounds b
    union all
    select 'week', b.day_start - interval '6 days', b.day_start - interval '13 days', b.day_start - interval '6 days'
    from bounds b
    union all
    select 'month', b.month_start,
      ((date_trunc('month', (now() at time zone 'America/Havana') - interval '1 month')) at time zone 'America/Havana'),
      b.month_start
    from bounds b
  ),
  figures as (
    select r.period, w.is_current,
      (select count(*) from public.orders o
        where o.store_id = p_store_id and o.status <> 'cancelled'
          and o.created_at >= w.from_at and o.created_at < w.to_at) as orders,
      (select coalesce(sum(coalesce(o.total, o.subtotal) * o.exchange_rate), 0) from public.orders o
        where o.store_id = p_store_id and o.status <> 'cancelled'
          and o.created_at >= w.from_at and o.created_at < w.to_at) as sold,
      (select coalesce(sum(p.applied_amount * o.exchange_rate), 0) from public.payments p
        join public.orders o on o.id = p.order_id and o.store_id = p.store_id
        where p.store_id = p_store_id and p.created_at >= w.from_at and p.created_at < w.to_at)
      - (select coalesce(sum(x.applied_amount * o.exchange_rate), 0) from public.refunds x
        join public.orders o on o.id = x.order_id and o.store_id = x.store_id
        where x.store_id = p_store_id and x.created_at >= w.from_at and x.created_at < w.to_at) as received
    from ranges r
    cross join lateral (values (true, r.cur_from, 'infinity'::timestamptz), (false, r.prev_from, r.prev_to))
      as w(is_current, from_at, to_at)
  )
  select jsonb_build_object(
    'todo', jsonb_build_object(
      'to_confirm', (select count(*) from public.orders o
        where o.store_id = p_store_id and o.status = 'pending_confirmation'),
      'to_deliver', (select count(*) from public.orders o
        where o.store_id = p_store_id and o.status in ('paid', 'processing', 'shipped')),
      'low_stock', (select count(*) from public.products p
        where p.store_id = p_store_id and p.status = 'published' and exists (
          select 1 from public.product_variants v
          where v.product_id = p.id and v.track_inventory and v.stock_available <= 3))
    ),
    'week', (select jsonb_agg(jsonb_build_object('day', w.day_start, 'orders', w.orders, 'amount', w.amount)
      order by w.ago desc) from week w),
    'to_collect', (select coalesce(sum((o.total - o.paid_total) * o.exchange_rate), 0) from public.orders o
      where o.store_id = p_store_id and o.status <> 'cancelled' and o.total is not null
        and o.payment_status in ('unpaid', 'partially_paid')),
    'periods', (select jsonb_object_agg(c.period, jsonb_build_object(
        'orders', c.orders, 'sold', round(c.sold, 2), 'received', round(c.received, 2),
        'prev_orders', p.orders, 'prev_sold', round(p.sold, 2), 'prev_received', round(p.received, 2)))
      from figures c join figures p on p.period = c.period and not p.is_current
      where c.is_current)
  );
$$;

create or replace function public.admin_order(p_order_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
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
          'quantity', l.quantity,
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
$$;
