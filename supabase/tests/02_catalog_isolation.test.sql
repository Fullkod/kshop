-- Phase 1: catalog isolation between stores A (Base) and B (Pro), cost privacy, cross-store FKs,
-- modules and limits enforced by the database, and the write functions.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Cat Test A', 'cat-test-a', tests.fx('owner_a'), 'CUP', 'CA', null, 'base', 30, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Cat Test B', 'cat-test-b', tests.fx('owner_b'), 'USD', 'CB', null, 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');

insert into pg_temp.fixtures (key, id)
select 'wh_a', id from public.warehouses where store_id = tests.fx('store_a') and is_default;
insert into pg_temp.fixtures (key, id)
select 'wh_b', id from public.warehouses where store_id = tests.fx('store_b') and is_default;

-- Structure for both stores: attribute Talla (S, M), type Ropa with Talla as variant attribute,
-- category, brand, collection.
create function pg_temp.seed_structure(p_prefix text, p_store uuid) returns void language plpgsql as $$
declare
  v_attr uuid; v_type uuid;
begin
  insert into public.attributes (store_id, name, slug) values (p_store, 'Talla', 'talla') returning id into v_attr;
  insert into pg_temp.fixtures values (p_prefix || 'attr', v_attr);
  with x as (insert into public.attribute_values (store_id, attribute_id, name, slug) values (p_store, v_attr, 'S', 's') returning id) insert into pg_temp.fixtures select p_prefix || 'val_s', id from x;
  with x as (insert into public.attribute_values (store_id, attribute_id, name, slug) values (p_store, v_attr, 'M', 'm') returning id) insert into pg_temp.fixtures select p_prefix || 'val_m', id from x;
  insert into public.product_types (store_id, name, slug, has_variants) values (p_store, 'Ropa', 'ropa', true)
    returning id into v_type;
  insert into pg_temp.fixtures values (p_prefix || 'type', v_type);
  insert into public.product_type_attributes (store_id, product_type_id, attribute_id, scope, variant_selection)
  values (p_store, v_type, v_attr, 'variant', true);
  with x as (insert into public.categories (store_id, name, slug) values (p_store, 'Mujer', 'mujer') returning id) insert into pg_temp.fixtures select p_prefix || 'cat', id from x;
  with x as (insert into public.brands (store_id, name, slug) values (p_store, 'Kaya', 'kaya') returning id) insert into pg_temp.fixtures select p_prefix || 'brand', id from x;
  with x as (insert into public.collections (store_id, name, slug) values (p_store, 'Novedades', 'novedades') returning id) insert into pg_temp.fixtures select p_prefix || 'coll', id from x;
end $$;

select pg_temp.seed_structure('a_', tests.fx('store_a'));
select pg_temp.seed_structure('b_', tests.fx('store_b'));

create function pg_temp.product_input(p_prefix text, p_name text, p_slug text, p_status text, p_sku text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'product_type_id', tests.fx(p_prefix || 'type'),
    'category_id', tests.fx(p_prefix || 'cat'),
    'brand_id', tests.fx(p_prefix || 'brand'),
    'name', p_name, 'slug', p_slug, 'status', p_status,
    'description', 'Vestido de algodón', 'tags', jsonb_build_array('verano'),
    'collection_ids', jsonb_build_array(tests.fx(p_prefix || 'coll')),
    'variants', jsonb_build_array(
      jsonb_build_object('sku', p_sku || '-S', 'price', 1500, 'stock', 4,
        'cost', jsonb_build_object('price', 5, 'currency', 'USD'),
        'attribute_values', jsonb_build_array(jsonb_build_object('attribute_id', tests.fx(p_prefix || 'attr'), 'value_id', tests.fx(p_prefix || 'val_s')))),
      jsonb_build_object('sku', p_sku || '-M', 'price', 1800, 'stock', 0,
        'cost', jsonb_build_object('price', 6, 'currency', 'USD'),
        'attribute_values', jsonb_build_array(jsonb_build_object('attribute_id', tests.fx(p_prefix || 'attr'), 'value_id', tests.fx(p_prefix || 'val_m'))))
    ));
$$;

