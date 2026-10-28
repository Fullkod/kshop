-- R11 · G13: read policies of the staff without a function per row, and the cheap branches first. Same rules as before
-- (the RLS tests are the proof); only how Postgres evaluates them changes:
--   * private.store_is_public(store_id) ran once per row (correlated): now store_id IN (SELECT public_store_ids()),
--     an uncorrelated subquery that Postgres turns into a hashed subplan built once per query (as R10 did for
--     products). Same condition: the store is active.
--   * private.has_store_role(store_id, 'admin') ran once per row too: now store_id IN (SELECT my_admin_store_ids())
--     (new helper, same condition: a membership with role >= admin).
--   * The OR branches go superadmin (one InitPlan), then «my store», then «public». The staff reading their own
--     catalog no longer builds the list of published products/variants of the whole platform first (4.7 ms -> 0.7 ms
--     per nested collection in the diagnosis).
--   * my_store_ids / my_admin_store_ids return a handful of rows, not the default estimate of 1 000.
-- Generated from the live policies (pg_policies) of 2026-10-28.

create function private.my_admin_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
rows 5
as $$
  select m.store_id from public.store_members m
  where m.user_id = (select auth.uid()) and m.role >= 'admin'::public.store_role;
$$;

revoke all on function private.my_admin_store_ids() from public;
grant execute on function private.my_admin_store_ids() to anon, authenticated, service_role;

alter function private.my_store_ids() rows 5;

alter policy "attribute_values: public in active stores, all for staff" on public.attribute_values
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (store_id IN ( SELECT private.public_store_ids() AS public_store_ids))
);

alter policy "attributes: public in active stores, all for staff" on public.attributes
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (visible_in_storefront AND (store_id IN ( SELECT private.public_store_ids() AS public_store_ids)))
);

alter policy "banners: scheduled in active stores, all for staff" on public.banners
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (private.is_scheduled_visible(is_visible, starts_at, ends_at) AND (store_id IN ( SELECT private.public_store_ids() AS public_store_ids)))
);

alter policy "brands: published in active stores, all for staff" on public.brands
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (is_published AND (store_id IN ( SELECT private.public_store_ids() AS public_store_ids)))
);

alter policy "categories: public in active stores, all for staff" on public.categories
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (store_id IN ( SELECT private.public_store_ids() AS public_store_ids))
);

alter policy "collection_products: public pairs, all for staff" on public.collection_products
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or ((product_id IN ( SELECT private.public_product_ids() AS public_product_ids)) AND (EXISTS ( SELECT 1
   FROM collections c
  WHERE ((c.id = collection_products.collection_id) AND c.is_published))))
);

alter policy "collections: published in active stores, all for staff" on public.collections
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (is_published AND (store_id IN ( SELECT private.public_store_ids() AS public_store_ids)))
);

alter policy "currency_rate_history: store admins" on public.currency_rate_history
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_admin_store_ids() AS my_admin_store_ids))
);

alter policy "expenses: store admins" on public.expenses
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_admin_store_ids() AS my_admin_store_ids))
);

alter policy "home_section_banners: active stores, all for staff" on public.home_section_banners
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (store_id IN ( SELECT private.public_store_ids() AS public_store_ids))
);

alter policy "home_sections: scheduled in active stores, all for staff" on public.home_sections
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (private.is_scheduled_visible(is_visible, starts_at, ends_at) AND (store_id IN ( SELECT private.public_store_ids() AS public_store_ids)))
);

alter policy "import_job_rows: store admins" on public.import_job_rows
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_admin_store_ids() AS my_admin_store_ids))
);

alter policy "import_jobs: store admins" on public.import_jobs
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_admin_store_ids() AS my_admin_store_ids))
);

alter policy "menu_items: active stores, all for staff" on public.menu_items
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (store_id IN ( SELECT private.public_store_ids() AS public_store_ids))
);

alter policy "menus: active stores, all for staff" on public.menus
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (store_id IN ( SELECT private.public_store_ids() AS public_store_ids))
);

alter policy "notification_log: store staff, superadmin" on public.notification_log
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or ((store_id IN ( SELECT private.my_store_ids() AS my_store_ids)) AND ((event !~~ 'billing\_%'::text) OR (store_id IN ( SELECT private.my_admin_store_ids() AS my_admin_store_ids))))
);

