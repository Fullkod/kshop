-- Profit of the day in the cash closing (Roberto, 2026-11-07): sales, cost of what was sold and profit of the whole
-- store, with the products sold without a cost apart («their profit is not counted: add the cost and check again»).
-- Decisions: computed when the closing is read (an old closing updates itself); a cost set on a product that had none
-- fills its past sales (order_line_costs, never overwriting a cost already kept); order-wide discounts are shared
-- among the lines; the WhatsApp of the closing carries it (only the owner gets it); only the store, not per person.

-- ---------------------------------------------------------------------------
-- A cost added later fills the past sales that had none
-- ---------------------------------------------------------------------------

create function private.variant_cost_backfill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.order_line_costs (store_id, order_line_id, unit_cost, cost_currency)
  select l.store_id, l.id, new.cost_price, new.cost_currency
  from public.order_lines l
  where l.store_id = new.store_id and l.variant_id = new.variant_id
    and not exists (select 1 from public.order_line_costs c where c.order_line_id = l.id)
  on conflict do nothing;
  return null;
end;
$$;

revoke execute on function private.variant_cost_backfill() from public, anon, authenticated;

create trigger variant_costs_backfill
after insert or update of cost_price, cost_currency on public.variant_costs
for each row execute function private.variant_cost_backfill();

-- Once, for the costs set before this migration (Minimercado filled many on 2026-11-07).
insert into public.order_line_costs (store_id, order_line_id, unit_cost, cost_currency)
select l.store_id, l.id, v.cost_price, v.cost_currency
from public.order_lines l
join public.variant_costs v on v.variant_id = l.variant_id and v.store_id = l.store_id
where not exists (select 1 from public.order_line_costs c where c.order_line_id = l.id)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Profit of a set of orders (the sales of a closing), in the base currency
-- ---------------------------------------------------------------------------