insert into pg_temp.fixtures select 'a_pub', public.save_product(tests.fx('store_a'),
  pg_temp.product_input('a_', 'Vestido Ñandú', 'vestido-nandu', 'published', 'VA1'), tests.fx('owner_a'));
insert into pg_temp.fixtures select 'a_draft', public.save_product(tests.fx('store_a'),
  pg_temp.product_input('a_', 'Borrador A', 'borrador-a', 'draft', 'VA2'), tests.fx('owner_a'));
insert into pg_temp.fixtures select 'b_pub', public.save_product(tests.fx('store_b'),
  pg_temp.product_input('b_', 'Vestido B', 'vestido-b', 'published', 'VB1'), tests.fx('owner_b'));
insert into pg_temp.fixtures select 'b_draft', public.save_product(tests.fx('store_b'),
  pg_temp.product_input('b_', 'Borrador B', 'borrador-b', 'draft', 'VB2'), tests.fx('owner_b'));

-- ---------------------------------------------------------------------------
-- create_store v2 and save_product
-- ---------------------------------------------------------------------------

select tests.eq('create_store: default warehouse and base currency',
  (select count(*) from public.warehouses where store_id = tests.fx('store_a') and is_default)::int
  + (select count(*) from public.store_currencies where store_id = tests.fx('store_a') and is_base and currency = 'CUP')::int, 2);
select tests.eq('save_product: 2 variants with costs',
  (select count(*) from public.variant_costs c join public.product_variants v on v.id = c.variant_id
   where v.product_id = tests.fx('a_pub'))::int, 2);
select tests.eq('save_product: stock movement recorded for the initial stock',
  (select sum(m.quantity) from public.stock_movements m join public.product_variants v on v.id = m.variant_id
   where v.product_id = tests.fx('a_pub'))::int, 4);
select tests.eq('summary: min/max price and in_stock',
  (select format('%s-%s-%s', min_price, max_price, in_stock) from public.products where id = tests.fx('a_pub')),
  '1500.00-1800.00-t');
select tests.eq('summary: variant stock_available',
  (select stock_available from public.product_variants where sku = 'VA1-S' and store_id = tests.fx('store_a')), 4);
select tests.check('save_product: published_at set on publish',
  (select published_at is not null from public.products where id = tests.fx('a_pub')));
-- Run the update first: a count in the same statement would use the snapshot from before the call.
select public.save_product(
  tests.fx('store_a'),
  pg_temp.product_input('a_', 'Borrador A', 'borrador-a', 'draft', 'VA2')
    || jsonb_build_object('id', tests.fx('a_draft'), 'variants', jsonb_build_array(jsonb_build_object(
      'id', (select id from public.product_variants where sku = 'VA2-S' and store_id = tests.fx('store_a')),
      'sku', 'VA2-S', 'price', 900))),
  tests.fx('owner_a'));
select tests.eq('save_product: update replaces variants (keeps 1, deletes 1)',
  (select count(*) from public.product_variants where product_id = tests.fx('a_draft'))::int, 1);
select tests.eq('save_product: update recomputes the summary',
  (select min_price from public.products where id = tests.fx('a_draft')), 900.00);
select tests.check('save_product: variant attribute must be a variant attribute of the type', tests.throws(format(
  $$select public.save_product(%L, %L, null)$$, tests.fx('store_a'),
  pg_temp.product_input('a_', 'X', 'x-attr', 'draft', 'XATTR') || jsonb_build_object('attributes',
    jsonb_build_array(jsonb_build_object('attribute_id', tests.fx('a_attr'), 'value_ids', jsonb_build_array(tests.fx('a_val_s'))))))));
select tests.check('save_product: product type of another store is rejected', tests.throws(format(
  $$select public.save_product(%L, %L, null)$$, tests.fx('store_a'),
  pg_temp.product_input('b_', 'X', 'x-cross', 'draft', 'XCROSS'))));
select tests.check('save_product: duplicated SKU in the store is rejected', tests.throws(format(
  $$select public.save_product(%L, %L, null)$$, tests.fx('store_a'),
  pg_temp.product_input('a_', 'X', 'x-dup', 'draft', 'VA1'))));
select tests.eq('search: by name without accents',
  (select count(*) from public.admin_search_products(tests.fx('store_a'), 'nandu'))::int, 1);