alter policy "order_line_costs: store admins" on public.order_line_costs
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_admin_store_ids() AS my_admin_store_ids))
);

alter policy "pages: published in active stores, all for staff" on public.pages
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (is_published AND (store_id IN ( SELECT private.public_store_ids() AS public_store_ids)))
);

alter policy "payment_methods: active in active stores, all for staff" on public.payment_methods
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (is_active AND (store_id IN ( SELECT private.public_store_ids() AS public_store_ids)))
);

alter policy "platform_invoice_lines: owner/admin and superadmin" on public.platform_invoice_lines
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_admin_store_ids() AS my_admin_store_ids))
);

alter policy "platform_invoices: owner/admin and superadmin" on public.platform_invoices
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_admin_store_ids() AS my_admin_store_ids))
);

alter policy "platform_payments: owner/admin and superadmin" on public.platform_payments
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_admin_store_ids() AS my_admin_store_ids))
);

alter policy "product_attribute_values: with a public product, all for staff" on public.product_attribute_values
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (product_id IN ( SELECT private.public_product_ids() AS public_product_ids))
);

alter policy "product_media: with a public product, all for staff" on public.product_media
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (product_id IN ( SELECT private.public_product_ids() AS public_product_ids))
);

alter policy "product_tags: with a public product, all for staff" on public.product_tags
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (product_id IN ( SELECT private.public_product_ids() AS public_product_ids))
);

alter policy "product_type_attributes: public in active stores, all for staff" on public.product_type_attributes
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (store_id IN ( SELECT private.public_store_ids() AS public_store_ids))
);

alter policy "product_types: public in active stores, all for staff" on public.product_types
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (store_id IN ( SELECT private.public_store_ids() AS public_store_ids))
);

alter policy "product_variants: with a public product, all for staff" on public.product_variants
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (product_id IN ( SELECT private.public_product_ids() AS public_product_ids))
);

alter policy "shipping_methods: active in active stores, all for staff" on public.shipping_methods
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (is_active AND (store_id IN ( SELECT private.public_store_ids() AS public_store_ids)))
);

alter policy "shipping_zones: active in active stores, all for staff" on public.shipping_zones
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (is_active AND (store_id IN ( SELECT private.public_store_ids() AS public_store_ids)))
);

alter policy "store_app_builds: store admins" on public.store_app_builds
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or ((store_id IS NOT NULL) AND (store_id IN ( SELECT private.my_admin_store_ids() AS my_admin_store_ids)))
);

alter policy "store_app_requests: store admins" on public.store_app_requests
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_admin_store_ids() AS my_admin_store_ids))
);

alter policy "store_currencies: sale currencies public, all for staff" on public.store_currencies
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (sells AND (store_id IN ( SELECT private.public_store_ids() AS public_store_ids)))
);

alter policy "subscription_grants: owner/admin and superadmin" on public.subscription_grants
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_admin_store_ids() AS my_admin_store_ids))
);

alter policy "variant_attribute_values: with a public variant, all for staff" on public.variant_attribute_values
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (variant_id IN ( SELECT private.public_variant_ids() AS public_variant_ids))
);

alter policy "variant_costs: store admins" on public.variant_costs
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_admin_store_ids() AS my_admin_store_ids))
);

alter policy "variant_media: with a public variant, all for staff" on public.variant_media
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (variant_id IN ( SELECT private.public_variant_ids() AS public_variant_ids))
);

alter policy "variant_prices: with a public variant, all for staff" on public.variant_prices
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (variant_id IN ( SELECT private.public_variant_ids() AS public_variant_ids))
);

alter policy "variant_promotions: public stores, all for staff" on public.variant_promotions
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (store_id IN ( SELECT private.public_store_ids() AS public_store_ids))
);

alter policy "warehouses: pickup points public, all for staff" on public.warehouses
using (
  ( SELECT private.is_superadmin() AS is_superadmin)
  or (store_id IN ( SELECT private.my_store_ids() AS my_store_ids))
  or (is_pickup_point AND is_active AND (store_id IN ( SELECT private.public_store_ids() AS public_store_ids)))
);

