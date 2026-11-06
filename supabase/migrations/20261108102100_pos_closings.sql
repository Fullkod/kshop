-- KSH0012: cierre de caja (PRP prp-ksh0012-cierre-de-caja.md, approved by Roberto 2026-11-06).
-- One closing per cashier and Cuban day (a second one only gathers the sales after the first). The cashier sees
-- what should be there before counting; the closing is never edited; the store contacts that asked for it get the
-- reckoning by WhatsApp. The float is a fixed setting per store (P1), adjustable on the closing of that day.
--
-- Cash = payments without a method or with a method named «Efectivo…», less the change given back, less refunds.
-- Every other method (Transferencia…) is listed apart, «a comprobar».

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

-- {"CUP": 500}: the change the till opens with every day.
alter table public.stores add column pos_float jsonb not null default '{}'
  check (jsonb_typeof(pos_float) = 'object');

alter table public.store_notification_contacts add column notify_cash_closing boolean not null default true;

create table public.pos_closings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  cashier_id uuid references auth.users (id) on delete set null,
  -- America/Havana.
  day date not null,
  sequence int not null default 1 check (sequence between 1 and 50),
  -- {"CUP": 500}
  float jsonb not null default '{}',
  -- {"sales": n, "voided": n, "cash": {"CUP": ..}, "expected_cash": {"CUP": ..}, "methods": [{name, currency, amount}]}
  expected jsonb not null,
  -- {"CUP": 12300}
  counted jsonb not null check (jsonb_typeof(counted) = 'object'),
  note text check (note is null or char_length(note) <= 500),
  closed_at timestamptz not null default now(),
  unique (store_id, cashier_id, day, sequence),
  unique (store_id, id)
);

create index pos_closings_store_day_idx on public.pos_closings (store_id, day desc, closed_at desc);
create index pos_closings_cashier_idx on public.pos_closings (cashier_id);

alter table public.pos_sales add column closing_id uuid;
alter table public.pos_sales add constraint pos_sales_closing_fk
  foreign key (store_id, closing_id) references public.pos_closings (store_id, id) on delete set null (closing_id);
create index pos_sales_open_idx on public.pos_sales (store_id, cashier_id, sold_at) where closing_id is null;
create index pos_sales_closing_idx on public.pos_sales (closing_id) where closing_id is not null;

alter table public.pos_closings enable row level security;
revoke all on public.pos_closings from anon, authenticated;
grant select on public.pos_closings to authenticated;

-- The cashier sees its own closings; owner and admin see every closing of the store.
create policy pos_closings_select on public.pos_closings
for select to authenticated
using (
  (select private.is_superadmin())
  or private.has_store_role(store_id, 'admin')
  or (cashier_id = (select auth.uid()) and store_id in (select private.my_store_ids()))
);

-- ---------------------------------------------------------------------------
-- What a cashier's open sales of a day add up to
-- ---------------------------------------------------------------------------

create function private.pos_closing_totals(p_store_id uuid, p_cashier uuid, p_day date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with sales as (
    select s.order_id, o.status
    from public.pos_sales s
    join public.orders o on o.id = s.order_id
    where s.store_id = p_store_id and s.cashier_id = p_cashier and s.closing_id is null
      and s.sold_at >= private.havana_start(p_day) and s.sold_at < private.havana_start(p_day + 1)
  ),
  pays as (
    select p.*, m.name as method_name,
      (m.id is null or lower(btrim(m.name)) like 'efectivo%') as is_cash
    from public.payments p
    left join public.payment_methods m on m.store_id = p.store_id and m.id = p.payment_method_id
    where p.order_id in (select order_id from sales)
  ),
  cash as (
    select currency::text as currency, sum(amount) as amount from (
      select currency, amount from pays where is_cash
      union all
      select change_currency, -change_amount from pays where change_amount is not null
      union all
      select r.currency, -r.amount from public.refunds r where r.order_id in (select order_id from sales)
    ) x
    group by 1
  ),
  methods as (
    select method_name as name, currency::text as currency,
      sum(amount - case when change_currency = currency then coalesce(change_amount, 0) else 0 end) as amount
    from pays where not is_cash
    group by 1, 2
  )
  select jsonb_build_object(
    'sales', (select count(*) from sales where status <> 'cancelled'),
    'voided', (select count(*) from sales where status = 'cancelled'),
    'cash', coalesce((select jsonb_object_agg(currency, amount) from cash where amount <> 0), '{}'::jsonb),
    'methods', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'currency', currency, 'amount', amount)
      order by name, currency) from methods where amount <> 0), '[]'::jsonb)
  );
