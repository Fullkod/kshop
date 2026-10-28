-- Phase 2: storefront content (banners, home sections, menus, pages) — public visibility by flag, dates and
-- store status, isolation between stores A and B, cross-store FKs and writes only through the API.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Sf Test A', 'sf-test-a', tests.fx('owner_a'), 'CUP', 'SA', null, 'base', 30, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Sf Test B', 'sf-test-b', tests.fx('owner_b'), 'CUP', 'SB', null, 'pro', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');

create function pg_temp.seed_content(p_prefix text, p_store uuid) returns void language plpgsql as $$
declare
  v_menu uuid; v_item uuid;
begin
  with x as (insert into public.collections (store_id, name, slug) values (p_store, 'Novedades', 'novedades') returning id)
    insert into pg_temp.fixtures select p_prefix || 'coll', id from x;
  -- Banners: visible, hidden, future, expired.
  with x as (insert into public.banners (store_id, title, image_url, link_type, link_url)
    values (p_store, 'Visible', 'https://x.test/a.webp', 'url', '/products') returning id)
    insert into pg_temp.fixtures select p_prefix || 'banner', id from x;
  with x as (insert into public.banners (store_id, title, image_url, is_visible)
    values (p_store, 'Oculto', 'https://x.test/b.webp', false) returning id)
    insert into pg_temp.fixtures select p_prefix || 'banner_hidden', id from x;
  insert into public.banners (store_id, title, image_url, starts_at)
    values (p_store, 'Futuro', 'https://x.test/c.webp', now() + interval '1 day');
  insert into public.banners (store_id, title, image_url, starts_at, ends_at)
    values (p_store, 'Caducado', 'https://x.test/d.webp', now() - interval '2 days', now() - interval '1 day');
  -- Sections: slider with both banners, carousel from the collection, hidden text.
  with x as (insert into public.home_sections (store_id, type, title) values (p_store, 'hero_slider', 'Portada') returning id)
    insert into pg_temp.fixtures select p_prefix || 'section', id from x;
  insert into public.home_section_banners (store_id, section_id, banner_id, sort_order)
    values (p_store, tests.fx(p_prefix || 'section'), tests.fx(p_prefix || 'banner'), 0),
           (p_store, tests.fx(p_prefix || 'section'), tests.fx(p_prefix || 'banner_hidden'), 1);
  insert into public.home_sections (store_id, type, title, source_collection_id, sort_order)
    values (p_store, 'product_carousel', 'Novedades', tests.fx(p_prefix || 'coll'), 1);
  insert into public.home_sections (store_id, type, settings, is_visible, sort_order)
    values (p_store, 'rich_text', '{"markdown": "Hola"}', false, 2);
  -- Menu with a child item, pages published and draft.
  insert into public.menus (store_id, location) values (p_store, 'header') returning id into v_menu;
  insert into pg_temp.fixtures values (p_prefix || 'menu', v_menu);
  insert into public.menu_items (store_id, menu_id, label, link_type, link_url)
    values (p_store, v_menu, 'Tienda', 'url', '/products') returning id into v_item;
  insert into pg_temp.fixtures values (p_prefix || 'item', v_item);
  insert into public.menu_items (store_id, menu_id, parent_id, label, link_type, link_target_id)
    values (p_store, v_menu, v_item, 'Novedades', 'collection', tests.fx(p_prefix || 'coll'));
  insert into public.pages (store_id, slug, title, content, is_published)
    values (p_store, 'envios', 'Envíos', '**Gratis** en La Habana', true);
  with x as (insert into public.pages (store_id, slug, title) values (p_store, 'borrador', 'Borrador') returning id)
    insert into pg_temp.fixtures select p_prefix || 'page_draft', id from x;
end $$;

select pg_temp.seed_content('a_', tests.fx('store_a'));
select pg_temp.seed_content('b_', tests.fx('store_b'));

-- ---------------------------------------------------------------------------
-- Integrity (as owner of the database)
-- ---------------------------------------------------------------------------

select tests.check('FK: section of A cannot use a collection of B', tests.throws(format(
  $$insert into public.home_sections (store_id, type, source_collection_id) values (%L, 'product_carousel', %L)$$,
  tests.fx('store_a'), tests.fx('b_coll'))));
