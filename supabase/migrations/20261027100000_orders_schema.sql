-- Phase 3: customers, shipping, payment methods, carts, orders, reservations, events, payments and refunds.
-- Same rules as the catalog: store_id on every table, composite FKs to the parent (store_id, id), RLS on all,
-- reads by policy, every write through the API (service_role) or the SQL functions of the next migration.
-- Customers and staff share the `authenticated` role, so data the customer must never see (line costs,
-- internal notes) lives in its own table/rows instead of column grants.

create type public.order_status as enum (
  'pending_confirmation', 'pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'
);
create type public.payment_status as enum ('unpaid', 'partially_paid', 'paid', 'refunded');
create type public.order_channel as enum ('web', 'app', 'admin');
create type public.shipping_type as enum ('delivery', 'pickup', 'to_agree');
create type public.cart_status as enum ('active', 'converted', 'abandoned');
create type public.reservation_status as enum ('active', 'consumed', 'released');

-- ---------------------------------------------------------------------------
-- Customers: one account per store (synthetic email in auth.users, app_metadata {store_id, kind: customer})
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- E.164 (+5351234567). Not verified (decision 23): it is only the login identifier.
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text check (last_name is null or char_length(last_name) <= 80),
  is_blocked boolean not null default false,
  accepts_marketing boolean not null default false,
  last_order_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, phone),
  unique (store_id, user_id),
  unique (store_id, id)
);

create index customers_user_idx on public.customers (user_id);
create index customers_store_created_idx on public.customers (store_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Shipping (decision 13) and payment methods
-- ---------------------------------------------------------------------------

create table public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id)
);

create index shipping_zones_store_idx on public.shipping_zones (store_id, sort_order);

create table public.shipping_methods (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  -- null = available in every zone (typical for pickup).
  zone_id uuid,
  type public.shipping_type not null,
  name text not null check (char_length(name) between 1 and 80),
  -- In the store's base currency; converted with the order rate.
  price numeric(12, 2) not null default 0 check (price >= 0),
  free_over_subtotal numeric(12, 2) check (free_over_subtotal is null or free_over_subtotal > 0),
  -- Pickup point (warehouses.is_pickup_point).
  warehouse_id uuid,
  min_days int check (min_days is null or min_days >= 0),
  max_days int check (max_days is null or max_days >= 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id) references public.stores (id) on delete cascade,
  foreign key (store_id, zone_id) references public.shipping_zones (store_id, id) on delete cascade,
  foreign key (store_id, warehouse_id) references public.warehouses (store_id, id),
  check (type <> 'pickup' or warehouse_id is not null),
  check (type <> 'to_agree' or (price = 0 and free_over_subtotal is null)),
  check (min_days is null or max_days is null or min_days <= max_days)
);

create index shipping_methods_store_idx on public.shipping_methods (store_id, zone_id, sort_order);
create index shipping_methods_warehouse_idx on public.shipping_methods (store_id, warehouse_id);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- Empty = every sale currency of the store.
  currencies public.currency_code[] not null default '{}',
  instructions text check (instructions is null or char_length(instructions) <= 1000),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id)
);

create index payment_methods_store_idx on public.payment_methods (store_id, sort_order);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  customer_id uuid not null,
  label text check (label is null or char_length(label) <= 40),
  recipient text not null check (char_length(recipient) between 1 and 120),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  shipping_zone_id uuid,
  address text not null check (char_length(address) between 1 and 300),
  reference text check (reference is null or char_length(reference) <= 300),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id, customer_id) references public.customers (store_id, id) on delete cascade,
  foreign key (store_id, shipping_zone_id) references public.shipping_zones (store_id, id)
    on delete set null (shipping_zone_id)
);

create index customer_addresses_customer_idx on public.customer_addresses (store_id, customer_id);
create index customer_addresses_zone_idx on public.customer_addresses (store_id, shipping_zone_id);
create unique index customer_addresses_one_default_idx on public.customer_addresses (customer_id) where is_default;

-- ---------------------------------------------------------------------------
-- Carts (D8): server-side, guest token or customer
-- ---------------------------------------------------------------------------

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  -- Guest handle kept by the browser/app; never exposed through pg_graphql.
  token uuid not null default gen_random_uuid() unique,
  customer_id uuid,
  currency public.currency_code,
  status public.cart_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, customer_id) references public.customers (store_id, id) on delete set null (customer_id)
);

