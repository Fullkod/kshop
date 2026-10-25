-- Phase 3: advisor fixes for the orders schema.

-- Covering index for the composite FK (store_id, cart_id).
create index cart_lines_cart_idx on public.cart_lines (store_id, cart_id);

-- One SELECT policy per role on warehouses (staff of the store, superadmin, or public pickup points).
drop policy "warehouses: pickup points are public" on public.warehouses;
drop policy "warehouses: store staff" on public.warehouses;

create policy "warehouses: pickup points public, all for staff" on public.warehouses for select
to anon, authenticated
using ((is_pickup_point and is_active and (select private.store_is_public(store_id)))
  or store_id in (select private.my_store_ids()) or (select private.is_superadmin()));