select tests.check('FK: slider of A cannot hold a banner of B', tests.throws(format(
  $$insert into public.home_section_banners (store_id, section_id, banner_id) values (%L, %L, %L)$$,
  tests.fx('store_a'), tests.fx('a_section'), tests.fx('b_banner'))));
select tests.check('FK: item of A cannot go in the menu of B', tests.throws(format(
  $$insert into public.menu_items (store_id, menu_id, label, link_type, link_url) values (%L, %L, 'X', 'url', '/')$$,
  tests.fx('store_a'), tests.fx('b_menu'))));
select tests.check('menu: only two levels', tests.throws(format(
  $$insert into public.menu_items (store_id, menu_id, parent_id, label, link_type, link_url)
    select %L, %L, id, 'Nieto', 'url', '/' from public.menu_items where parent_id = %L$$,
  tests.fx('store_a'), tests.fx('a_menu'), tests.fx('a_item'))));
select tests.check('menu: one header menu per store', tests.throws(format(
  $$insert into public.menus (store_id, location) values (%L, 'header')$$, tests.fx('store_a'))));
select tests.check('link: a URL link needs the URL', tests.throws(format(
  $$insert into public.banners (store_id, image_url, link_type) values (%L, 'https://x.test/e.webp', 'url')$$,
  tests.fx('store_a'))));
select tests.check('link: only http(s) or store paths', tests.throws(format(
  $$insert into public.banners (store_id, image_url, link_type, link_url) values (%L, 'https://x.test/e.webp', 'url', 'javascript:alert(1)')$$,
  tests.fx('store_a'))));
select tests.check('page: slug unique per store', tests.throws(format(
  $$insert into public.pages (store_id, slug, title) values (%L, 'envios', 'Otra')$$, tests.fx('store_a'))));
select tests.check('page: same slug allowed in another store', not tests.throws(format(
  $$insert into public.pages (store_id, slug, title) values (%L, 'sobre-nosotros', 'Sobre')$$, tests.fx('store_b'))));

-- ---------------------------------------------------------------------------
-- anon (storefront)
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.eq('anon: only the visible, in-date banner of A',
  (select string_agg(title, ',') from public.banners where store_id = tests.fx('store_a')), 'Visible');
select tests.eq('anon: hidden section not visible',
  (select count(*) from public.home_sections where store_id = tests.fx('store_a'))::int, 2);
select tests.eq('anon: slider shows only the visible banner',
  (select count(*) from public.home_section_banners hsb join public.banners b on b.id = hsb.banner_id
    where hsb.section_id = tests.fx('a_section'))::int, 1);
select tests.eq('anon: menu items of A', (select count(*) from public.menu_items where store_id = tests.fx('store_a'))::int, 2);
select tests.eq('anon: only published pages',
  (select string_agg(slug, ',') from public.pages where store_id = tests.fx('store_a')), 'envios');
select tests.check('anon: cannot insert banners', tests.throws(format(
  $$insert into public.banners (store_id, image_url) values (%L, 'https://x.test/z.webp')$$, tests.fx('store_a'))));
select tests.check('anon: the home of A shows its visible banner', (
  select public.sf_storefront_home(jsonb_build_object('storeId', tests.fx('store_a')))::text
    like '%"title": "Visible"%'));
select tests.logout();

update public.stores set status = 'suspended' where id = tests.fx('store_b');
select tests.login_anon();
select tests.eq('anon: nothing of a suspended store',
  (select count(*) from public.banners where store_id = tests.fx('store_b'))::int
  + (select count(*) from public.home_sections where store_id = tests.fx('store_b'))::int
  + (select count(*) from public.menus where store_id = tests.fx('store_b'))::int
  + (select count(*) from public.menu_items where store_id = tests.fx('store_b'))::int
  + (select count(*) from public.home_section_banners where store_id = tests.fx('store_b'))::int
  + (select count(*) from public.pages where store_id = tests.fx('store_b'))::int, 0);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Staff of A (store B still suspended: only its own content is readable)
-- ---------------------------------------------------------------------------

select tests.login('owner_a');
select tests.eq('owner A: sees all banners of A (hidden and scheduled)',
  (select count(*) from public.banners where store_id = tests.fx('store_a'))::int, 4);