$$;

revoke all on function private.pos_closing_totals(uuid, uuid, date) from public, anon, authenticated;

-- Float + cash, per currency.
create function private.jsonb_money_add(p_a jsonb, p_b jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, v) filter (where v <> 0), '{}'::jsonb)
  from (
    select k, round(sum(v), 2) as v
    from (
      select key as k, value::numeric as v from jsonb_each_text(coalesce(p_a, '{}'))
      union all
      select key, value::numeric from jsonb_each_text(coalesce(p_b, '{}'))
    ) x
    group by k
  ) y;
$$;

-- ---------------------------------------------------------------------------
-- Preview (before counting) and closing. service_role only: the API checks the module and the store role.
-- ---------------------------------------------------------------------------

create function public.pos_closing_preview(p_store_id uuid, p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with day as (select (now() at time zone 'America/Havana')::date as d),
  totals as (select private.pos_closing_totals(p_store_id, p_user_id, (select d from day)) as t)
  select (select t from totals) || jsonb_build_object(
    'day', (select d from day),
    'float', (select pos_float from public.stores where id = p_store_id),
    'expected_cash', private.jsonb_money_add((select pos_float from public.stores where id = p_store_id),
      (select t -> 'cash' from totals)),
    'closed_today', (select count(*) from public.pos_closings c
      where c.store_id = p_store_id and c.cashier_id = p_user_id and c.day = (select d from day)),
    'older_open', (select count(*) from public.pos_sales s
      where s.store_id = p_store_id and s.cashier_id = p_user_id and s.closing_id is null
        and s.sold_at < private.havana_start((select d from day)) and s.sold_at > now() - interval '7 days')
  );
$$;

revoke all on function public.pos_closing_preview(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pos_closing_preview(uuid, uuid) to service_role;

-- p_input: {counted: {"CUP": 12300}, float?: {"CUP": 500}, note?}
create function public.pos_close_day(p_store_id uuid, p_user_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'America/Havana')::date;
  v_store public.stores;
  v_float jsonb;
  v_counted jsonb := p_input -> 'counted';
  v_note text := nullif(btrim(left(coalesce(p_input ->> 'note', ''), 500)), '');
  v_totals jsonb;
  v_expected_cash jsonb;
  v_sequence int;
  v_closing public.pos_closings;
  v_open int;
  v_contact record;
  v_vars jsonb;
  v_diff jsonb;
begin
  select * into v_store from public.stores where id = p_store_id;
  if not found or v_store.status <> 'active' then
    raise exception 'La tienda no está disponible' using errcode = 'P0001', hint = 'store_inactive';
  end if;
  if jsonb_typeof(v_counted) is distinct from 'object'
     or exists (select 1 from jsonb_each(v_counted) e
       where jsonb_typeof(e.value) <> 'number' or (e.value)::text::numeric < 0
         or e.key not in (select currency::text from public.store_currencies where store_id = p_store_id)) then
    raise exception 'El conteo no es válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  -- Without a float of the day (absent or JSON null), the store's.
  v_float := case when jsonb_typeof(p_input -> 'float') = 'null' or p_input -> 'float' is null then v_store.pos_float
    else p_input -> 'float' end;
  if jsonb_typeof(v_float) is distinct from 'object' then
    raise exception 'El fondo no es válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  -- One closing at a time per cashier: the open sales are locked while they are counted.
  perform pg_advisory_xact_lock(hashtextextended('pos-close:' || p_store_id || ':' || p_user_id, 0));
  select count(*) into v_open from (
    select 1 from public.pos_sales s
    where s.store_id = p_store_id and s.cashier_id = p_user_id and s.closing_id is null
      and s.sold_at >= private.havana_start(v_day) and s.sold_at < private.havana_start(v_day + 1)
    for update
  ) x;

  select coalesce(max(sequence), 0) + 1 into v_sequence from public.pos_closings
  where store_id = p_store_id and cashier_id = p_user_id and day = v_day;
  if v_sequence > 1 and v_open = 0 then
    raise exception 'No hay ventas nuevas desde el último cierre' using errcode = 'P0001', hint = 'nothing_to_close';
  end if;

  v_totals := private.pos_closing_totals(p_store_id, p_user_id, v_day);
  v_expected_cash := private.jsonb_money_add(v_float, v_totals -> 'cash');

  insert into public.pos_closings (store_id, cashier_id, day, sequence, float, expected, counted, note)
  values (p_store_id, p_user_id, v_day, v_sequence, v_float,
    v_totals || jsonb_build_object('expected_cash', v_expected_cash), v_counted, v_note)
  returning * into v_closing;

  update public.pos_sales set closing_id = v_closing.id
  where store_id = p_store_id and cashier_id = p_user_id and closing_id is null
    and sold_at >= private.havana_start(v_day) and sold_at < private.havana_start(v_day + 1);

  -- counted - expected, per currency.
  v_diff := private.jsonb_money_add(v_counted, (
    select coalesce(jsonb_object_agg(key, -(value::numeric)), '{}') from jsonb_each_text(v_expected_cash)));

  -- WhatsApp to the contacts that asked for it (never breaks the closing).
  begin
    if private.store_has_module(p_store_id, 'whatsapp_notifications') then
      v_vars := jsonb_build_object(
        'empleado', private.whatsapp_escape(coalesce((select email from auth.users where id = p_user_id), 'Caja')),
        'dia', to_char(v_day, 'DD/MM/YYYY') || case when v_sequence > 1 then ' (cierre ' || v_sequence || ')' else '' end,
        'esperado', coalesce((select string_agg(private.money_text(value::numeric, key), ' y ' order by key)
          from jsonb_each_text(v_expected_cash)), '0')
          || coalesce(' (fondo ' || (select string_agg(private.money_text(value::numeric, key), ' y ' order by key)
            from jsonb_each_text(v_float) where value::numeric <> 0) || ')', ''),
        'contado', coalesce((select string_agg(private.money_text(value::numeric, key), ' y ' order by key)
          from jsonb_each_text(v_counted) where value::numeric <> 0), '0'),
        'diferencia', case when v_diff = '{}'::jsonb then 'Cuadra ✅'
          else (select string_agg(case when value::numeric > 0 then 'Sobran ' else 'Faltan ' end
            || private.money_text(abs(value::numeric), key), ' · ' order by key) from jsonb_each_text(v_diff)) || ' ⚠️' end,
        'otros_metodos', (select 'Otros métodos (comprobar): ' || string_agg(private.whatsapp_escape(m ->> 'name') || ' '
          || private.money_text((m ->> 'amount')::numeric, m ->> 'currency'), ', ')
          from jsonb_array_elements(v_totals -> 'methods') m),
        'ventas', (v_totals ->> 'sales') || ' ventas'
          || case when (v_totals ->> 'voided')::int > 0 then ' · ' || (v_totals ->> 'voided') || ' anuladas' else '' end,
        'nota', case when v_note is not null then 'Nota: ' || private.whatsapp_escape(v_note) end,
        'enlace_admin', private.store_public_url(p_store_id) || '/admin/pos?tab=closings'
      );
      for v_contact in
        select c.phone from public.store_notification_contacts c
        where c.store_id = p_store_id and c.is_active and c.notify_cash_closing
      loop
        perform private.queue_notification(p_store_id, null, 'store', 'cash_closing', v_contact.phone, v_vars);
      end loop;
    end if;
  exception when others then
    null;
  end;

  return to_jsonb(v_closing) || jsonb_build_object('difference', v_diff);
end;
$$;

revoke all on function public.pos_close_day(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.pos_close_day(uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Reads: the closings of the last p_days days (RLS: own for staff, all for owner/admin) and the float
-- ---------------------------------------------------------------------------

create function private.member_email(p_store_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text from auth.users u
  where u.id = p_user_id
    and ((select private.is_superadmin()) or p_store_id in (select private.my_store_ids()));
$$;

revoke all on function private.member_email(uuid, uuid) from public, anon;
grant execute on function private.member_email(uuid, uuid) to authenticated;

-- The float of a store, for its staff (stores is not readable by authenticated).
create function private.pos_float(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select s.pos_float from public.stores s
  where s.id = p_store_id and ((select private.is_superadmin()) or s.id in (select private.my_store_ids()));
$$;

revoke all on function private.pos_float(uuid) from public, anon;
grant execute on function private.pos_float(uuid) to authenticated;

create function public.admin_pos_closings(p_store_id uuid, p_days int default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'float', coalesce(private.pos_float(p_store_id), '{}'::jsonb),
    'closings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'day', c.day, 'sequence', c.sequence, 'cashier', private.member_email(c.store_id, c.cashier_id),
        'float', c.float, 'expected', c.expected, 'counted', c.counted, 'note', c.note, 'closedAt', c.closed_at,
        'orders', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'number', o.number,
            'cancelled', o.status = 'cancelled') order by s.sold_at), '[]'::jsonb)
          from public.pos_sales s join public.orders o on o.id = s.order_id where s.closing_id = c.id)
      ) order by c.day desc, c.closed_at desc, c.sequence desc)
      from public.pos_closings c
      where c.store_id = p_store_id
        and c.day > (now() at time zone 'America/Havana')::date - least(greatest(coalesce(p_days, 30), 1), 366)
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.admin_pos_closings(uuid, int) from public, anon;
grant execute on function public.admin_pos_closings(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- WhatsApp template of the closing (editable per store like the others)
-- ---------------------------------------------------------------------------

insert into public.whatsapp_templates (store_id, event, audience, body) values
  (null, 'cash_closing', 'store',
   e'Cierre de caja de {{empleado}} · {{dia}}\nDebe haber en efectivo: {{esperado}}\nContado: {{contado}}\n*{{diferencia}}*\n{{otros_metodos}}\n{{ventas}}\n{{nota}}\n{{enlace_admin}}')
on conflict do nothing;

-- The contacts read the new «Cierre de caja» box.
create or replace function public.admin_notification_settings(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'storeNotificationContactsCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone', c.phone, 'notifyNewOrder', c.notify_new_order,
        'notifyPaymentRecorded', c.notify_payment_recorded, 'notifyCashClosing', c.notify_cash_closing,
        'showToCustomer', c.show_to_customer,
        'isActive', c.is_active
      )) order by c.sort_order nulls last, c.name nulls last, c.id)
      from (
        select * from public.store_notification_contacts where store_id = p_store_id
        order by sort_order nulls last, name nulls last, id limit 50
      ) c
    ), '[]'::jsonb)),
    'whatsappTemplatesCollection', jsonb_build_object('edges', coalesce((
      select jsonb_agg(jsonb_build_object('node', jsonb_build_object(
        'id', t.id, 'storeId', t.store_id, 'event', t.event, 'audience', t.audience, 'body', t.body,
        'isActive', t.is_active
      )) order by t.id)
      from (select * from public.whatsapp_templates order by id limit 100) t
    ), '[]'::jsonb))
  );
$$;

