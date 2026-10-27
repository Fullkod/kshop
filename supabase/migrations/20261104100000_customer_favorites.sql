-- Redesign v2 (PRP-R D3): favorites saved in the store, per customer account. Same rules as the customer tables of
-- Phase 3: store_id first, composite FKs so a favorite never points to another store's customer or product, reads by
-- policy (own rows with a customer token of the same store, staff of the store), writes only through the API
-- (service_role).

create table public.customer_favorites (
  store_id uuid not null,
  customer_id uuid not null,
  product_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (store_id, customer_id, product_id),
  foreign key (store_id, customer_id) references public.customers (store_id, id) on delete cascade,
  foreign key (store_id, product_id) references public.products (store_id, id) on delete cascade
);

-- The PK covers the customer FK and "my favorites, newest first" reads; this one covers the product FK (cascades).
create index customer_favorites_product_idx on public.customer_favorites (store_id, product_id);

revoke all on public.customer_favorites from anon, authenticated;
grant select on public.customer_favorites to authenticated;

alter table public.customer_favorites enable row level security;

create policy "customer_favorites: own, all for staff" on public.customer_favorites for select
to authenticated
using (customer_id in (select private.my_customer_ids())
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));