select tests.eq('search: by SKU prefix',
  (select count(*) from public.admin_search_products(tests.fx('store_a'), 'VA1'))::int, 1);

-- ---------------------------------------------------------------------------
-- Cross-store integrity (composite FKs)
-- ---------------------------------------------------------------------------

select tests.check('FK: product of A cannot use a category of B', tests.throws(format(
  $$update public.products set category_id = %L where id = %L$$, tests.fx('b_cat'), tests.fx('a_pub'))));
select tests.check('FK: variant of A cannot use a value of B', tests.throws(format(
  $$update public.variant_attribute_values set value_id = %L
    where variant_id = (select id from public.product_variants where sku = 'VA1-S' and store_id = %L)$$,
  tests.fx('b_val_s'), tests.fx('store_a'))));
select tests.check('FK: stock of A cannot use a warehouse of B', tests.throws(format(
  $$insert into public.stocks (store_id, variant_id, warehouse_id)
    select %L, id, %L from public.product_variants where sku = 'VA1-M' and store_id = %L$$,
  tests.fx('store_a'), tests.fx('wh_b'), tests.fx('store_a'))));
select tests.check('FK: collection of B cannot hold a product of A', tests.throws(format(
  $$insert into public.collection_products (store_id, collection_id, product_id) values (%L, %L, %L)$$,
  tests.fx('store_b'), tests.fx('b_coll'), tests.fx('a_pub'))));

-- ---------------------------------------------------------------------------
-- Modules and limits in the database
-- ---------------------------------------------------------------------------

select tests.check('module: Base cannot create a second warehouse', tests.throws(format(
  $$insert into public.warehouses (store_id, name) values (%L, 'Otro')$$, tests.fx('store_a'))));
select tests.eq('module: Pro can create a second warehouse', tests.affected(format(
  $$insert into public.warehouses (store_id, name) values (%L, 'Otro')$$, tests.fx('store_b'))), 1);
select tests.check('module: Base cannot sell in a second currency', tests.throws(format(
  $$select public.set_store_currency(%L, 'USD', 300, true, null, null)$$, tests.fx('store_a'))));
select tests.check('module: Base can keep a cost-only currency rate', not tests.throws(format(
  $$select public.set_store_currency(%L, 'USD', 300, false, null, null)$$, tests.fx('store_a'))));
select tests.eq('currency: the rate is recorded in the history',
  (select count(*) from public.currency_rate_history where store_id = tests.fx('store_a') and currency = 'USD')::int, 1);
select tests.check('module: Base cannot set per-currency prices', tests.throws(format(
  $$insert into public.variant_prices (store_id, variant_id, currency, price)
    select %L, id, 'USD', 5 from public.product_variants where sku = 'VA1-S' and store_id = %L$$,
  tests.fx('store_a'), tests.fx('store_a'))));
select tests.check('module: Pro can sell in a second currency', not tests.throws(format(
  $$select public.set_store_currency(%L, 'CUP', 0.0033, true, 10, null)$$, tests.fx('store_b'))));

update public.plan_limits set value = 3
where key = 'max_products' and plan_id = (select id from public.plans where code = 'base');
insert into pg_temp.fixtures select 'a_third', public.save_product(tests.fx('store_a'),
  pg_temp.product_input('a_', 'Tercero', 'tercero', 'draft', 'VA3'), tests.fx('owner_a'));
select tests.check('limit: max_products blocks the next product', tests.throws(format(
  $$select public.save_product(%L, %L, null)$$, tests.fx('store_a'),
  pg_temp.product_input('a_', 'Cuarto', 'cuarto', 'draft', 'VA4'))));
select tests.eq('limit: archiving frees a slot', (
  select public.set_products_status(tests.fx('store_a'), array[tests.fx('a_third')], 'archived')), 1);
select tests.check('limit: after archiving a product can be created', not tests.throws(format(
  $$select public.save_product(%L, %L, null)$$, tests.fx('store_a'),
  pg_temp.product_input('a_', 'Cuarto', 'cuarto', 'draft', 'VA4'))));
select tests.check('limit: unarchiving over the limit is blocked', tests.throws(format(
  $$select public.set_products_status(%L, array[%L]::uuid[], 'draft')$$, tests.fx('store_a'), tests.fx('a_third'))));

