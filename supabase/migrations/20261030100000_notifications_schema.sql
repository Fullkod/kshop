-- Phase 4: WhatsApp notices from the platform number (PRP-4 D12–D22). One OpenWA session for every store, only
-- outgoing messages. Order events are queued (notification_log) in the order transaction and sent later by a
-- pg_cron dispatcher through pg_net; an order never waits for WhatsApp and never fails because of it.
-- Platform settings live in private.platform_config; the OpenWA API key in Supabase Vault (never in a table
-- that an API role can read).

create extension if not exists pg_net with schema extensions;

create type public.notification_status as enum ('pending', 'sending', 'sent', 'simulated', 'failed', 'skipped');
create type public.notification_audience as enum ('store', 'customer');

-- ---------------------------------------------------------------------------
-- Platform settings (service_role only)
-- ---------------------------------------------------------------------------

create table private.platform_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- whatsapp_mode: off (nothing is queued) | dry_run (queued as "simulated", never sent) | live.
insert into private.platform_config (key, value) values
  ('whatsapp_mode', '"dry_run"'),
  ('openwa_url', 'null'),
  ('openwa_session', 'null'),
  ('whatsapp_rate_per_minute', '20'),
  ('whatsapp_store_rate_per_minute', '10')
on conflict (key) do nothing;

create function private.platform_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from private.platform_config where key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- Contacts of a store (who gets the store notices) and templates
-- ---------------------------------------------------------------------------

create table public.store_notification_contacts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  notify_new_order boolean not null default true,
  notify_payment_recorded boolean not null default false,
  -- Listed to the customer as the store's contact in the notices.
  show_to_customer boolean not null default true,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, phone),
  unique (store_id, id)
);

create index store_notification_contacts_store_idx on public.store_notification_contacts (store_id, sort_order);

-- store_id null = platform default; a store row overrides it for that store.
create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores (id) on delete cascade,
  event text not null check (event ~ '^[a-z_]{3,40}$'),
  audience public.notification_audience not null,
  body text not null check (char_length(body) between 1 and 1500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (store_id, event, audience)
);

create index whatsapp_templates_store_idx on public.whatsapp_templates (store_id);

insert into public.whatsapp_templates (store_id, event, audience, body) values
  (null, 'order_created', 'store',
   e'Nuevo pedido *{{numero}}* de {{cliente}} ({{telefono}}).\n{{lineas}}\nTotal: {{total}}\nEntrega: {{entrega}}\n{{enlace_admin}}'),
  (null, 'payment_recorded', 'store', e'Pago registrado en *{{numero}}*: {{pagado}} de {{total}}.\n{{enlace_admin}}'),
  (null, 'order_created', 'customer',
   e'Hola, {{cliente}}. Recibimos tu pedido *{{numero}}*.\n{{lineas}}\nTotal: {{total}}\nTe avisamos en cuanto la tienda lo confirme.\n{{enlace_pedido}}'),
  (null, 'pending_payment', 'customer',
   e'Hola, {{cliente}}. Tu pedido *{{numero}}* está confirmado. Total a pagar: {{total}}.\nPago: {{metodo_pago}}\n{{instrucciones_pago}}\n{{enlace_pedido}}'),
  (null, 'paid', 'customer', e'¡Gracias, {{cliente}}! Recibimos el pago de tu pedido *{{numero}}*.\n{{enlace_pedido}}'),
  (null, 'processing', 'customer', e'Tu pedido *{{numero}}* está en preparación.\n{{enlace_pedido}}'),
  (null, 'shipped', 'customer', e'Tu pedido *{{numero}}* va en camino.\n{{enlace_pedido}}'),
  (null, 'delivered', 'customer', e'Tu pedido *{{numero}}* fue entregado. ¡Gracias por tu compra!'),
  (null, 'cancelled', 'customer', e'Tu pedido *{{numero}}* fue cancelado. {{motivo}}\n{{enlace_pedido}}'),
  (null, 'shipping_set', 'customer',
   e'El costo de entrega de tu pedido *{{numero}}* es {{envio}}. Total: {{total}}.\n{{enlace_pedido}}'),
  (null, 'recovery_code', 'customer',
   e'Tu código para cambiar la contraseña es *{{codigo}}*. Vale 60 minutos. Si no lo pediste, ignora este mensaje.')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Queue and log of every notice (outbox)
-- ---------------------------------------------------------------------------

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  -- null only for the superadmin test message.
  store_id uuid references public.stores (id) on delete cascade,
  order_id uuid,
  channel text not null default 'whatsapp',
  audience public.notification_audience not null,
  event text not null,
  -- E.164 phone.
  recipient text not null,
  -- Rendered when queued (frozen).
  message text not null,
  status public.notification_status not null,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  -- pg_net request id while "sending".
  request_id bigint,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id, order_id) references public.orders (store_id, id) on delete cascade
);

-- Never the same notice twice to the same number.
create unique index notification_log_dedupe_idx on public.notification_log (order_id, event, recipient)
  where order_id is not null;
create index notification_log_store_idx on public.notification_log (store_id, created_at desc);
create index notification_log_order_idx on public.notification_log (store_id, order_id);
create index notification_log_queue_idx on public.notification_log (next_attempt_at) where status in ('pending', 'sending');

-- The customer can opt out at checkout (D19).
alter table public.orders add column notify_customer boolean not null default true;

-- ---------------------------------------------------------------------------
-- updated_at, privileges and RLS
-- ---------------------------------------------------------------------------

create trigger store_notification_contacts_set_updated_at before update on public.store_notification_contacts
for each row execute function private.set_updated_at();
create trigger whatsapp_templates_set_updated_at before update on public.whatsapp_templates
for each row execute function private.set_updated_at();
create trigger notification_log_set_updated_at before update on public.notification_log
for each row execute function private.set_updated_at();

revoke all on private.platform_config from public, anon, authenticated;
revoke all on function private.platform_setting(text) from public;
grant execute on function private.platform_setting(text) to service_role;

revoke all on public.store_notification_contacts, public.whatsapp_templates, public.notification_log
  from anon, authenticated;
grant select on public.store_notification_contacts, public.whatsapp_templates, public.notification_log to authenticated;

alter table private.platform_config enable row level security;
alter table public.store_notification_contacts enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.notification_log enable row level security;

create policy "store_notification_contacts: store staff" on public.store_notification_contacts for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

-- Platform defaults are readable by any staff member (to compare or restore); store rows by their staff.
create policy "whatsapp_templates: platform defaults and own store" on public.whatsapp_templates for select
to authenticated
using ((store_id is null and exists (select 1 from private.my_store_ids()))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "notification_log: store staff, superadmin" on public.notification_log for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

comment on table public.notification_log is e'@graphql({"totalCount": {"enabled": true}})';
