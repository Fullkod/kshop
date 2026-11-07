-- KSH0014: the closing is of the whole till, not of a cashier. A store sells from several phones and accounts into
-- one drawer, so «Cerrar el día» gathers every open counter sale of the store (any cashier, any phone, earlier days
-- that nobody closed too), counted once, with one float and one WhatsApp; it lists what each cashier sold.
-- pos_closings.cashier_id is now who closed it. No closing existed in production when this changed.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.pos_closings drop constraint pos_closings_store_id_cashier_id_day_sequence_key;
alter table public.pos_closings add constraint pos_closings_store_day_sequence_key unique (store_id, day, sequence);

drop index public.pos_sales_open_idx;
create index pos_sales_open_idx on public.pos_sales (store_id, sold_at) where closing_id is null;

-- Everyone in the store closes the same till, so everyone sees its closings.
drop policy pos_closings_select on public.pos_closings;
create policy pos_closings_select on public.pos_closings
for select to authenticated
using ((select private.is_superadmin()) or store_id in (select private.my_store_ids()));

-- ---------------------------------------------------------------------------
-- What the open sales of the store add up to, until the end of p_day
-- ---------------------------------------------------------------------------

drop function private.pos_closing_totals(uuid, uuid, date);

create function private.pos_closing_totals(p_store_id uuid, p_day date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with sales as (
    select s.order_id, s.cashier_id, s.sold_at, o.status
    from public.pos_sales s
    join public.orders o on o.id = s.order_id
    where s.store_id = p_store_id and s.closing_id is null and s.sold_at < private.havana_start(p_day + 1)
  ),
  pays as (
    select p.*, s.cashier_id, m.name as method_name,
      (m.id is null or lower(btrim(m.name)) like 'efectivo%') as is_cash
    from public.payments p
    join sales s on s.order_id = p.order_id
    left join public.payment_methods m on m.store_id = p.store_id and m.id = p.payment_method_id
  ),
  cash_rows as (
    select cashier_id, currency::text as currency, amount from pays where is_cash
    union all
    select cashier_id, change_currency::text, -change_amount from pays where change_amount is not null
    union all
    select s.cashier_id, r.currency::text, -r.amount from public.refunds r join sales s on s.order_id = r.order_id
  ),
  cash as (
    select currency, sum(amount) as amount from cash_rows group by 1
  ),
  methods as (
    select method_name as name, currency::text as currency,
      sum(amount - case when change_currency = currency then coalesce(change_amount, 0) else 0 end) as amount
    from pays where not is_cash
    group by 1, 2
  ),
  cashiers as (
    select s.cashier_id,
      coalesce((select u.email::text from auth.users u where u.id = s.cashier_id), 'Cuenta borrada') as cashier,
      count(*) filter (where s.status <> 'cancelled') as sales,
      (select coalesce(jsonb_object_agg(currency, amount) filter (where amount <> 0), '{}'::jsonb)
        from (select currency, sum(amount) as amount from cash_rows c
              where c.cashier_id is not distinct from s.cashier_id group by 1) x) as cash
    from sales s
    group by s.cashier_id
  )
  select jsonb_build_object(
    'sales', (select count(*) from sales where status <> 'cancelled'),
    'voided', (select count(*) from sales where status = 'cancelled'),
    -- Open sales of earlier days that go into this closing.
    'older', (select count(*) from sales where sold_at < private.havana_start(p_day)),
    'cash', coalesce((select jsonb_object_agg(currency, amount) from cash where amount <> 0), '{}'::jsonb),
    'methods', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'currency', currency, 'amount', amount)
      order by name, currency) from methods where amount <> 0), '[]'::jsonb),
    'by_cashier', coalesce((select jsonb_agg(jsonb_build_object('cashier', cashier, 'sales', sales, 'cash', cash)
      order by sales desc, cashier) from cashiers), '[]'::jsonb)
  );
$$;