-- ---------------------------------------------------------------------------
-- Stock and categories
-- ---------------------------------------------------------------------------

update public.stocks set quantity_allocated = 2
where variant_id = (select id from public.product_variants where sku = 'VA1-S' and store_id = tests.fx('store_a'));
select tests.check('stock: cannot go below reserved units', tests.throws(format(
  $$select public.set_stock_quantity(%L, (select id from public.product_variants where sku = 'VA1-S' and store_id = %L),
    %L, 1, 'adjustment', null, null)$$, tests.fx('store_a'), tests.fx('store_a'), tests.fx('wh_a'))));
select tests.eq('stock: available = quantity - allocated',
  (select stock_available from public.product_variants where sku = 'VA1-S' and store_id = tests.fx('store_a')), 2);

with x as (insert into public.categories (store_id, parent_id, name, slug) values (tests.fx('store_a'), tests.fx('a_cat'), 'Vestidos', 'vestidos')
  returning id) insert into pg_temp.fixtures select 'a_child', id from x;
with x as (insert into public.categories (store_id, parent_id, name, slug) values (tests.fx('store_a'), tests.fx('a_child'), 'Largos', 'largos')
  returning id) insert into pg_temp.fixtures select 'a_grandchild', id from x;
select tests.eq('category: depth of a grandchild', (select depth from public.categories where id = tests.fx('a_grandchild')), 3);
select tests.check('category: max depth is 3', tests.throws(format(
  $$insert into public.categories (store_id, parent_id, name, slug) values (%L, %L, 'X', 'x')$$,
  tests.fx('store_a'), tests.fx('a_grandchild'))));
select tests.check('category: cannot move inside its own branch', tests.throws(format(
  $$update public.categories set parent_id = %L where id = %L$$, tests.fx('a_grandchild'), tests.fx('a_cat'))));
select tests.check('category: with children cannot be deleted', tests.throws(format(
  $$delete from public.categories where id = %L$$, tests.fx('a_child'))));
update public.products set category_id = tests.fx('a_child') where id = tests.fx('a_pub');
select tests.eq('search: category filter on a leaf',
  (select count(*) from public.admin_search_products(tests.fx('store_a'), null, null, tests.fx('a_child')))::int, 1);
select tests.eq('search: category filter includes the subtree (3 non-archived products)',
  (select count(*) from public.admin_search_products(tests.fx('store_a'), null, null, tests.fx('a_cat')))::int, 3);

-- ---------------------------------------------------------------------------
-- anon (storefront)
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.eq('anon: sees published products of A and B, no drafts',
  (select count(*) from public.products where store_id in (tests.fx('store_a'), tests.fx('store_b')))::int, 2);
select tests.eq('anon: sees the variants of published products only',
  (select count(*) from public.product_variants where store_id = tests.fx('store_a'))::int, 2);
select tests.eq('anon: sees stock_available of a public variant',
  (select stock_available from public.product_variants where sku = 'VA1-S'), 2);
select tests.check('anon: cannot read variant_costs', tests.throws('select * from public.variant_costs'));
select tests.check('anon: cannot read stocks', tests.throws('select * from public.stocks'));
select tests.check('anon: cannot read stock_movements', tests.throws('select * from public.stock_movements'));
select tests.check('anon: cannot read warehouses', tests.throws('select * from public.warehouses'));
select tests.check('anon: cannot read currency_rate_history', tests.throws('select * from public.currency_rate_history'));
select tests.check('anon: cannot read products.search_vector', tests.throws('select search_vector from public.products'));
select tests.eq('anon: only sale currencies are visible',
  (select count(*) from public.store_currencies where store_id = tests.fx('store_a'))::int, 1);
select tests.eq('anon: no tags/media/attributes of drafts',
  (select count(*) from public.product_tags where product_id = tests.fx('a_draft'))::int, 0);
select tests.eq('anon: collection lists only public products',
  (select count(*) from public.collection_products where collection_id = tests.fx('a_coll'))::int, 1);
select tests.check('anon: cannot call admin_search_products',
  tests.throws(format('select * from public.admin_search_products(%L)', tests.fx('store_a'))));
