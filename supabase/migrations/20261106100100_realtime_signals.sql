-- Realtime (Roberto, 2026-10-27: «que los datos estén siempre actualizados»). Triggers broadcast a bare signal
-- (table and operation, never row data) through realtime.send; the clients read the data again through the API they
-- already use, so Realtime adds no new way to read anything.
--
-- Topics:
--   store:{store_id}       private  orders, order events and WhatsApp notices of a store  -> its staff and the superadmin
--   platform               private  stores, platform invoices and every WhatsApp notice     -> the superadmin
--   order:{public_token}   public   status of one order (the token is the secret of its public page) -> whoever has it

create function private.realtime_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_signal jsonb := jsonb_build_object('table', tg_table_name, 'op', lower(tg_op));
begin
  if v_row ->> 'store_id' is not null and tg_table_name <> 'stores' then
    perform realtime.send(v_signal, 'change', 'store:' || (v_row ->> 'store_id'), true);
  end if;
  if tg_table_name in ('notification_log', 'platform_invoices', 'stores') then
    perform realtime.send(v_signal, 'change', 'platform', true);
  end if;
  if tg_table_name = 'orders' and v_row ->> 'public_token' is not null then
    perform realtime.send(jsonb_build_object('status', v_row ->> 'status'), 'change',
      'order:' || (v_row ->> 'public_token'), false);
  end if;
  return null;
exception when others then
  -- A signal never breaks a write.
  return null;
end;
$$;

revoke all on function private.realtime_signal() from public, anon, authenticated;

create trigger orders_realtime after insert or update or delete on public.orders
for each row execute function private.realtime_signal();
create trigger order_events_realtime after insert on public.order_events
for each row execute function private.realtime_signal();
create trigger notification_log_realtime after insert or update on public.notification_log
for each row execute function private.realtime_signal();
create trigger platform_invoices_realtime after insert or update or delete on public.platform_invoices
for each row execute function private.realtime_signal();
create trigger stores_realtime after insert or update on public.stores
for each row execute function private.realtime_signal();

-- Who receives the private topics. No insert policy: clients cannot broadcast on them.
create policy "realtime: store signals for its staff, everything for the superadmin"
on realtime.messages for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (
    (select private.is_superadmin())
    or exists (
      select 1 from private.my_store_ids() s
      where 'store:' || s::text = (select realtime.topic())
    )
  )
);
