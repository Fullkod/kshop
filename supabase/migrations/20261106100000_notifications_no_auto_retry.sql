-- WhatsApp test with the real OpenWA (2026-10-27): it answered HTTP 500 and delivered the message, and the dispatcher
-- queued it again (it would have arrived twice). Same rule as TurnoFlash: no automatic retries; a 5xx counts as sent.

create or replace function private.dispatch_notifications()
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
  -- 1. Responses of the previous runs (pg_net keeps them only for a few hours). Never retried automatically: OpenWA
  -- answers HTTP 500 for messages it does deliver, so a retry would send them twice. A 5xx counts as sent (the code is
  -- kept in `error`); a 4xx, a timeout or no answer is failed and the staff can retry it by hand.
  for v_row in
    select l.id, l.request_id, l.updated_at from public.notification_log l
    where l.status = 'sending' and l.request_id is not null
    for update skip locked
  loop
    select r.status_code, r.error_msg, r.timed_out into v_response
    from net._http_response r where r.id = v_row.request_id;
    if found then
      if v_response.status_code between 200 and 299 or v_response.status_code >= 500 then
        update public.notification_log
        set status = 'sent', sent_at = now(),
            error = case when v_response.status_code >= 500
              then 'HTTP ' || v_response.status_code || ' (OpenWA entrega igualmente)' end
        where id = v_row.id;
      else
        update public.notification_log
        set status = 'failed',
            error = coalesce(v_response.error_msg, case when v_response.timed_out then 'timeout' end,
              'HTTP ' || v_response.status_code)
        where id = v_row.id;
      end if;
    elsif v_row.updated_at < now() - interval '15 minutes' then
      update public.notification_log set status = 'failed', error = 'Sin respuesta de OpenWA' where id = v_row.id;
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

revoke all on function private.dispatch_notifications() from public, anon, authenticated;
