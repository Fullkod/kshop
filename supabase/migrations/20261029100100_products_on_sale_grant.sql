-- products has column grants (search_vector is internal): the new effective "on sale" flag is public.
grant select (on_sale) on public.products to anon, authenticated;