select tests.eq('owner A: sees the draft page of A',
  (select count(*) from public.pages where id = tests.fx('a_page_draft'))::int, 1);
select tests.eq('owner A: sees nothing of B',
  (select count(*) from public.banners where store_id = tests.fx('store_b'))::int
  + (select count(*) from public.home_sections where store_id = tests.fx('store_b'))::int
  + (select count(*) from public.menu_items where store_id = tests.fx('store_b'))::int
  + (select count(*) from public.pages where store_id = tests.fx('store_b'))::int, 0);
select tests.eq('owner A: cannot insert banners directly', tests.affected(format(
  $$insert into public.banners (store_id, image_url) values (%L, 'https://x.test/z.webp')$$, tests.fx('store_a'))), -1);
select tests.eq('owner A: cannot update sections directly', tests.affected(format(
  $$update public.home_sections set title = 'X' where store_id = %L$$, tests.fx('store_a'))), -1);
select tests.eq('owner A: cannot publish pages directly', tests.affected(format(
  $$update public.pages set is_published = true where store_id = %L$$, tests.fx('store_a'))), -1);
select tests.eq('owner A: cannot delete menu items directly', tests.affected(format(
  $$delete from public.menu_items where store_id = %L$$, tests.fx('store_a'))), -1);
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff A: sees hidden content of A',
  (select count(*) from public.home_sections where store_id = tests.fx('store_a'))::int, 3);
select tests.logout();

update public.stores set status = 'active' where id = tests.fx('store_b');
select tests.login('owner_a');
select tests.eq('owner A: of an active B only the public content',
  (select count(*) from public.banners where store_id = tests.fx('store_b'))::int, 1);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Storefront reads: search, filters, facets, automatic collections
-- ---------------------------------------------------------------------------

create function pg_temp.seed_catalog(p_prefix text, p_store uuid) returns void language plpgsql as $$
declare
  v_attr uuid; v_type uuid; v_s uuid; v_m uuid; v_cat uuid; v_child uuid; v_brand uuid;
begin
  insert into public.attributes (store_id, name, slug, filterable_in_storefront) values (p_store, 'Talla', 'talla', true)
    returning id into v_attr;
  insert into public.attribute_values (store_id, attribute_id, name, slug) values (p_store, v_attr, 'S', 's') returning id into v_s;
  insert into public.attribute_values (store_id, attribute_id, name, slug, sort_order) values (p_store, v_attr, 'M', 'm', 1) returning id into v_m;
  insert into public.product_types (store_id, name, slug, has_variants) values (p_store, 'Ropa', 'ropa', true) returning id into v_type;
  insert into public.product_type_attributes (store_id, product_type_id, attribute_id, scope, variant_selection)
    values (p_store, v_type, v_attr, 'variant', true);
  insert into public.categories (store_id, name, slug) values (p_store, 'Mujer', 'mujer') returning id into v_cat;
  insert into public.categories (store_id, parent_id, name, slug) values (p_store, v_cat, 'Vestidos', 'vestidos') returning id into v_child;
  insert into public.brands (store_id, name, slug) values (p_store, 'Kaya', 'kaya') returning id into v_brand;
  insert into pg_temp.fixtures values (p_prefix || 'attr', v_attr), (p_prefix || 'val_s', v_s), (p_prefix || 'val_m', v_m),
    (p_prefix || 'cat', v_cat), (p_prefix || 'cat_child', v_child), (p_prefix || 'brand', v_brand);

  -- Vestido Ñandú: S and M, Kaya, Mujer > Vestidos, on sale, in the manual collection.
  insert into pg_temp.fixtures select p_prefix || 'vestido', public.save_product(p_store, jsonb_build_object(
    'product_type_id', v_type, 'category_id', v_child, 'brand_id', v_brand, 'name', 'Vestido Ñandú',
    'slug', 'vestido-nandu', 'status', 'published', 'tags', jsonb_build_array('verano'),
    'collection_ids', jsonb_build_array(tests.fx(p_prefix || 'coll')),
    'variants', jsonb_build_array(
      jsonb_build_object('sku', upper(p_prefix) || 'V-S', 'price', 1500, 'compare_at_price', 1800, 'stock', 3,
        'cost', jsonb_build_object('price', 5, 'currency', 'USD'),
        'attribute_values', jsonb_build_array(jsonb_build_object('attribute_id', v_attr, 'value_id', v_s))),
      jsonb_build_object('sku', upper(p_prefix) || 'V-M', 'price', 1500, 'stock', 0,
        'attribute_values', jsonb_build_array(jsonb_build_object('attribute_id', v_attr, 'value_id', v_m))))), null);
  -- Blusa: M only, no brand, Mujer, out of stock.
  insert into pg_temp.fixtures select p_prefix || 'blusa', public.save_product(p_store, jsonb_build_object(
    'product_type_id', v_type, 'category_id', v_cat, 'name', 'Blusa Lino', 'slug', 'blusa-lino', 'status', 'published',
    'variants', jsonb_build_array(
      jsonb_build_object('sku', upper(p_prefix) || 'B-M', 'price', 900, 'stock', 0,
        'attribute_values', jsonb_build_array(jsonb_build_object('attribute_id', v_attr, 'value_id', v_m))))), null);
  -- Draft that matches everything.
  perform public.save_product(p_store, jsonb_build_object(
    'product_type_id', v_type, 'category_id', v_child, 'brand_id', v_brand, 'name', 'Vestido Borrador',
    'slug', 'vestido-borrador', 'status', 'draft',
    'variants', jsonb_build_array(
      jsonb_build_object('sku', upper(p_prefix) || 'D-S', 'price', 100, 'stock', 9,
        'attribute_values', jsonb_build_array(jsonb_build_object('attribute_id', v_attr, 'value_id', v_s))))), null);