-- Owner, admin and superadmin only (costs); the server (no user: the closing's WhatsApp) too. Anyone else gets null.
create function private.closing_profit(p_store_id uuid, p_order_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with allowed as (
    select (select auth.uid()) is null or (select private.is_superadmin())
      or p_store_id in (select private.my_admin_store_ids()) as ok
  ),
  lines as (
    select l.product_id, l.product_name, l.unit, l.quantity,
      -- The line after its share of the order-wide discounts, in the base currency.
      (l.line_total - case when o.subtotal > 0 then o.discount_total * l.line_total / o.subtotal else 0 end)
        * coalesce(o.exchange_rate, 1) as revenue,
      c.unit_cost * l.quantity * private.rate_at(p_store_id, c.cost_currency::text, o.created_at) as cost
    from public.orders o
    join public.order_lines l on l.order_id = o.id and l.store_id = o.store_id
    left join public.order_line_costs c on c.order_line_id = l.id
    where o.store_id = p_store_id and o.id = any (p_order_ids) and o.status <> 'cancelled'
      and (select ok from allowed)
  ),
  products as (
    select product_id, min(product_name) as name, min(unit) as unit, sum(quantity) as quantity,
      sum(revenue) as revenue, sum(cost) as cost, bool_or(cost is null) as missing,
      sum(revenue) filter (where cost is null) as revenue_without_cost
    from lines
    group by product_id, case when product_id is null then product_name end
  )
  select case when (select ok from allowed) then jsonb_build_object(
    'currency', (select base_currency from public.stores where id = p_store_id),
    'revenue', round(coalesce((select sum(revenue) from lines), 0), 2),
    'revenueWithCost', round(coalesce((select sum(revenue) from lines where cost is not null), 0), 2),
    'cost', round(coalesce((select sum(cost) from lines), 0), 2),
    'profit', round(coalesce((select sum(revenue - cost) from lines where cost is not null), 0), 2),
    'withoutCost', jsonb_build_object(
      'products', (select count(*) from products where missing),
      'amount', round(coalesce((select sum(revenue_without_cost) from products where missing), 0), 2),
      'productIds', coalesce((select jsonb_agg(product_id) from products where missing and product_id is not null),
        '[]'::jsonb)),
    'byProduct', coalesce((select jsonb_agg(jsonb_build_object(
        'productId', product_id, 'name', name, 'unit', unit, 'quantity', quantity,
        'revenue', round(revenue, 2), 'cost', case when not missing then round(cost, 2) end,
        'profit', case when not missing then round(revenue - cost, 2) end,
        'missingCost', missing) order by revenue desc, name)
      from (select * from products order by revenue desc limit 200) p), '[]'::jsonb)
  ) end;
$$;

revoke execute on function private.closing_profit(uuid, uuid[]) from public, anon;
grant execute on function private.closing_profit(uuid, uuid[]) to authenticated;

-- «Ganancia: 7.700 CUP (19,8 %) de 38.900 CUP vendidos con costo» + the warning of the products without a cost.
create function private.closing_profit_text(p_profit jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_profit is null or (p_profit ->> 'revenue')::numeric = 0 then null else
    'Ganancia: ' || private.money_text((p_profit ->> 'profit')::numeric, p_profit ->> 'currency')
    || case when (p_profit ->> 'revenueWithCost')::numeric > 0
      then ' (' || replace(to_char(round((p_profit ->> 'profit')::numeric * 100
        / (p_profit ->> 'revenueWithCost')::numeric, 1), 'FM9990.0'), '.', ',') || ' %)' else '' end
    || case when (p_profit -> 'withoutCost' ->> 'products')::int > 0 then
      e'\n⚠️ ' || (p_profit -> 'withoutCost' ->> 'products') || ' producto'
      || case when (p_profit -> 'withoutCost' ->> 'products')::int > 1 then 's vendidos' else ' vendido' end
      || ' sin costo ('
      || private.money_text((p_profit -> 'withoutCost' ->> 'amount')::numeric, p_profit ->> 'currency')
      || '): su ganancia no está contada. Ponles el costo y vuelve a mirar el cierre.'
    else '' end
  end;
$$;

revoke execute on function private.closing_profit_text(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin › Caja › Cierres: each closing with its profit (recomputed on every read)
-- ---------------------------------------------------------------------------

create or replace function public.admin_pos_closings(p_store_id uuid, p_days int default 30)
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
          from public.pos_sales s join public.orders o on o.id = s.order_id where s.closing_id = c.id),
        -- null for the staff (costs are for owner and admin).
        'profit', private.closing_profit(c.store_id,
          array(select s.order_id from public.pos_sales s where s.closing_id = c.id))
      ) order by c.day desc, c.closed_at desc, c.sequence desc)
      from public.pos_closings c
      where c.store_id = p_store_id
        and c.day > (now() at time zone 'America/Havana')::date - least(greatest(coalesce(p_days, 30), 1), 366)
    ), '[]'::jsonb)
  );
$$;

-- The WhatsApp of the closing: a «{{ganancia}}» line after the sales (stores with their own template keep it).
update public.whatsapp_templates
set body = e'Cierre de caja · {{dia}} (cerró {{empleado}})\nDebe haber en efectivo: {{esperado}}\nContado: {{contado}}\n*{{diferencia}}*\n{{otros_metodos}}\n{{ventas}}\n{{ganancia}}\n{{nota}}\n{{enlace_admin}}'
where store_id is null and event = 'cash_closing'
  and body = e'Cierre de caja · {{dia}} (cerró {{empleado}})\nDebe haber en efectivo: {{esperado}}\nContado: {{contado}}\n*{{diferencia}}*\n{{otros_metodos}}\n{{ventas}}\n{{nota}}\n{{enlace_admin}}';

-- pos_close_day: the same as in 20261108102300 plus «ganancia» in the WhatsApp variables.
create or replace function public.pos_close_day(p_store_id uuid, p_user_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        -- Profit of the day (owner only gets this WhatsApp): computed now; the admin recomputes it on reading.
        'ganancia', private.closing_profit_text(private.closing_profit(p_store_id,
          array(select s.order_id from public.pos_sales s where s.closing_id = v_closing.id))),
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
$function$;
