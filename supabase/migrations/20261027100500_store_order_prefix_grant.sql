-- Phase 3: the order prefix is part of every order code (DEMO-1001) shown to customers and staff; the admin
-- reads it through pg_graphql. It was server-only since phase 0b without a reason to hide it.
grant select (order_prefix) on public.stores to anon, authenticated;
