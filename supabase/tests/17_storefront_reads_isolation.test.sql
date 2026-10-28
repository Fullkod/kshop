-- R11: the storefront's sf_* reads run as the caller (security invoker), so a visitor sees what pg_graphql showed:
-- published products of active stores, visible content, never costs or drafts, nothing of a suspended store.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Sf Reads A', 'sf-reads-a', tests.fx('owner_a'), 'CUP', 'FA', null, 'base', 30, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Sf Reads B', 'sf-reads-b', tests.fx('owner_b'), 'CUP', 'FB', null, 'base', 30, 'kshop.fullkod.com', null)).id;

create function pg_temp.seed_product(p_key text, p_store uuid, p_status text) returns void language plpgsql as $$
declare
  v_type uuid; v_product uuid; v_variant uuid;
begin
  insert into public.product_types (store_id, name, slug) values (p_store, p_key, p_key) returning id into v_type;
  insert into public.products (store_id, product_type_id, name, slug, status)
    values (p_store, v_type, 'Producto ' || p_key, p_key, p_status::public.product_status) returning id into v_product;
  insert into pg_temp.fixtures values (p_key, v_product);
  insert into public.product_variants (store_id, product_id, sku, price) values (p_store, v_product, upper(p_key), 100)
    returning id into v_variant;
  insert into public.variant_costs (store_id, variant_id, cost_price, cost_currency) values (p_store, v_variant, 9, 'USD');
end $$;

select pg_temp.seed_product('pub-a', tests.fx('store_a'), 'published');
select pg_temp.seed_product('draft-a', tests.fx('store_a'), 'draft');
select pg_temp.seed_product('pub-b', tests.fx('store_b'), 'published');
insert into public.pages (store_id, slug, title, content, is_published)
values (tests.fx('store_a'), 'visible', 'Visible', 'x', true), (tests.fx('store_a'), 'oculta', 'Oculta', 'x', false);
update public.stores set status = 'suspended' where id = tests.fx('store_b');

-- ---------------------------------------------------------------------------
-- As a visitor
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.eq('anon: the published product of A, not the draft',
  (select format('%s %s',
     jsonb_array_length(public.sf_storefront_product(jsonb_build_object('storeId', tests.fx('store_a'), 'slug', 'pub-a'))
       ->'productsCollection'->'edges'),
     jsonb_array_length(public.sf_storefront_product(jsonb_build_object('storeId', tests.fx('store_a'), 'slug', 'draft-a'))
       ->'productsCollection'->'edges'))),
  '1 0');
select tests.eq('anon: the listing of A has only its published product',
  (select public.sf_storefront_products(jsonb_build_object('storeId', tests.fx('store_a'), 'first', 24))
     ->'storefrontSearchProducts'->>'totalCount'),
  '1');
select tests.check('anon: no cost in the product page, cards or listing',
  (select not (concat(
     public.sf_storefront_product_by_id(jsonb_build_object('storeId', tests.fx('store_a'), 'id', tests.fx('pub-a'))),
     public.sf_storefront_product_cards(jsonb_build_object('storeId', tests.fx('store_a'),
       'ids', jsonb_build_array(tests.fx('pub-a'), tests.fx('draft-a')))),
     public.sf_storefront_products(jsonb_build_object('storeId', tests.fx('store_a'), 'first', 24))
   ) ~* '(cost|"9\.00")')));
select tests.eq('anon: the cards of a draft or of another store are left out',
  (select jsonb_array_length(public.sf_storefront_product_cards(jsonb_build_object('storeId', tests.fx('store_a'),
     'ids', jsonb_build_array(tests.fx('draft-a'), tests.fx('pub-b'))))->'productsCollection'->'edges')),
  0);
select tests.eq('anon: the visible page of A, not the hidden one',
  (select format('%s %s',
     jsonb_array_length(public.sf_storefront_page(jsonb_build_object('storeId', tests.fx('store_a'), 'slug', 'visible'))
       ->'pagesCollection'->'edges'),
     jsonb_array_length(public.sf_storefront_page(jsonb_build_object('storeId', tests.fx('store_a'), 'slug', 'oculta'))
       ->'pagesCollection'->'edges'))),
  '1 0');
-- The card of a suspended store stays readable (the web shows its «suspended» notice); its products do not.
select tests.eq('anon: a suspended store shows only its card, no products',
  (select format('%s %s',
     public.sf_store_by_slug('{"slug": "sf-reads-b"}')->'storesCollection'->'edges'->0->'node'->>'status',
     public.sf_storefront_products(jsonb_build_object('storeId', tests.fx('store_b'), 'first', 24))
       ->'storefrontSearchProducts'->>'totalCount')),
  'suspended 0');
select tests.check('anon: the active store A is public',
  (select jsonb_array_length(public.sf_store_by_slug('{"slug": "sf-reads-a"}')->'storesCollection'->'edges') = 1));
select tests.logout();