revoke all on function private.pos_closing_totals(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Preview and closing (same signatures and keys: Kshop Admin 1.0.23 closes the whole till without an update)
-- ---------------------------------------------------------------------------

create or replace function public.pos_closing_preview(p_store_id uuid, p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with day as (select (now() at time zone 'America/Havana')::date as d),
  totals as (select private.pos_closing_totals(p_store_id, (select d from day)) as t)
  select (select t from totals) || jsonb_build_object(
    'day', (select d from day),
    'float', (select pos_float from public.stores where id = p_store_id),
    'expected_cash', private.jsonb_money_add((select pos_float from public.stores where id = p_store_id),
      (select t -> 'cash' from totals)),
    'closed_today', (select count(*) from public.pos_closings c
      where c.store_id = p_store_id and c.day = (select d from day)),
    -- Nothing is left out any more (earlier days go in, counted in «older»).
    'older_open', 0
  );
$$;

create or replace function public.pos_close_day(p_store_id uuid, p_user_id uuid, p_input jsonb)
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

  -- One closing at a time per store: two phones closing at once would count the same sales twice.
  perform pg_advisory_xact_lock(hashtextextended('pos-close:' || p_store_id, 0));
  select count(*) into v_open from (
    select 1 from public.pos_sales s
    where s.store_id = p_store_id and s.closing_id is null and s.sold_at < private.havana_start(v_day + 1)
    for update
  ) x;

  select coalesce(max(sequence), 0) + 1 into v_sequence from public.pos_closings
  where store_id = p_store_id and day = v_day;
  if v_sequence > 1 and v_open = 0 then
    raise exception 'No hay ventas nuevas desde el último cierre' using errcode = 'P0001', hint = 'nothing_to_close';
  end if;

  v_totals := private.pos_closing_totals(p_store_id, v_day);
  v_expected_cash := private.jsonb_money_add(v_float, v_totals -> 'cash');

  insert into public.pos_closings (store_id, cashier_id, day, sequence, float, expected, counted, note)
  values (p_store_id, p_user_id, v_day, v_sequence, v_float,
    v_totals || jsonb_build_object('expected_cash', v_expected_cash), v_counted, v_note)
  returning * into v_closing;

  update public.pos_sales set closing_id = v_closing.id
  where store_id = p_store_id and closing_id is null and sold_at < private.havana_start(v_day + 1);

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
        -- «106 ventas · 6 anuladas · 12 de días anteriores» and, with more than one account, one line each.
        'ventas', (v_totals ->> 'sales') || ' ventas'
          || case when (v_totals ->> 'voided')::int > 0 then ' · ' || (v_totals ->> 'voided') || ' anuladas' else '' end
          || case when (v_totals ->> 'older')::int > 0 then ' · ' || (v_totals ->> 'older') || ' de días anteriores'
             else '' end
          || case when jsonb_array_length(v_totals -> 'by_cashier') > 1 then coalesce((
            select string_agg(e'\n- ' || private.whatsapp_escape(c ->> 'cashier') || ': ' || (c ->> 'sales') || ' ventas'
              || coalesce(', ' || (select string_agg(private.money_text(value::numeric, key), ' y ' order by key)
                from jsonb_each_text(c -> 'cash')) || ' en efectivo', ''), '')
            from jsonb_array_elements(v_totals -> 'by_cashier') c), '') else '' end,
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

-- The platform template reads «Cierre de caja · día (cerró …)»; a store's own edited template is kept.
update public.whatsapp_templates
set body = e'Cierre de caja · {{dia}} (cerró {{empleado}})\nDebe haber en efectivo: {{esperado}}\nContado: {{contado}}\n*{{diferencia}}*\n{{otros_metodos}}\n{{ventas}}\n{{nota}}\n{{enlace_admin}}'
where store_id is null and event = 'cash_closing'
  and body = e'Cierre de caja de {{empleado}} · {{dia}}\nDebe haber en efectivo: {{esperado}}\nContado: {{contado}}\n*{{diferencia}}*\n{{otros_metodos}}\n{{ventas}}\n{{nota}}\n{{enlace_admin}}';
