-- KSH0004: a store on the «Caja» plan sells at the counter and keeps its catalog, but has no online store: nothing of
-- it is public (anon reads, public_store_ids, storefront_features), its card by slug still resolves (the local page),
-- the counter sale works, and moving it to Base turns the web on, and back off, without touching any data.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Caja Test A', 'caja-test-a', tests.fx('owner_a'), 'CUP', 'CA', '5351111111', 'caja', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Caja Test B', 'caja-test-b', tests.fx('owner_b'), 'CUP', 'CB', '5352222222', 'base', 0, 'kshop.fullkod.com', null)).id;

create function pg_temp.seed(p_store text, p_owner text, p_prefix text) returns void
language plpgsql as $$
declare
  v_type uuid; v_product uuid;
begin
  insert into public.product_types (store_id, name, slug) values (tests.fx(p_store), 'Simple', 'simple')
    returning id into v_type;
  v_product := public.save_product(tests.fx(p_store), jsonb_build_object(
    'product_type_id', v_type, 'name', 'Arroz ' || p_prefix, 'slug', 'arroz-' || p_prefix, 'status', 'published',
    'variants', jsonb_build_array(jsonb_build_object('sku', upper(p_prefix) || '-ARROZ', 'price', 1000, 'stock', 5))),
    tests.fx(p_owner));
  insert into pg_temp.fixtures select p_prefix || '_variant', id from public.product_variants where product_id = v_product;
end;
$$;
select pg_temp.seed('store_a', 'owner_a', 'a');
select pg_temp.seed('store_b', 'owner_b', 'b');

-- ---------------------------------------------------------------------------
-- The plan and its modules
-- ---------------------------------------------------------------------------

select tests.check('caja: counter, orders, catalog, sales of the day and Excel are on',
  private.store_has_module(tests.fx('store_a'), 'pos') and private.store_has_module(tests.fx('store_a'), 'orders')
  and private.store_has_module(tests.fx('store_a'), 'catalog') and private.store_has_module(tests.fx('store_a'), 'sales_today')
  and private.store_has_module(tests.fx('store_a'), 'excel_import'));
select tests.check('caja: no online store, shipping, discounts nor app',
  not private.store_has_module(tests.fx('store_a'), 'storefront') and not private.store_has_module(tests.fx('store_a'), 'shipping')
  and not private.store_has_module(tests.fx('store_a'), 'discounts') and not private.store_has_module(tests.fx('store_a'), 'mobile_app'));
select tests.check('base: the online store is on', private.store_has_module(tests.fx('store_b'), 'storefront'));
select tests.eq('caja: 300 products and 2 staff', public.store_limits(tests.fx('store_a')),
  '{"max_staff": 2, "max_products": 300}'::jsonb);

select tests.check('caja store is not public', not private.store_is_public(tests.fx('store_a')));
select tests.check('base store is public', private.store_is_public(tests.fx('store_b')));
select tests.eq('public_store_ids: only the Base store',
  (select count(*) from private.public_store_ids() p where p in (tests.fx('store_a'), tests.fx('store_b')))::int, 1);

-- ---------------------------------------------------------------------------
-- anon (the web): nothing of the Caja store, its card still resolves
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.eq('anon: sees the products of the Base store only',
  (select count(*) from public.products where store_id in (tests.fx('store_a'), tests.fx('store_b')))::int, 1);
select tests.eq('anon: no variants of the Caja store',
  (select count(*) from public.product_variants where store_id = tests.fx('store_a'))::int, 0);
select tests.eq('anon: no categories, brands nor payment methods of the Caja store',
  (select count(*) from public.categories where store_id = tests.fx('store_a'))
  + (select count(*) from public.brands where store_id = tests.fx('store_a'))
  + (select count(*) from public.payment_methods where store_id = tests.fx('store_a')), 0::bigint);
select tests.check('anon: storefront_features of the Caja store is empty',
  public.storefront_features(tests.fx('store_a')) is null);
select tests.eq('anon: the Caja store card resolves by slug (the local page needs it)',
  jsonb_array_length(public.sf_store_by_slug(jsonb_build_object('slug', 'caja-test-a')) -> 'storesCollection' -> 'edges'), 1);
select tests.logout();

-- ---------------------------------------------------------------------------
-- The counter sells on the Caja plan
-- ---------------------------------------------------------------------------

insert into pg_temp.fixtures (key, id)
select 'sale_1', (public.pos_record_sale(tests.fx('store_a'), jsonb_build_object(
    'id', '21111111-1111-4111-8111-111111111111', 'device_id', '00000000-0000-4000-8000-000000000001',
    'local_number', 'C-1', 'sold_at', now(),
    'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx('a_variant'), 'quantity', 2, 'unit_price', 1000,
      'product_name', 'Arroz a')),
    'payments', jsonb_build_array(jsonb_build_object('amount', 2000, 'currency', 'CUP'))), tests.fx('owner_a')) ->> 'order_id')::uuid;
select tests.eq('caja: a counter sale is recorded as a delivered order',
  (select status::text from public.orders where id = tests.fx('sale_1')), 'delivered');
select tests.eq('caja: the sale took its stock',
  (select stock_available from public.product_variants where id = tests.fx('a_variant')), 3::numeric);

-- ---------------------------------------------------------------------------
-- Up to Base: the web turns on; back to Caja: off, nothing lost
-- ---------------------------------------------------------------------------

select public.change_plan(tests.fx('store_a'), 'base', 'month', null);
select tests.check('after moving to Base the store is public', private.store_is_public(tests.fx('store_a')));
select tests.login_anon();
select tests.eq('anon: now sees the products of both stores',
  (select count(*) from public.products where store_id in (tests.fx('store_a'), tests.fx('store_b')))::int, 2);
select tests.logout();

select public.change_plan(tests.fx('store_a'), 'caja', 'month', null);
select tests.check('back to Caja: not public again', not private.store_is_public(tests.fx('store_a')));
select tests.eq('back to Caja: the catalog and the sale are still there',
  (select count(*) from public.products where store_id = tests.fx('store_a'))
  + (select count(*) from public.orders where store_id = tests.fx('store_a') and channel = 'pos'), 2::bigint);
select tests.check('back to Caja: the online store module is disabled, not deleted',
  exists (select 1 from public.store_modules where store_id = tests.fx('store_a') and module_code = 'storefront' and not enabled));