create index carts_store_updated_idx on public.carts (store_id, status, updated_at desc);
create unique index carts_one_active_per_customer_idx on public.carts (store_id, customer_id)
  where status = 'active' and customer_id is not null;

create table public.cart_lines (
  store_id uuid not null,
  cart_id uuid not null,
  variant_id uuid not null,
  quantity int not null check (quantity between 1 and 999),
  added_at timestamptz not null default now(),
  primary key (cart_id, variant_id),
  foreign key (store_id, cart_id) references public.carts (store_id, id) on delete cascade,
  foreign key (store_id, variant_id) references public.product_variants (store_id, id) on delete cascade
);

create index cart_lines_variant_idx on public.cart_lines (store_id, variant_id);

-- ---------------------------------------------------------------------------
-- Orders (D9–D15)
-- ---------------------------------------------------------------------------

create table public.store_order_counters (
  store_id uuid primary key references public.stores (id) on delete cascade,
  -- First order is 1001.
  last_number int not null default 1000
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  number int not null,
  -- Public order page /order/{public_token}: unguessable, unlike the number.
  public_token uuid not null default gen_random_uuid() unique,
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 8 and 100),
  customer_id uuid,
  channel public.order_channel not null default 'web',
  status public.order_status not null default 'pending_confirmation',
  payment_status public.payment_status not null default 'unpaid',
  -- Order currency and its rate to the base currency at checkout (frozen).
  currency public.currency_code not null,
  exchange_rate numeric(18, 6) not null default 1 check (exchange_rate > 0),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  -- null while the shipping cost is "to agree".
  shipping_total numeric(12, 2) check (shipping_total is null or shipping_total >= 0),
  discount_total numeric(12, 2) not null default 0 check (discount_total >= 0),
  total numeric(12, 2) check (total is null or total >= 0),
  paid_total numeric(12, 2) not null default 0,
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  customer_phone text not null check (customer_phone ~ '^\+[1-9][0-9]{7,14}$'),
  shipping_type public.shipping_type,
  shipping_zone_id uuid,
  shipping_method_id uuid,
  -- Zone, method, address, reference and pickup point as they were at checkout.
  shipping_snapshot jsonb not null default '{}',
  payment_method_id uuid,
  payment_snapshot jsonb not null default '{}',
  -- Warehouse holding the reservation.
  warehouse_id uuid not null,
  customer_note text check (customer_note is null or char_length(customer_note) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, number),
  unique (store_id, idempotency_key),
  unique (store_id, id),
  check ((shipping_total is null) = (total is null)),
  foreign key (store_id, customer_id) references public.customers (store_id, id) on delete set null (customer_id),
  foreign key (store_id, shipping_zone_id) references public.shipping_zones (store_id, id)
    on delete set null (shipping_zone_id),
  foreign key (store_id, shipping_method_id) references public.shipping_methods (store_id, id)
    on delete set null (shipping_method_id),
  foreign key (store_id, payment_method_id) references public.payment_methods (store_id, id)
    on delete set null (payment_method_id),
  foreign key (store_id, warehouse_id) references public.warehouses (store_id, id)
);

create index orders_store_status_idx on public.orders (store_id, status, created_at desc);
create index orders_store_created_idx on public.orders (store_id, created_at desc);
create index orders_customer_idx on public.orders (store_id, customer_id, created_at desc);
create index orders_zone_idx on public.orders (store_id, shipping_zone_id);
create index orders_method_idx on public.orders (store_id, shipping_method_id);
create index orders_payment_method_idx on public.orders (store_id, payment_method_id);
create index orders_warehouse_idx on public.orders (store_id, warehouse_id);
create index orders_created_by_idx on public.orders (created_by);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  variant_id uuid,
  product_id uuid,
  product_name text not null,
  variant_name text not null default '',
  sku text not null,
  attributes jsonb not null default '[]',
  image_url text,
  quantity int not null check (quantity between 1 and 999),
  -- Prices in the order currency.
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price is null or compare_at_price >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  sort_order int not null default 0,
  unique (store_id, id),
  foreign key (store_id, order_id) references public.orders (store_id, id) on delete cascade,
  foreign key (store_id, variant_id) references public.product_variants (store_id, id) on delete set null (variant_id),
  foreign key (store_id, product_id) references public.products (store_id, id) on delete set null (product_id)
);

