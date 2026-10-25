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
select tests.check('anon: GraphQL lists the banners of A', (
  select (graphql.resolve(query := format(
    '{ bannersCollection(filter: {storeId: {eq: "%s"}}) { edges { node { title imageUrl } } } }',
    tests.fx('store_a'))) -> 'data' -> 'bannersCollection' -> 'edges' -> 0 -> 'node' ->> 'title') = 'Visible'));
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
