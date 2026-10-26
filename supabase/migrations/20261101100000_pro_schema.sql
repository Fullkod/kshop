-- Phase 6 (Pro): schema for multi-warehouse zones and transfers, finance (cost rate snapshot, expenses), the
-- elTOQUE reference rate cache and custom domains. Writes go through service_role functions (later migrations);
-- here only tables, columns, indexes, privileges and RLS.

-- ---------------------------------------------------------------------------
-- Multi-warehouse: which warehouses serve a shipping zone, in priority order (D11). No rows for a zone = every
-- active warehouse serves it (today's behaviour).
-- ---------------------------------------------------------------------------

create table public.warehouse_shipping_zones (
  store_id uuid not null,
  warehouse_id uuid not null,
  zone_id uuid not null,
  priority smallint not null default 0 check (priority between 0 and 999),
  primary key (zone_id, warehouse_id),
  foreign key (store_id, warehouse_id) references public.warehouses (store_id, id) on delete cascade,
  foreign key (store_id, zone_id) references public.shipping_zones (store_id, id) on delete cascade
);
create index warehouse_shipping_zones_store_idx on public.warehouse_shipping_zones (store_id, warehouse_id);
create index warehouse_shipping_zones_zone_idx on public.warehouse_shipping_zones (store_id, zone_id, priority);

-- Transfers: two movements (transfer_out / transfer_in) share one id (D14).
alter table public.stock_movements add column transfer_id uuid;
create index stock_movements_transfer_idx on public.stock_movements (store_id, transfer_id) where transfer_id is not null;
create index stock_movements_store_created_idx on public.stock_movements (store_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Finance: rate of the cost currency at sale time (D3), so the margin of the past does not move with today's rate.
-- 1 unit of cost_currency = cost_rate_to_base units of the store base currency.
-- ---------------------------------------------------------------------------

alter table public.order_line_costs add column cost_rate_to_base numeric(18, 6) check (cost_rate_to_base > 0);

-- Base currency → 1; the order currency → the order rate; otherwise the store rate now.
create function private.fill_cost_rate_to_base()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cost_rate_to_base is null then
    select case
             when new.cost_currency = s.base_currency then 1
             when new.cost_currency = o.currency then o.exchange_rate
             else coalesce(
               (select sc.rate_to_base from public.store_currencies sc
                where sc.store_id = new.store_id and sc.currency = new.cost_currency),
               1)
           end
    into new.cost_rate_to_base
    from public.order_lines l
    join public.orders o on o.id = l.order_id
    join public.stores s on s.id = o.store_id
    where l.id = new.order_line_id;
    new.cost_rate_to_base := coalesce(new.cost_rate_to_base, 1);
  end if;
  return new;
end;
$$;

create trigger order_line_costs_fill_rate
before insert on public.order_line_costs
for each row execute function private.fill_cost_rate_to_base();

-- Backfill: the rate in force when the order was created (history), else today's, else 1.
update public.order_line_costs c
set cost_rate_to_base = coalesce(
  case
    when c.cost_currency = s.base_currency then 1
    when c.cost_currency = o.currency then o.exchange_rate
  end,
  (select h.rate from public.currency_rate_history h
   where h.store_id = c.store_id and h.currency = c.cost_currency and h.set_at <= o.created_at
   order by h.set_at desc limit 1),
  (select sc.rate_to_base from public.store_currencies sc
   where sc.store_id = c.store_id and sc.currency = c.cost_currency),
  1)
from public.order_lines l
join public.orders o on o.id = l.order_id
join public.stores s on s.id = o.store_id
where l.id = c.order_line_id and c.cost_rate_to_base is null;

alter table public.order_line_costs alter column cost_rate_to_base set not null;

-- Cash collected per day (finance «Cobrado»).
create index refunds_store_created_idx on public.refunds (store_id, created_at desc);

-- Manual expenses (Roberto: yes): net profit = margin − expenses, per currency.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  spent_on date not null,
  category text not null check (char_length(btrim(category)) between 1 and 60),
  amount numeric(12, 2) not null check (amount > 0),
  currency public.currency_code not null,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_store_spent_idx on public.expenses (store_id, spent_on desc);
create index expenses_created_by_idx on public.expenses (created_by);
comment on table public.expenses is e'@graphql({"totalCount": {"enabled": true}})';
comment on table public.stock_movements is e'@graphql({"totalCount": {"enabled": true}})';

-- ---------------------------------------------------------------------------
-- elTOQUE reference rate (Roberto): one fetch per Havana day for the whole platform. Server only.
-- ---------------------------------------------------------------------------

create table private.market_rates (
  source text not null,
  rate_date date not null,
  -- {"USD": 490, "EUR": 520, ...}: CUP per unit, as published.
  rates jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (source, rate_date)
);
alter table private.market_rates enable row level security;
revoke all on private.market_rates from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Custom domains (D20, D21): one custom domain per store, with what Vercel asks to configure.
-- ---------------------------------------------------------------------------

alter table public.store_domains
  add column status text not null default 'verified'
    check (status in ('pending', 'misconfigured', 'verified', 'error')),
  add column dns_records jsonb not null default '[]' check (jsonb_typeof(dns_records) = 'array'),
  add column requested_by uuid references auth.users (id) on delete set null,
  add column checked_at timestamptz,
  add column last_error text check (last_error is null or char_length(last_error) <= 500);
-- Subdomains are created verified (create_store does not pass a status); a custom domain must say its status, and
-- it is verified exactly when verified_at is set.
update public.store_domains set status = 'pending' where type = 'custom' and verified_at is null;
alter table public.store_domains add constraint store_domains_verified_status
  check (type <> 'custom' or (status = 'verified') = (verified_at is not null));
create unique index store_domains_one_custom_idx on public.store_domains (store_id) where type = 'custom';
create index store_domains_requested_by_idx on public.store_domains (requested_by);

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on public.warehouse_shipping_zones, public.expenses from anon, authenticated;
grant select on public.warehouse_shipping_zones, public.expenses to authenticated;

alter table public.warehouse_shipping_zones enable row level security;
alter table public.expenses enable row level security;

create policy "warehouse_shipping_zones: store staff" on public.warehouse_shipping_zones for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

-- Expenses are finance: owner/admin only (D10).
create policy "expenses: store admins" on public.expenses for select
to authenticated
using ((select private.is_superadmin()) or private.has_store_role(store_id, 'admin'));
