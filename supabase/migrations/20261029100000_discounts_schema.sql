-- Phase 4: automatic promotions and vouchers (PRP-4 D1–D11). Same rules as the previous phases: store_id on
-- every table, composite FKs to the parent (store_id, id), RLS on all, reads by policy, writes only through
-- the API (service_role) or the SQL functions of the next migration. Voucher codes are a store secret: no
-- anon or customer read at all (they are validated by the API, rate limited).

create type public.discount_reward as enum ('percent', 'fixed');
create type public.discount_target as enum ('product', 'variant', 'category', 'collection', 'brand');
create type public.voucher_scope as enum ('order', 'specific', 'shipping');
create type public.order_discount_kind as enum ('promotion', 'voucher', 'manual');

-- ---------------------------------------------------------------------------
-- Promotions (automatic, per line; the best one wins)
-- ---------------------------------------------------------------------------

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  reward public.discount_reward not null,
  -- Percent (0–100) or amount in the store's base currency.
  value numeric(12, 2) not null check (value > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  -- Tie-break when two promotions leave the same price.
  priority int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  check (reward <> 'percent' or value <= 100),
  check (ends_at is null or ends_at > starts_at)
);

create index promotions_store_idx on public.promotions (store_id, is_active, starts_at);

create table public.promotion_targets (
  store_id uuid not null,
  promotion_id uuid not null,
  target_type public.discount_target not null,
  -- Product, variant, category (with its subcategories), collection or brand of the same store.
  target_id uuid not null,
  primary key (promotion_id, target_type, target_id),
  foreign key (store_id, promotion_id) references public.promotions (store_id, id) on delete cascade
);

create index promotion_targets_target_idx on public.promotion_targets (store_id, target_type, target_id);

-- Materialized: the promotion that applies now to each variant (refreshed when promotions change and every
-- minute for the ones that start or end). The storefront reads it; carts and checkout recompute live.
create table public.variant_promotions (
  variant_id uuid primary key,
  store_id uuid not null,
  product_id uuid not null,
  promotion_id uuid not null,
  promotion_name text not null,
  reward public.discount_reward not null,
  value numeric(12, 2) not null,
  -- Final price in the base currency.
  promo_price numeric(12, 2) not null check (promo_price >= 0),
  ends_at timestamptz,
  foreign key (store_id, variant_id) references public.product_variants (store_id, id) on delete cascade,
  foreign key (store_id, product_id) references public.products (store_id, id) on delete cascade,
  foreign key (store_id, promotion_id) references public.promotions (store_id, id) on delete cascade
);

create index variant_promotions_product_idx on public.variant_promotions (store_id, product_id);
create index variant_promotions_promotion_idx on public.variant_promotions (store_id, promotion_id);

-- ---------------------------------------------------------------------------
-- Vouchers (one per order)
-- ---------------------------------------------------------------------------

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  -- Stored uppercase; the customer may type it in any case.
  code text not null check (code ~ '^[A-Z0-9_-]{3,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  scope public.voucher_scope not null default 'order',
  reward public.discount_reward not null,
  -- Percent (0–100) or amount in the base currency. Free shipping = shipping + percent 100.
  value numeric(12, 2) not null check (value > 0),
  min_subtotal numeric(12, 2) check (min_subtotal is null or min_subtotal > 0),
  min_quantity int check (min_quantity is null or min_quantity > 0),
  usage_limit int check (usage_limit is null or usage_limit > 0),
  usage_per_customer int check (usage_per_customer is null or usage_per_customer > 0),
  used_count int not null default 0 check (used_count >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, code),
  unique (store_id, id),
  check (reward <> 'percent' or value <= 100),
  check (ends_at is null or ends_at > starts_at)
);

create table public.voucher_targets (
  store_id uuid not null,
  voucher_id uuid not null,
  target_type public.discount_target not null,
  target_id uuid not null,
  primary key (voucher_id, target_type, target_id),
  foreign key (store_id, voucher_id) references public.vouchers (store_id, id) on delete cascade
);

create index voucher_targets_store_idx on public.voucher_targets (store_id, voucher_id);