select tests.check('anon: cannot call save_product', tests.throws(format(
  $$select public.save_product(%L, '{}'::jsonb, null)$$, tests.fx('store_a'))));
select tests.check('anon: GraphQL has no cost field on variants', (
  select graphql.resolve(query := '{ productVariantsCollection(first: 1) { edges { node { sku variantCosts { costPrice } } } } }')
    ? 'errors'));
select tests.check('anon: GraphQL has no variantCostsCollection', (
  select graphql.resolve(query := '{ variantCostsCollection(first: 1) { edges { node { costPrice } } } }') ? 'errors'));
select tests.check('anon: GraphQL lists published products with price', (
  select (graphql.resolve(query := format(
    '{ productsCollection(filter: {storeId: {eq: "%s"}}) { edges { node { name minPrice productVariantsCollection { edges { node { sku price stockAvailable } } } } } } }',
    tests.fx('store_a'))) -> 'data' -> 'productsCollection' -> 'edges' -> 0 -> 'node' ->> 'minPrice') = '1500.00'));
select tests.logout();

update public.stores set status = 'suspended' where id = tests.fx('store_b');
select tests.login_anon();
select tests.eq('anon: a suspended store shows no products',
  (select count(*) from public.products where store_id = tests.fx('store_b'))::int, 0);
select tests.logout();
update public.stores set status = 'active' where id = tests.fx('store_b');

-- ---------------------------------------------------------------------------
-- Staff of A
-- ---------------------------------------------------------------------------

select tests.login('owner_a');
select tests.eq('owner A: sees own drafts', (select count(*) from public.products where id = tests.fx('a_draft'))::int, 1);
select tests.eq('owner A: does not see B drafts', (select count(*) from public.products where id = tests.fx('b_draft'))::int, 0);
select tests.check('owner A: reads own costs',
  (select count(*) from public.variant_costs where store_id = tests.fx('store_a')) > 0);
select tests.eq('owner A: no costs of B', (select count(*) from public.variant_costs where store_id = tests.fx('store_b'))::int, 0);
select tests.eq('owner A: no stocks, movements or warehouses of B',
  (select count(*) from public.stocks where store_id = tests.fx('store_b'))::int
  + (select count(*) from public.stock_movements where store_id = tests.fx('store_b'))::int
  + (select count(*) from public.warehouses where store_id = tests.fx('store_b'))::int, 0);
select tests.eq('owner A: search in B returns only public products',
  (select count(*) from public.admin_search_products(tests.fx('store_b')))::int, 1);
select tests.eq('owner A: cannot insert products directly', tests.affected(format(
  $$insert into public.products (store_id, product_type_id, name, slug) values (%L, %L, 'X', 'x')$$,
  tests.fx('store_a'), tests.fx('a_type'))), -1);
select tests.eq('owner A: cannot update prices directly', tests.affected(format(
  $$update public.product_variants set price = 1 where store_id = %L$$, tests.fx('store_a'))), -1);
select tests.eq('owner A: cannot change stock directly', tests.affected(format(
  $$update public.stocks set quantity = 99 where store_id = %L$$, tests.fx('store_a'))), -1);
select tests.check('owner A: cannot call save_product', tests.throws(format(
  $$select public.save_product(%L, '{}'::jsonb, null)$$, tests.fx('store_a'))));
select tests.check('owner A: GraphQL reads own costs through the variant', (
  select graphql.resolve(query := format(
    '{ productVariantsCollection(filter: {storeId: {eq: "%s"}}, first: 1) { edges { node { variantCosts { costPrice costCurrency } } } } }',
    tests.fx('store_a'))) -> 'data' -> 'productVariantsCollection' -> 'edges' -> 0 -> 'node' -> 'variantCosts' ->> 'costPrice' is not null));
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff A: sees drafts of A', (select count(*) from public.products where id = tests.fx('a_draft'))::int, 1);
select tests.eq('staff A: cannot read costs (admin only)',
  (select count(*) from public.variant_costs where store_id = tests.fx('store_a'))::int, 0);
select tests.check('staff A: reads stocks of A', (select count(*) from public.stocks where store_id = tests.fx('store_a')) > 0);
select tests.logout();
