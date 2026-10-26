-- Phase 5: subscriptions, grants and manual invoices (paid in person, in cash, always in USD; no receipts).
-- Owner/admin read their store's billing; staff only see the subscription state (for the banners); anon and
-- customers see nothing. Every write goes through service_role functions (next migrations).

create type public.grant_type as enum ('free_days', 'discount_percent', 'price_lock');
create type public.invoice_status as enum ('pending', 'paid', 'void');
create type public.invoice_line_kind as enum ('plan', 'addon', 'discount', 'adjustment');
create type public.suspension_reason as enum ('billing', 'manual');
create type public.payment_method as enum ('cash', 'transfer', 'other');
create type public.billing_interval as enum ('month', 'year');

-- ---------------------------------------------------------------------------
-- Plans, modules, stores
-- ---------------------------------------------------------------------------

-- Yearly price of a plan (null = no yearly option). plans.billing_interval stays unused: the interval lives on
-- the subscription.
alter table public.plans add column yearly_price numeric(12, 2) check (yearly_price >= 0);

alter table public.stores add column suspended_reason public.suspension_reason;

-- Add-ons keep the price they were bought at; grants keep the reason.
alter table public.store_modules
  add column price numeric(12, 2) check (price >= 0),
  add column currency public.currency_code,
  add column reason text check (char_length(reason) <= 300);

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------

alter table public.subscriptions
  add column billing_interval public.billing_interval not null default 'month',
  add column current_period_start timestamptz,
  add column currency public.currency_code not null default 'USD' check (currency = 'USD'),
  add column price_override numeric(12, 2) check (price_override >= 0),
  add column limit_overrides jsonb not null default '{}' check (jsonb_typeof(limit_overrides) = 'object'),
  add column founder boolean not null default false,
  add column cancel_at timestamptz,
  add column notes text check (char_length(notes) <= 2000);

create table public.subscription_grants (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.subscriptions (store_id) on delete cascade,
  type public.grant_type not null,
  -- free_days: days; discount_percent: 1-100; price_lock: the plan price it freezes.
  value numeric(12, 2) not null check (value >= 0),
  reason text check (char_length(reason) <= 300),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  granted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (type <> 'discount_percent' or value between 1 and 100),
  check (type <> 'free_days' or (value >= 1 and value = trunc(value))),
  check (ends_at is null or ends_at > starts_at)
);

create index subscription_grants_store_idx on public.subscription_grants (store_id, created_at desc);
create index subscription_grants_granted_by_idx on public.subscription_grants (granted_by);

-- ---------------------------------------------------------------------------
-- Invoices and payments (lines are a snapshot: they never change when the plan does)
-- ---------------------------------------------------------------------------

create table private.platform_invoice_counters (
  year int primary key,
  last_number int not null default 0
);

create table public.platform_invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  number text not null unique check (number ~ '^KS-[0-9]{4}-[0-9]{4,}$'),
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end > period_start),
  currency public.currency_code not null default 'USD',
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  total numeric(12, 2) not null check (total >= 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  status public.invoice_status not null default 'pending',
  issued_at timestamptz not null default now(),
  due_at timestamptz not null,
  paid_at timestamptz,
  void_reason text check (char_length(void_reason) <= 300),
  notes text check (char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  check (total = subtotal - discount)
);

create unique index platform_invoices_one_per_period_idx on public.platform_invoices (store_id, period_start)
  where status <> 'void';
create index platform_invoices_store_idx on public.platform_invoices (store_id, period_start desc);
create index platform_invoices_open_idx on public.platform_invoices (due_at) where status = 'pending';
create index platform_invoices_created_by_idx on public.platform_invoices (created_by);

create table public.platform_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  invoice_id uuid not null,
  kind public.invoice_line_kind not null,
  module_code text references public.modules (code),
  grant_id uuid references public.subscription_grants (id) on delete set null,
  description text not null check (char_length(description) between 1 and 200),
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_amount numeric(12, 2) not null,
  -- Negative for discounts.
  amount numeric(12, 2) not null,
  sort_order int not null default 0,
  foreign key (store_id, invoice_id) references public.platform_invoices (store_id, id) on delete cascade
);

create index platform_invoice_lines_invoice_idx on public.platform_invoice_lines (store_id, invoice_id, sort_order);
create index platform_invoice_lines_module_idx on public.platform_invoice_lines (module_code);
create index platform_invoice_lines_grant_idx on public.platform_invoice_lines (grant_id);

create table public.platform_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  invoice_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency public.currency_code not null default 'USD' check (currency = 'USD'),
  method public.payment_method not null default 'cash',
  reference text check (char_length(reference) <= 120),
  notes text check (char_length(notes) <= 500),
  paid_at timestamptz not null default now(),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (store_id, invoice_id) references public.platform_invoices (store_id, id) on delete cascade
);

create index platform_payments_invoice_idx on public.platform_payments (store_id, invoice_id);
create index platform_payments_recorded_by_idx on public.platform_payments (recorded_by);

create trigger platform_invoices_set_updated_at before update on public.platform_invoices
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Billing notices: platform events without an order, deduplicated by key
-- ---------------------------------------------------------------------------

alter table public.notification_log add column dedupe_key text;
create unique index notification_log_dedupe_key_idx on public.notification_log (dedupe_key)
  where dedupe_key is not null;