create index order_lines_order_idx on public.order_lines (store_id, order_id, sort_order);
create index order_lines_variant_idx on public.order_lines (store_id, variant_id);
create index order_lines_product_idx on public.order_lines (store_id, product_id);

-- Private: cost snapshot per line (admins only, like variant_costs).
create table public.order_line_costs (
  store_id uuid not null,
  order_line_id uuid primary key,
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  cost_currency public.currency_code not null,
  foreign key (store_id, order_line_id) references public.order_lines (store_id, id) on delete cascade
);

create index order_line_costs_store_idx on public.order_line_costs (store_id, order_line_id);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  variant_id uuid not null,
  warehouse_id uuid not null,
  quantity int not null check (quantity > 0),
  status public.reservation_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id, order_id) references public.orders (store_id, id) on delete cascade,
  foreign key (store_id, variant_id) references public.product_variants (store_id, id) on delete cascade,
  foreign key (store_id, warehouse_id) references public.warehouses (store_id, id) on delete cascade
);

create index inventory_reservations_order_idx on public.inventory_reservations (store_id, order_id);
create index inventory_reservations_variant_idx on public.inventory_reservations (store_id, variant_id, status);
create index inventory_reservations_warehouse_idx on public.inventory_reservations (store_id, warehouse_id);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  -- created, status_changed, shipping_set, payment_recorded, refund_recorded, cancelled, note...
  type text not null check (type ~ '^[a-z_]{2,40}$'),
  -- Staff-only rows (notes, internal details) are hidden from the customer by RLS.
  is_internal boolean not null default false,
  payload jsonb not null default '{}',
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (store_id, order_id) references public.orders (store_id, id) on delete cascade
);

create index order_events_order_idx on public.order_events (store_id, order_id, created_at);
create index order_events_user_idx on public.order_events (user_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  payment_method_id uuid,
  amount numeric(12, 2) not null check (amount > 0),
  currency public.currency_code not null,
  reference text check (reference is null or char_length(reference) <= 120),
  -- Proof of payment in the store-media bucket: stores/{store_id}/payments/...
  evidence_path text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (store_id, order_id) references public.orders (store_id, id) on delete cascade,
  foreign key (store_id, payment_method_id) references public.payment_methods (store_id, id)
    on delete set null (payment_method_id)
);

create index payments_order_idx on public.payments (store_id, order_id, created_at);
create index payments_store_created_idx on public.payments (store_id, created_at desc);
create index payments_method_idx on public.payments (store_id, payment_method_id);
create index payments_recorded_by_idx on public.payments (recorded_by);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency public.currency_code not null,
  reason text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (store_id, order_id) references public.orders (store_id, id) on delete cascade
);

create index refunds_order_idx on public.refunds (store_id, order_id);
create index refunds_recorded_by_idx on public.refunds (recorded_by);

-- ---------------------------------------------------------------------------
-- Private: password recovery codes (D5) and attempt counters (rate limiting without Redis)
-- ---------------------------------------------------------------------------

