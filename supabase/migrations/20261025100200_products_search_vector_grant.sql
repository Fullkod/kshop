-- admin_search_products (security invoker) returns products.*, so signed-in staff need search_vector too.
-- Rows are still filtered by RLS; anon keeps no access to the column (it cannot call the function either).
grant select (search_vector) on public.products to authenticated;