end $$;

select pg_temp.seed_catalog('a_', tests.fx('store_a'));
select pg_temp.seed_catalog('b_', tests.fx('store_b'));
with x as (insert into public.collections (store_id, name, slug, rules)
  values (tests.fx('store_a'), 'Ofertas', 'ofertas', '{"onSale": true}') returning id)
  insert into pg_temp.fixtures select 'a_auto', id from x;
with x as (insert into public.collections (store_id, name, slug, rules)
  values (tests.fx('store_a'), 'Vestidos Kaya', 'vestidos-kaya',
    jsonb_build_object('categoryId', tests.fx('a_cat'), 'brandId', tests.fx('a_brand'), 'inStock', true)) returning id)
  insert into pg_temp.fixtures select 'a_auto2', id from x;

create function pg_temp.names(p_store text, p_query text default null, p_category text default null,
  p_collection text default null, p_brands text default null, p_values text default null,
  p_min numeric default null, p_max numeric default null, p_in_stock boolean default null, p_on_sale boolean default null)
returns text language sql as $$
  select coalesce(string_agg(name, ',' order by name), '') from public.storefront_search_products(
    tests.fx(p_store), p_query, tests.fx(p_category), tests.fx(p_collection), p_brands, p_values,
    p_min, p_max, p_in_stock, p_on_sale);
$$;

select tests.login_anon();
select tests.eq('search: all published of A, no drafts, no B', pg_temp.names('store_a'), 'Blusa Lino,Vestido Ñandú');
select tests.eq('search: without accents', pg_temp.names('store_a', 'nandu'), 'Vestido Ñandú');
select tests.eq('search: by SKU prefix', pg_temp.names('store_a', 'A_B-'), 'Blusa Lino');
select tests.eq('search: by brand name', pg_temp.names('store_a', 'kaya'), 'Vestido Ñandú');
select tests.eq('search: by category name', pg_temp.names('store_a', 'vestidos'), 'Vestido Ñandú');
select tests.eq('filter: category includes the subtree', pg_temp.names('store_a', p_category => 'a_cat'), 'Blusa Lino,Vestido Ñandú');
select tests.eq('filter: child category', pg_temp.names('store_a', p_category => 'a_cat_child'), 'Vestido Ñandú');
select tests.eq('filter: value S', pg_temp.names('store_a', p_values => tests.fx('a_val_s')::text), 'Vestido Ñandú');
select tests.eq('filter: values S or M',
  pg_temp.names('store_a', p_values => tests.fx('a_val_s') || ',' || tests.fx('a_val_m')), 'Blusa Lino,Vestido Ñandú');
