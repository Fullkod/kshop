-- Phase 4: render, queue and dispatch of the WhatsApp notices (PRP-4 D12–D22).
--   * Order events (order_events) queue their notices at commit (deferred constraint trigger, so the lines and
--     totals are already there), rendered with the store template or the platform default.
--   * Nothing here may abort an order: queuing errors become a "failed" row with the error.
--   * dispatch_notifications (pg_cron, every minute) sends in "live" mode through pg_net with a per-minute limit
--     (platform and per store), reconciles the responses of the previous run and retries up to 3 times.
--   * In "dry_run" notices are queued as "simulated" (visible in the log with «Abrir en WhatsApp»), never sent.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- "2400 CUP" / "12,50 USD" (like formatMoney in @kshop/core, without thousands separators).
create function private.money_text(p_amount numeric, p_currency text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_amount = trunc(p_amount) then trunc(p_amount)::text
    else replace(to_char(p_amount, 'FM999999990.00'), '.', ',') end || ' ' || p_currency;
$$;

create function private.store_public_url(p_store_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select 'https://' || coalesce(
    (select d.domain from public.store_domains d where d.store_id = p_store_id and d.is_primary),
    (select s.slug || '.kshop.fullkod.com' from public.stores s where s.id = p_store_id));
$$;

-- *, _ and ~ format WhatsApp text: names typed by people must not break it.
create function private.whatsapp_escape(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(p_text, ''), '([*_~])', '', 'g');
$$;

-- {{variables}} replaced from p_vars; unknown ones disappear.
create function private.render_whatsapp_template(p_body text, p_vars jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := p_body;
  v_key text;
  v_value text;
begin
  for v_key, v_value in select key, value from jsonb_each_text(p_vars) loop
    v_text := replace(v_text, '{{' || v_key || '}}', coalesce(v_value, ''));
  end loop;
  v_text := regexp_replace(v_text, '\{\{[a-z_]+\}\}', '', 'g');
  -- No empty lines left by missing variables (at most one blank line in a row).
  v_text := regexp_replace(v_text, e'\n{3,}', e'\n\n', 'g');
  return btrim(regexp_replace(v_text, e'\n+$', ''));
end;
$$;

-- Fixed head and foot of every notice (decision 15): the store name first; the customer is told it is an automatic
-- notice and who to write to.
create function private.notification_message(p_store_id uuid, p_audience public.notification_audience, p_body text)
returns text
language sql
stable
set search_path = ''
as $$
  select '*' || private.whatsapp_escape(s.name) || e'*\n' || p_body
    || case when p_audience = 'customer' then
         e'\n\n_Aviso automático: no respondas a este número._'
         || coalesce(e'\nConsultas: ' || (
           select string_agg(private.whatsapp_escape(c.name) || ' ' || c.phone, ', ' order by c.sort_order, c.name)
           from public.store_notification_contacts c
           where c.store_id = s.id and c.is_active and c.show_to_customer), '')
       else e'\n\n_Aviso automático de Kshop._' end
  from public.stores s where s.id = p_store_id;
$$;

-- Active template: the store's own, else the platform default.
create function private.whatsapp_template(p_store_id uuid, p_event text, p_audience public.notification_audience)
returns text
language sql
stable
set search_path = ''
as $$
  select t.body from public.whatsapp_templates t
  where t.event = p_event and t.audience = p_audience and t.is_active
    and (t.store_id = p_store_id or t.store_id is null)
  order by t.store_id nulls last
  limit 1;
$$;

-- Variables of an order for the templates. The link for the customer (decision 24): its order inside its account
-- when the order belongs to one, else the public page by token.
create function private.order_template_vars(p_order_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
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
      select string_agg(format('• %s × %s%s — %s', l.quantity, private.whatsapp_escape(l.product_name),
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
$$;

-- ---------------------------------------------------------------------------
-- Queue
-- ---------------------------------------------------------------------------

-- Queues one notice. Never raises: a render error is logged as a failed row. Duplicates are ignored.
create function private.queue_notification(
  p_store_id uuid, p_order_id uuid, p_audience public.notification_audience, p_event text, p_recipient text,
  p_vars jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_mode text := coalesce(private.platform_setting('whatsapp_mode') #>> '{}', 'off');
  v_body text;
  v_message text;
begin
  if v_mode = 'off' then
    return;
  end if;
  v_body := private.whatsapp_template(p_store_id, p_event, p_audience);
  if v_body is null then
    return;
  end if;
  v_message := private.notification_message(p_store_id, p_audience, private.render_whatsapp_template(v_body, p_vars));
  insert into public.notification_log (store_id, order_id, audience, event, recipient, message, status, sent_at)
  values (p_store_id, p_order_id, p_audience, p_event, p_recipient, v_message,
    case when v_mode = 'live' then 'pending' else 'simulated' end::public.notification_status,
    case when v_mode = 'live' then null else now() end)
  on conflict (order_id, event, recipient) where order_id is not null do nothing;
exception when others then
  begin
    insert into public.notification_log (store_id, order_id, audience, event, recipient, message, status, error)
    values (p_store_id, p_order_id, p_audience, p_event, p_recipient, '', 'failed', sqlerrm)
    on conflict (order_id, event, recipient) where order_id is not null do nothing;
  exception when others then
    null;
  end;
end;
$$;

-- order_events -> notices (D16): new order to the store contacts and the customer, status changes and the
-- shipping cost to the customer, payments to the contacts that asked for them. Needs whatsapp_notifications.
create function private.order_event_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_vars jsonb;
  v_event text;
  v_contact record;
begin
  if new.is_internal or new.type not in ('created', 'status_changed', 'shipping_set', 'payment_recorded') then
    return null;
  end if;
  if not private.store_has_module(new.store_id, 'whatsapp_notifications') then
    return null;
  end if;
  select * into v_order from public.orders where id = new.order_id;
  if not found then
    return null;
  end if;
  v_vars := private.order_template_vars(v_order.id);
  v_event := case new.type
    when 'created' then 'order_created'
    when 'status_changed' then new.payload ->> 'to'
    else new.type end;

  -- Store contacts.
  if new.type in ('created', 'payment_recorded') then
    for v_contact in
      select c.phone from public.store_notification_contacts c
      where c.store_id = new.store_id and c.is_active
        and ((new.type = 'created' and c.notify_new_order) or (new.type = 'payment_recorded' and c.notify_payment_recorded))
    loop
      perform private.queue_notification(new.store_id, v_order.id, 'store', v_event, v_contact.phone, v_vars);
    end loop;
  end if;

  -- Customer (opt-out at checkout).
  if v_order.notify_customer and new.type <> 'payment_recorded'
     and v_event in ('order_created', 'pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled',
       'shipping_set') then
    perform private.queue_notification(new.store_id, v_order.id, 'customer', v_event, v_order.customer_phone, v_vars);
  end if;
  return null;
exception when others then
  -- Never break the order.
  return null;
end;
$$;

-- At commit: the checkout inserts its lines and totals after the "created" event row.
create constraint trigger order_events_notify_trigger
after insert on public.order_events
deferrable initially deferred
for each row execute function private.order_event_notify();

-- ---------------------------------------------------------------------------
-- Dispatcher (pg_cron + pg_net, live mode only)
-- ---------------------------------------------------------------------------

create function private.dispatch_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := coalesce(private.platform_setting('whatsapp_mode') #>> '{}', 'off');
  v_url text := nullif(private.platform_setting('openwa_url') #>> '{}', '');
  v_session text := nullif(private.platform_setting('openwa_session') #>> '{}', '');
  v_rate int := coalesce((private.platform_setting('whatsapp_rate_per_minute') #>> '{}')::int, 20);
  v_store_rate int := coalesce((private.platform_setting('whatsapp_store_rate_per_minute') #>> '{}')::int, 10);
  v_key text;
  v_row record;
  v_response record;
begin
  -- 1. Responses of the previous runs (pg_net keeps them only for a few hours).
  for v_row in
    select l.id, l.request_id, l.attempts, l.updated_at from public.notification_log l
    where l.status = 'sending' and l.request_id is not null
    for update skip locked
  loop
    select r.status_code, r.error_msg, r.timed_out into v_response
    from net._http_response r where r.id = v_row.request_id;
    if found then
      if v_response.status_code between 200 and 299 then
        update public.notification_log set status = 'sent', sent_at = now(), error = null where id = v_row.id;
      else
        update public.notification_log
        set status = case when v_row.attempts >= 3 then 'failed' else 'pending' end::public.notification_status,
            next_attempt_at = now() + make_interval(mins => v_row.attempts * 2),
            error = coalesce(v_response.error_msg, case when v_response.timed_out then 'timeout' end,
              'HTTP ' || v_response.status_code)
        where id = v_row.id;
      end if;
    elsif v_row.updated_at < now() - interval '15 minutes' then
      update public.notification_log
      set status = case when v_row.attempts >= 3 then 'failed' else 'pending' end::public.notification_status,
          error = 'Sin respuesta de OpenWA'
      where id = v_row.id;
    end if;
  end loop;

  if v_mode <> 'live' or v_url is null or v_session is null then
    return;
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'openwa_api_key';
  if v_key is null then
    return;
  end if;

  -- 2. Next batch within the limits (platform and per store, counting what was sent in the last minute).
  for v_row in
    select x.id, x.recipient, x.message from (
      select l.id, l.store_id, l.recipient, l.message, l.created_at,
        row_number() over (partition by l.store_id order by l.created_at) as n
      from public.notification_log l
      where l.status = 'pending' and l.next_attempt_at <= now()
    ) x
    where x.n <= greatest(0, v_store_rate - (
      select count(*) from public.notification_log s
      where s.store_id is not distinct from x.store_id and s.status in ('sending', 'sent')
        and s.updated_at > now() - interval '1 minute'))
    order by x.created_at
    limit greatest(0, v_rate - (
      select count(*) from public.notification_log s
      where s.status in ('sending', 'sent') and s.updated_at > now() - interval '1 minute'))
  loop
    update public.notification_log
    set status = 'sending', attempts = attempts + 1,
        request_id = net.http_post(
          url := rtrim(v_url, '/') || '/sessions/' || v_session || '/messages/send-text',
          body := jsonb_build_object('chatId', regexp_replace(v_row.recipient, '\D', '', 'g') || '@c.us',
            'text', v_row.message),
          headers := jsonb_build_object('Content-Type', 'application/json', 'X-API-Key', v_key),
          timeout_milliseconds := 15000)
    where id = v_row.id and status = 'pending';
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- API functions (service_role)
-- ---------------------------------------------------------------------------

-- «Reintentar» from the admin: a failed notice goes back to the queue (or is simulated again in dry_run).
create function public.notification_retry(p_store_id uuid, p_log_id uuid)
returns public.notification_log
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := coalesce(private.platform_setting('whatsapp_mode') #>> '{}', 'off');
  v_row public.notification_log;
begin
  update public.notification_log
  set status = case when v_mode = 'live' then 'pending' else 'simulated' end::public.notification_status,
      attempts = 0, next_attempt_at = now(), error = null,
      sent_at = case when v_mode = 'live' then null else now() end
  where id = p_log_id and store_id = p_store_id and status = 'failed'
  returning * into v_row;
  if not found then
    raise exception 'Solo se puede reintentar un aviso fallido' using errcode = 'P0001', hint = 'invalid_transition';
  end if;
  return v_row;
end;
$$;

-- Superadmin «Enviar mensaje de prueba» (no store).
create function public.notification_send_test(p_phone text, p_text text)
returns public.notification_log
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := coalesce(private.platform_setting('whatsapp_mode') #>> '{}', 'off');
  v_row public.notification_log;
begin
  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'El teléfono no es válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  insert into public.notification_log (store_id, audience, event, recipient, message, status, sent_at)
  values (null, 'store', 'test', p_phone, '*Kshop*' || e'\n' || p_text,
    case when v_mode = 'live' then 'pending' else 'simulated' end::public.notification_status,
    case when v_mode = 'live' then null else now() end)
  returning * into v_row;
  return v_row;
end;
$$;

-- Preview of a template with a real order (or sample data) for the admin editor.
create function public.notification_preview(p_store_id uuid, p_body text, p_audience public.notification_audience,
  p_order_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select private.notification_message(p_store_id, p_audience, private.render_whatsapp_template(p_body, coalesce(
    (select private.order_template_vars(o.id) from public.orders o where o.id = p_order_id and o.store_id = p_store_id),
    jsonb_build_object('tienda', (select name from public.stores where id = p_store_id), 'numero', 'XX-1001',
      'cliente', 'Ana', 'telefono', '+5351234567', 'subtotal', '2400 CUP', 'total', '2660 CUP', 'envio', '500 CUP',
      'pagado', '0 CUP', 'lineas', '• 2 × Vestido (S) — 2400 CUP', 'entrega', 'Mensajería · La Habana',
      'metodo_pago', 'Efectivo al recibir', 'enlace_pedido', private.store_public_url(p_store_id) || '/order/…',
      'enlace_admin', private.store_public_url(p_store_id) || '/admin/orders/…', 'codigo', '123456'))));
$$;

revoke all on function private.money_text(numeric, text), private.store_public_url(uuid), private.whatsapp_escape(text),
  private.render_whatsapp_template(text, jsonb),
  private.notification_message(uuid, public.notification_audience, text),
  private.whatsapp_template(uuid, text, public.notification_audience), private.order_template_vars(uuid),
  private.queue_notification(uuid, uuid, public.notification_audience, text, text, jsonb),
  private.order_event_notify(), private.dispatch_notifications()
  from public;
grant execute on function private.money_text(numeric, text), private.store_public_url(uuid),
  private.whatsapp_escape(text), private.render_whatsapp_template(text, jsonb),
  private.notification_message(uuid, public.notification_audience, text),
  private.whatsapp_template(uuid, text, public.notification_audience), private.order_template_vars(uuid),
  private.queue_notification(uuid, uuid, public.notification_audience, text, text, jsonb)
  to service_role;

revoke all on function public.notification_retry(uuid, uuid), public.notification_send_test(text, text),
  public.notification_preview(uuid, text, public.notification_audience, uuid)
  from public, anon, authenticated;
grant execute on function public.notification_retry(uuid, uuid), public.notification_send_test(text, text),
  public.notification_preview(uuid, text, public.notification_audience, uuid)
  to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'kshop-whatsapp-dispatch';
select cron.schedule('kshop-whatsapp-dispatch', '* * * * *', 'select private.dispatch_notifications()');