create table public.voucher_usages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  voucher_id uuid not null,
  order_id uuid not null,
  customer_id uuid,
  -- E.164: limits per customer also apply to guests by phone.
  phone text not null,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  currency public.currency_code not null,
  created_at timestamptz not null default now(),
  -- Set when the order is cancelled: the use no longer counts.
  released_at timestamptz,
  unique (order_id),
  foreign key (store_id, voucher_id) references public.vouchers (store_id, id) on delete cascade,
  foreign key (store_id, order_id) references public.orders (store_id, id) on delete cascade,
  foreign key (store_id, customer_id) references public.customers (store_id, id) on delete set null (customer_id)
);

create index voucher_usages_voucher_idx on public.voucher_usages (store_id, voucher_id, created_at desc);
create index voucher_usages_customer_idx on public.voucher_usages (store_id, customer_id);
create index voucher_usages_phone_idx on public.voucher_usages (store_id, voucher_id, phone);

-- ---------------------------------------------------------------------------
-- Order snapshot (D7, D8): promotions are already in order_lines.unit_price; the voucher and the manual
-- discount make up orders.discount_total. Nothing is recomputed when a promotion or voucher changes.
-- ---------------------------------------------------------------------------

create table public.order_discounts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  kind public.order_discount_kind not null,
  -- Promotion or voucher id (null for manual).
  source_id uuid,
  code text,
  name text not null,
  reward public.discount_reward not null,
  value numeric(12, 2) not null,
  -- Amount in the order currency (for promotions: the saving of every line it touched).
  amount numeric(12, 2) not null check (amount >= 0),
  currency public.currency_code not null,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  foreign key (store_id, order_id) references public.orders (store_id, id) on delete cascade
);

create index order_discounts_order_idx on public.order_discounts (store_id, order_id);

alter table public.order_lines
  -- Price before the promotion (order currency); null in orders of phase 3.
  add column unit_list_price numeric(12, 2) check (unit_list_price is null or unit_list_price >= 0),
  -- Promotion saving of the whole line (order currency).
  add column discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  add column promotion_id uuid,
  add column promotion_name text,
  add foreign key (store_id, promotion_id) references public.promotions (store_id, id)
    on delete set null (promotion_id);

create index order_lines_promotion_idx on public.order_lines (store_id, promotion_id);

alter table public.orders add column voucher_code text;
alter table public.carts add column voucher_code text;
-- Effective "on sale" (compare_at_price or an active promotion); min/max_price become effective prices.
alter table public.products add column on_sale boolean not null default false;

-- ---------------------------------------------------------------------------
-- updated_at, privileges and RLS
-- ---------------------------------------------------------------------------

create trigger promotions_set_updated_at before update on public.promotions
for each row execute function private.set_updated_at();
create trigger vouchers_set_updated_at before update on public.vouchers
for each row execute function private.set_updated_at();

revoke all on public.promotions, public.promotion_targets, public.variant_promotions, public.vouchers,
  public.voucher_targets, public.voucher_usages, public.order_discounts
  from anon, authenticated;

grant select on public.variant_promotions to anon, authenticated;
grant select on public.promotions, public.promotion_targets, public.vouchers, public.voucher_targets,
  public.voucher_usages, public.order_discounts
  to authenticated;

alter table public.promotions enable row level security;
alter table public.promotion_targets enable row level security;
alter table public.variant_promotions enable row level security;
alter table public.vouchers enable row level security;
alter table public.voucher_targets enable row level security;
alter table public.voucher_usages enable row level security;
alter table public.order_discounts enable row level security;

create policy "promotions: store staff" on public.promotions for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "promotion_targets: store staff" on public.promotion_targets for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "variant_promotions: public stores, all for staff" on public.variant_promotions for select
to anon, authenticated
using ((select private.store_is_public(store_id))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "vouchers: store staff" on public.vouchers for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "voucher_targets: store staff" on public.voucher_targets for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "voucher_usages: store staff" on public.voucher_usages for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "order_discounts: of own orders, all for staff" on public.order_discounts for select
to authenticated
using (order_id in (select private.my_order_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

comment on table public.promotions is e'@graphql({"totalCount": {"enabled": true}})';
comment on table public.vouchers is e'@graphql({"totalCount": {"enabled": true}})';
comment on table public.voucher_usages is e'@graphql({"totalCount": {"enabled": true}})';
