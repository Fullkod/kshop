-- Phase 4: the superadmin edits the platform WhatsApp (OpenWA) through these functions (service_role only, called by
-- /api/v1/platform/whatsapp after requireSuperadmin). The API key goes to Supabase Vault and is never returned.

create function public.platform_whatsapp_get()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'mode', private.platform_setting('whatsapp_mode'),
    'url', private.platform_setting('openwa_url'),
    'session', private.platform_setting('openwa_session'),
    'rate_per_minute', private.platform_setting('whatsapp_rate_per_minute'),
    'store_rate_per_minute', private.platform_setting('whatsapp_store_rate_per_minute'),
    'has_api_key', exists (select 1 from vault.secrets where name = 'openwa_api_key'),
    'queue', jsonb_build_object(
      'pending', (select count(*) from public.notification_log where status in ('pending', 'sending')),
      'failed_24h', (select count(*) from public.notification_log
        where status = 'failed' and updated_at > now() - interval '24 hours'),
      'sent_24h', (select count(*) from public.notification_log
        where status = 'sent' and sent_at > now() - interval '24 hours'),
      'simulated_24h', (select count(*) from public.notification_log
        where status = 'simulated' and created_at > now() - interval '24 hours'))
  );
$$;

-- p_input: { mode, url, session, rate_per_minute, store_rate_per_minute, api_key? }
create function public.platform_whatsapp_set(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := nullif(btrim(coalesce(p_input ->> 'api_key', '')), '');
  v_secret uuid;
begin
  if coalesce(p_input ->> 'mode', '') not in ('off', 'dry_run', 'live') then
    raise exception 'Modo no válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  insert into private.platform_config (key, value, updated_at) values
    ('whatsapp_mode', to_jsonb(p_input ->> 'mode'), now()),
    ('openwa_url', coalesce(p_input -> 'url', 'null'), now()),
    ('openwa_session', coalesce(p_input -> 'session', 'null'), now()),
    ('whatsapp_rate_per_minute', coalesce(p_input -> 'rate_per_minute', '20'), now()),
    ('whatsapp_store_rate_per_minute', coalesce(p_input -> 'store_rate_per_minute', '10'), now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

  if v_key is not null then
    select id into v_secret from vault.secrets where name = 'openwa_api_key';
    if v_secret is null then
      perform vault.create_secret(v_key, 'openwa_api_key', 'OpenWA API key of the platform WhatsApp');
    else
      perform vault.update_secret(v_secret, v_key);
    end if;
  end if;
  if (p_input ->> 'mode') = 'live' and (
    nullif(p_input ->> 'url', '') is null or nullif(p_input ->> 'session', '') is null
    or not exists (select 1 from vault.secrets where name = 'openwa_api_key')
  ) then
    raise exception 'Para el modo real hacen falta la URL, la sesión y la API key de OpenWA'
      using errcode = 'P0001', hint = 'invalid_input';
  end if;
  return public.platform_whatsapp_get();
end;
$$;

revoke all on function public.platform_whatsapp_get(), public.platform_whatsapp_set(jsonb) from public, anon, authenticated;
grant execute on function public.platform_whatsapp_get(), public.platform_whatsapp_set(jsonb) to service_role;

-- Recovery code of a customer account (decision 24, every store): queued for the platform WhatsApp when the mode is
-- live; returns whether it will reach the customer (otherwise the staff sends it by wa.me as in phase 3).
create function public.notification_recovery_code(p_store_id uuid, p_phone text, p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(private.platform_setting('whatsapp_mode') #>> '{}', 'off') <> 'live' then
    return false;
  end if;
  perform private.queue_notification(p_store_id, null, 'customer', 'recovery_code', p_phone,
    jsonb_build_object('codigo', p_code));
  return true;
end;
$$;

revoke all on function public.notification_recovery_code(uuid, text, text) from public, anon, authenticated;
grant execute on function public.notification_recovery_code(uuid, text, text) to service_role;