create table private.customer_otps (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  purpose text not null default 'password_reset' check (purpose in ('password_reset')),
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index customer_otps_customer_idx on private.customer_otps (customer_id, created_at desc);
create index customer_otps_store_idx on private.customer_otps (store_id);
create index customer_otps_created_by_idx on private.customer_otps (created_by);

create table private.auth_attempts (
  id bigint generated always as identity primary key,
  -- e.g. login:{store_id}:{phone} or login-ip:{store_id}:{ip}
  key text not null,
  created_at timestamptz not null default now()
);

create index auth_attempts_key_idx on private.auth_attempts (key, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create trigger customers_set_updated_at before update on public.customers
for each row execute function private.set_updated_at();
create trigger customer_addresses_set_updated_at before update on public.customer_addresses
for each row execute function private.set_updated_at();
create trigger shipping_zones_set_updated_at before update on public.shipping_zones
for each row execute function private.set_updated_at();
create trigger shipping_methods_set_updated_at before update on public.shipping_methods
for each row execute function private.set_updated_at();
create trigger payment_methods_set_updated_at before update on public.payment_methods
for each row execute function private.set_updated_at();
create trigger carts_set_updated_at before update on public.carts
for each row execute function private.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
for each row execute function private.set_updated_at();
create trigger inventory_reservations_set_updated_at before update on public.inventory_reservations
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Customer helpers (D7): the JWT must be a customer token of the same store as the row
-- ---------------------------------------------------------------------------

create function private.my_customer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.customers c
  where c.user_id = (select auth.uid())
    and (select auth.jwt() -> 'app_metadata' ->> 'kind') = 'customer'
    and c.store_id = private.try_uuid((select auth.jwt() -> 'app_metadata' ->> 'store_id'));
$$;

create function private.my_order_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id from public.orders o where o.customer_id in (select private.my_customer_ids());
$$;

revoke all on function private.my_customer_ids(), private.my_order_ids() from public;
grant execute on function private.my_customer_ids(), private.my_order_ids() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.customers, public.customer_addresses, public.shipping_zones, public.shipping_methods,
  public.payment_methods, public.carts, public.cart_lines, public.store_order_counters, public.orders,
  public.order_lines, public.order_line_costs, public.inventory_reservations, public.order_events,
  public.payments, public.refunds
  from anon, authenticated;
revoke all on private.customer_otps, private.auth_attempts from public, anon, authenticated;

-- Checkout options are public (active ones of active stores).
grant select on public.shipping_zones, public.shipping_methods, public.payment_methods to anon, authenticated;
-- Pickup points: only what the storefront shows (staff keep reading every column as authenticated).
grant select (id, store_id, name, address, is_pickup_point, is_active) on public.warehouses to anon;
-- Customers (own rows) and staff (their store). carts.token is a guest secret: never through pg_graphql.
grant select on public.customers, public.customer_addresses, public.orders, public.order_lines,
  public.order_events, public.payments, public.refunds, public.inventory_reservations, public.order_line_costs,
  public.cart_lines
  to authenticated;
grant select (id, store_id, customer_id, currency, status, created_at, updated_at) on public.carts to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.shipping_zones enable row level security;
alter table public.shipping_methods enable row level security;
alter table public.payment_methods enable row level security;
alter table public.carts enable row level security;
alter table public.cart_lines enable row level security;
alter table public.store_order_counters enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_line_costs enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.order_events enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
-- No policies on purpose: service_role only.
alter table private.customer_otps enable row level security;
alter table private.auth_attempts enable row level security;

create policy "shipping_zones: active in active stores, all for staff" on public.shipping_zones for select
to anon, authenticated
using ((is_active and (select private.store_is_public(store_id)))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "shipping_methods: active in active stores, all for staff" on public.shipping_methods for select
to anon, authenticated
using ((is_active and (select private.store_is_public(store_id)))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "payment_methods: active in active stores, all for staff" on public.payment_methods for select
to anon, authenticated
using ((is_active and (select private.store_is_public(store_id)))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "warehouses: pickup points are public" on public.warehouses for select
to anon, authenticated
using (is_pickup_point and is_active and (select private.store_is_public(store_id)));

create policy "customers: own row, all for staff" on public.customers for select
to authenticated
using (id in (select private.my_customer_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "customer_addresses: own, all for staff" on public.customer_addresses for select
to authenticated
using (customer_id in (select private.my_customer_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "carts: store staff" on public.carts for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "cart_lines: store staff" on public.cart_lines for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "store_order_counters: store staff" on public.store_order_counters for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "orders: own, all for staff" on public.orders for select
to authenticated
using (customer_id in (select private.my_customer_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "order_lines: of own orders, all for staff" on public.order_lines for select
to authenticated
using (order_id in (select private.my_order_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "order_line_costs: store admins" on public.order_line_costs for select
to authenticated
using ((select private.is_superadmin()) or private.has_store_role(store_id, 'admin'));

create policy "inventory_reservations: store staff" on public.inventory_reservations for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "order_events: public events of own orders, all for staff" on public.order_events for select
to authenticated
using ((not is_internal and order_id in (select private.my_order_ids()))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "payments: of own orders, all for staff" on public.payments for select
to authenticated
using (order_id in (select private.my_order_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "refunds: of own orders, all for staff" on public.refunds for select
to authenticated
using (order_id in (select private.my_order_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

-- pg_graphql: totals for paginated admin listings.
comment on table public.orders is e'@graphql({"totalCount": {"enabled": true}})';
comment on table public.customers is e'@graphql({"totalCount": {"enabled": true}})';