select tests.eq('filter: brand', pg_temp.names('store_a', p_brands => tests.fx('a_brand')::text), 'Vestido Ñandú');
select tests.eq('filter: price range', pg_temp.names('store_a', p_min => 1000, p_max => 2000), 'Vestido Ñandú');
select tests.eq('filter: in stock', pg_temp.names('store_a', p_in_stock => true), 'Vestido Ñandú');
select tests.eq('filter: on sale', pg_temp.names('store_a', p_on_sale => true), 'Vestido Ñandú');
select tests.eq('filter: combined (M + Mujer + in stock)',
  pg_temp.names('store_a', p_category => 'a_cat', p_values => tests.fx('a_val_m')::text, p_in_stock => true), 'Vestido Ñandú');
select tests.eq('filter: a value of B is ignored in A (never matches B data)',
  pg_temp.names('store_a', p_values => tests.fx('b_val_s')::text), 'Blusa Lino,Vestido Ñandú');
select tests.eq('collection: manual', pg_temp.names('store_a', p_collection => 'a_coll'), 'Vestido Ñandú');
select tests.eq('collection: automatic on sale', pg_temp.names('store_a', p_collection => 'a_auto'), 'Vestido Ñandú');
select tests.eq('collection: automatic category subtree + brand + in stock',
  pg_temp.names('store_a', p_collection => 'a_auto2'), 'Vestido Ñandú');
select tests.eq('collection: of B used with store A finds nothing',
  pg_temp.names('store_a', p_collection => 'b_coll'), '');

select tests.eq('facets: total and price range',
  (select jsonb_build_object('total', f -> 'total') || (f -> 'price') from public.storefront_product_facets(tests.fx('store_a')) f),
  '{"total": 2, "min": 900.00, "max": 1500.00}'::jsonb);
select tests.eq('facets: sizes with counts',
  (select jsonb_agg(jsonb_build_array(v ->> 'name', (v ->> 'count')::int))
   from public.storefront_product_facets(tests.fx('store_a')) f,
     jsonb_array_elements(f -> 'attributes' -> 0 -> 'values') v),
  '[["S", 1], ["M", 2]]'::jsonb);
select tests.eq('facets: selecting S keeps the other sizes and marks S',
  (select jsonb_agg(jsonb_build_array(v ->> 'name', (v ->> 'count')::int, (v ->> 'selected')::boolean))
   from public.storefront_product_facets(tests.fx('store_a'), p_value_ids => tests.fx('a_val_s')::text) f,
     jsonb_array_elements(f -> 'attributes' -> 0 -> 'values') v),
  '[["S", 1, true], ["M", 2, false]]'::jsonb);
select tests.eq('facets: brands counted without the brand filter',
  (select f -> 'brands' -> 0 ->> 'count' from public.storefront_product_facets(tests.fx('store_a'),
    p_brand_ids => tests.fx('a_brand')::text) f), '1');
select tests.eq('facets: total follows the filters',
  (select (f ->> 'total')::int from public.storefront_product_facets(tests.fx('store_a'), p_in_stock => true) f), 1);
select tests.check('sf_storefront_products: anon lists the search ordered by price with totalCount', (
  select (r -> 'storefrontSearchProducts' ->> 'totalCount') = '2'
     and (r -> 'storefrontSearchProducts' -> 'edges' -> 0 -> 'node' ->> 'name') = 'Blusa Lino'
  from public.sf_storefront_products(jsonb_build_object('storeId', tests.fx('store_a'),
    'orderBy', '[{"minPrice": "AscNullsLast"}]'::jsonb, 'first', 1, 'offset', 0)) r));
select tests.check('sf_storefront_facets: anon facets', (
  select ((public.sf_storefront_facets(jsonb_build_object('storeId', tests.fx('store_a')))
    ->> 'storefrontProductFacets')::jsonb ->> 'total') = '2'));
select tests.logout();

update public.stores set status = 'suspended' where id = tests.fx('store_b');
select tests.login_anon();
select tests.eq('search: nothing of a suspended store', pg_temp.names('store_b'), '');
select tests.logout();
select tests.login('owner_a');
select tests.eq('owner A: storefront search never shows drafts', pg_temp.names('store_a'), 'Blusa Lino,Vestido Ñandú');
select tests.logout();
update public.stores set status = 'active' where id = tests.fx('store_b');
