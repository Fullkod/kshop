-- Redesign v2 (R5): the new home section types and banner fields keep the store isolation of phase 2. A banner of
-- store A cannot point to a product of B; the new sections of A (including an expired countdown) are not read by
-- anon once hidden or expired, and another store's staff never reads them; nobody but the API writes.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Home Test A', 'home-test-a', tests.fx('owner_a'), 'CUP', 'HA', '5351111111', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Home Test B', 'home-test-b', tests.fx('owner_b'), 'CUP', 'HB', '5352222222', 'base', 0, 'kshop.fullkod.com', null)).id;
update public.stores set status = 'active' where id in (tests.fx('store_a'), tests.fx('store_b'));

create function pg_temp.add_product(p_key text, p_store text) returns void
language plpgsql as $$
declare
  v_type uuid;
begin
  insert into public.product_types (store_id, name, slug) values (tests.fx(p_store), 'T ' || p_key, 't-' || p_key)
    returning id into v_type;
  with x as (
    insert into public.products (store_id, product_type_id, name, slug, status)
    values (tests.fx(p_store), v_type, p_key, p_key, 'published') returning id
  ) insert into pg_temp.fixtures select p_key, id from x;
end;
$$;
select pg_temp.add_product('p-a1', 'store_a');
select pg_temp.add_product('p-b1', 'store_b');

with x as (
  insert into public.banners (store_id, title, eyebrow, image_url, product_id)
  values (tests.fx('store_a'), 'Hero A', 'Nuevo', 'https://x.test/a.webp', tests.fx('p-a1')) returning id
) insert into pg_temp.fixtures select 'banner_a', id from x;

insert into public.home_sections (store_id, type, settings, sort_order) values
  (tests.fx('store_a'), 'announcement_bar', '{"text":"Envío gratis"}', 1),
  (tests.fx('store_a'), 'benefits', '{}', 2),
  (tests.fx('store_a'), 'featured_product', jsonb_build_object('productId', tests.fx('p-a1')), 3),
  (tests.fx('store_a'), 'testimonials', '{}', 4);
insert into public.home_sections (store_id, type, settings, sort_order, is_visible) values
  (tests.fx('store_a'), 'collection_cards', '{}', 5, false);
insert into public.home_sections (store_id, type, settings, sort_order, starts_at, ends_at) values
  (tests.fx('store_a'), 'offer_countdown', '{}', 6, now() - interval '2 days', now() - interval '1 hour');
insert into public.home_sections (store_id, type, settings, sort_order) values
  (tests.fx('store_b'), 'banner_mosaic', '{}', 1);

-- ---------------------------------------------------------------------------
-- Schema rules
-- ---------------------------------------------------------------------------

select tests.check('FK: a banner of A cannot point to a product of B', tests.throws(format(
  $$update public.banners set product_id = %L where id = %L$$, tests.fx('p-b1'), tests.fx('banner_a'))));
select tests.check('the banner eyebrow is at most 40 characters', tests.throws(format(
  $$update public.banners set eyebrow = repeat('x', 41) where id = %L$$, tests.fx('banner_a'))));
delete from public.products where id = tests.fx('p-a1');
select tests.eq('deleting the product only clears the banner link',
  (select coalesce(product_id::text, 'null') || '|' || title from public.banners where id = tests.fx('banner_a')),
  'null|Hero A');

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.eq('anon: reads the visible, current new sections of A',
  (select string_agg(type::text, ',' order by sort_order) from public.home_sections
    where store_id = tests.fx('store_a')),
  'announcement_bar,benefits,featured_product,testimonials');
select tests.eq('anon: reads the new banner fields', (select eyebrow from public.banners
  where id = tests.fx('banner_a')), 'Nuevo');
select tests.eq('anon: cannot write sections', tests.affected('delete from public.home_sections'), -1);
select tests.logout();

select tests.login('owner_a');
select tests.eq('owner A: reads every section of A, hidden and expired included',
  (select count(*) from public.home_sections where store_id = tests.fx('store_a'))::int, 6);
select tests.eq('owner A: cannot write sections directly', tests.affected(format(
  $$update public.home_sections set title = 'x' where store_id = %L$$, tests.fx('store_a'))), -1);
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B: reads only the public sections of A',
  (select count(*) from public.home_sections where store_id = tests.fx('store_a'))::int, 4);
select tests.eq('owner B: cannot change the banners of A', tests.affected(format(
  $$update public.banners set eyebrow = 'x' where id = %L$$, tests.fx('banner_a'))), -1);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Product counts of the home (categories and collections)
-- ---------------------------------------------------------------------------

insert into public.categories (store_id, name, slug) values (tests.fx('store_b'), 'Cat B', 'cat-b');
update public.products set category_id = (select id from public.categories where slug = 'cat-b')
  where id = tests.fx('p-b1');
select pg_temp.add_product('p-b2', 'store_b');
update public.products set status = 'draft' where id = tests.fx('p-b2');
update public.products set category_id = (select id from public.categories where slug = 'cat-b')
  where id = tests.fx('p-b2');

select tests.login_anon();
select tests.eq('anon: counts the published products of a category of B, not its drafts',
  (public.storefront_product_counts(tests.fx('store_b'))
    -> 'categories' ->> (select id::text from public.categories where slug = 'cat-b'))::int, 1);
select tests.eq('anon: the counts of A do not include categories of B',
  (public.storefront_product_counts(tests.fx('store_a')) -> 'categories')
    ? (select id::text from public.categories where slug = 'cat-b'), false);
select tests.logout();