insert into private.platform_config (key, value) values
  ('invoice_lead_days', '5'),
  ('invoice_due_days', '7'),
  ('grace_days', '7'),
  ('trial_reminder_days', '3'),
  ('default_trial_days', '30'),
  ('billing_instructions', '"Pagas en efectivo a tu contacto de Kshop. Escríbenos por WhatsApp para coordinar la entrega."'),
  ('support_whatsapp', 'null')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on private.platform_invoice_counters from public, anon, authenticated;
alter table private.platform_invoice_counters enable row level security;

-- Staff read the subscription state for the banners; prices, overrides and notes stay with the server.
revoke select on public.subscriptions from authenticated;
grant select (store_id, plan_id, status, trial_ends_at, current_period_start, current_period_end, billing_interval,
  currency, founder, cancel_at, created_at, updated_at) on public.subscriptions to authenticated;

revoke all on public.subscription_grants, public.platform_invoices, public.platform_invoice_lines,
  public.platform_payments from anon, authenticated;
grant select (id, store_id, type, value, reason, starts_at, ends_at, revoked_at, created_at)
  on public.subscription_grants to authenticated;
grant select (id, store_id, number, period_start, period_end, currency, subtotal, discount, total, amount_paid,
  status, issued_at, due_at, paid_at, void_reason, notes, created_at, updated_at)
  on public.platform_invoices to authenticated;
grant select on public.platform_invoice_lines to authenticated;
grant select (id, store_id, invoice_id, amount, currency, method, reference, paid_at, created_at)
  on public.platform_payments to authenticated;

alter table public.subscription_grants enable row level security;
alter table public.platform_invoices enable row level security;
alter table public.platform_invoice_lines enable row level security;
alter table public.platform_payments enable row level security;

create policy "subscription_grants: owner/admin and superadmin" on public.subscription_grants for select
to authenticated
using ((select private.has_store_role(store_id, 'admin')) or (select private.is_superadmin()));

create policy "platform_invoices: owner/admin and superadmin" on public.platform_invoices for select
to authenticated
using ((select private.has_store_role(store_id, 'admin')) or (select private.is_superadmin()));

create policy "platform_invoice_lines: owner/admin and superadmin" on public.platform_invoice_lines for select
to authenticated
using ((select private.has_store_role(store_id, 'admin')) or (select private.is_superadmin()));

create policy "platform_payments: owner/admin and superadmin" on public.platform_payments for select
to authenticated
using ((select private.has_store_role(store_id, 'admin')) or (select private.is_superadmin()));

-- Billing notices carry amounts: staff of the store do not see them in the log.
drop policy "notification_log: store staff, superadmin" on public.notification_log;
create policy "notification_log: store staff, superadmin" on public.notification_log for select
to authenticated
using (
  (store_id in (select private.my_store_ids())
    and (event not like 'billing\_%' or (select private.has_store_role(store_id, 'admin'))))
  or (select private.is_superadmin()));

comment on table public.platform_invoices is e'@graphql({"totalCount": {"enabled": true}})';

-- ---------------------------------------------------------------------------
-- Catalog of plans and modules (pricing study 2026-10-25; editable in Superadmin › Planes)
-- ---------------------------------------------------------------------------

-- Coupons and the manual discount leave the Base plan: «discounts» keeps the visible offers (promotions with a
-- badge and the struck price) and «vouchers» is the new coupons module (Pro or add-on).
update public.modules set name = 'Ofertas',
  description = 'Promociones automáticas con etiqueta de descuento y precio tachado en la tienda.'
where code = 'discounts';

insert into public.modules (code, name, description, depends_on, is_core, addon_price, addon_currency, sort_order)
values ('vouchers', 'Cupones', 'Cupones de descuento en el carrito y el checkout, y descuento manual en pedidos.',
  '{orders}', false, 2, 'USD',
  coalesce((select sort_order from public.modules where code = 'discounts'), 0) + 1)
on conflict (code) do nothing;

update public.modules m set addon_price = x.price, addon_currency = 'USD'
from (values ('whatsapp_notifications', 3), ('multi_currency', 3), ('multi_warehouse', 3), ('finance', 3),
  ('custom_domain', 3), ('vouchers', 2)) as x(code, price)
where m.code = x.code;

update public.plans set price = 5, yearly_price = 50, currency = 'USD' where code = 'base';
update public.plans set price = 12, yearly_price = 120, currency = 'USD' where code = 'pro';

insert into public.plan_modules (plan_id, module_code)
select id, 'vouchers' from public.plans where code = 'pro'
on conflict do nothing;

insert into public.plan_limits (plan_id, key, value)
select id, 'max_staff', 10 from public.plans where code = 'pro'
on conflict (plan_id, key) do update set value = excluded.value;

-- Existing Pro stores get the new module from their plan (the engine migration keeps this in sync from now on).
insert into public.store_modules (store_id, module_code, source)
select s.store_id, 'vouchers', 'plan'
from public.subscriptions s join public.plans p on p.id = s.plan_id
where p.code = 'pro'
on conflict do nothing;

-- Current subscriptions: periods in USD. The Tienda Demo is the platform's test store: comped, never billed.
update public.subscriptions s set
  current_period_start = coalesce(s.trial_ends_at, s.created_at),
  current_period_end = coalesce(s.current_period_end, coalesce(s.trial_ends_at, s.created_at) + interval '1 month');
update public.subscriptions set status = 'comped', notes = 'Tienda de pruebas de la plataforma'
where store_id = (select id from public.stores where slug = 'demo');
