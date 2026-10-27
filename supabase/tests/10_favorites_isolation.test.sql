-- Redesign v2: customer favorites. The customer reads only its own favorites and only with a customer token of the
-- same store; staff read their store's; another store, anon and a cross-store token read nothing; nobody but the API
-- (service_role) writes; a favorite cannot point to another store's customer or product.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Fav Test A', 'fav-test-a', tests.fx('owner_a'), 'CUP', 'FA', '5351111111', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Fav Test B', 'fav-test-b', tests.fx('owner_b'), 'CUP', 'FB', '5352222222', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');

select tests.create_user('cust_a', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_a')));
select tests.create_user('cust_a2', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_a')));
select tests.create_user('cust_b', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_b')));
-- Has a customer row in A but its token says store B.
select tests.create_user('cust_cross', jsonb_build_object('kind', 'customer', 'store_id', tests.fx('store_b')));

create function pg_temp.add_customer(p_key text, p_store text, p_user text, p_phone text) returns void
language sql as $$
  with x as (
    insert into public.customers (store_id, user_id, phone, first_name)
    values (tests.fx(p_store), tests.fx(p_user), p_phone, p_key) returning id
  ) insert into pg_temp.fixtures select p_key, id from x;
$$;
select pg_temp.add_customer('c_a', 'store_a', 'cust_a', '+5353000001');
select pg_temp.add_customer('c_a2', 'store_a', 'cust_a2', '+5353000002');
select pg_temp.add_customer('c_b', 'store_b', 'cust_b', '+5353000001');
select pg_temp.add_customer('c_cross', 'store_a', 'cust_cross', '+5353000003');

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
select pg_temp.add_product('p-a2', 'store_a');
select pg_temp.add_product('p-b1', 'store_b');

insert into public.customer_favorites (store_id, customer_id, product_id) values
  (tests.fx('store_a'), tests.fx('c_a'), tests.fx('p-a1')),
  (tests.fx('store_a'), tests.fx('c_a'), tests.fx('p-a2')),
  (tests.fx('store_a'), tests.fx('c_a2'), tests.fx('p-a1')),
  (tests.fx('store_a'), tests.fx('c_cross'), tests.fx('p-a2')),
  (tests.fx('store_b'), tests.fx('c_b'), tests.fx('p-b1'));

-- ---------------------------------------------------------------------------
-- Schema rules
-- ---------------------------------------------------------------------------

select tests.check('FK: a favorite of A cannot point to a product of B', tests.throws(format(
  $$insert into public.customer_favorites (store_id, customer_id, product_id) values (%L, %L, %L)$$,
  tests.fx('store_a'), tests.fx('c_a'), tests.fx('p-b1'))));
select tests.check('FK: a favorite of A cannot belong to a customer of B', tests.throws(format(
  $$insert into public.customer_favorites (store_id, customer_id, product_id) values (%L, %L, %L)$$,
  tests.fx('store_a'), tests.fx('c_b'), tests.fx('p-a1'))));
select tests.check('a product is a favorite only once per customer', tests.throws(format(
  $$insert into public.customer_favorites (store_id, customer_id, product_id) values (%L, %L, %L)$$,
  tests.fx('store_a'), tests.fx('c_a'), tests.fx('p-a1'))));

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

select tests.login_anon();
select tests.check('anon: cannot read favorites', tests.throws('select * from public.customer_favorites'));
select tests.logout();

select tests.login('cust_a');
select tests.eq('customer A: reads only its own favorites',
  (select string_agg(product_id::text, ',' order by product_id) from public.customer_favorites),
  (select string_agg(id::text, ',' order by id) from (values (tests.fx('p-a1')), (tests.fx('p-a2'))) v(id)));
select tests.eq('customer A: cannot add favorites directly', tests.affected(format(
  $$insert into public.customer_favorites (store_id, customer_id, product_id) values (%L, %L, %L)$$,
  tests.fx('store_a'), tests.fx('c_a2'), tests.fx('p-a2'))), -1);
select tests.eq('customer A: cannot delete favorites directly',
  tests.affected('delete from public.customer_favorites'), -1);
select tests.logout();

select tests.login('cust_cross');
select tests.eq('a customer token of store B reads nothing of its row in A',
  (select count(*) from public.customer_favorites)::int, 0);
select tests.logout();

select tests.login('cust_b');
select tests.eq('customer B: reads only its own favorite', (select count(*) from public.customer_favorites)::int, 1);
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff A: reads the favorites of store A only',
  (select count(*) from public.customer_favorites where store_id = tests.fx('store_a'))::int
    || '|' || (select count(*) from public.customer_favorites where store_id <> tests.fx('store_a'))::int,
  '4|0');
select tests.eq('staff A: cannot write favorites', tests.affected('delete from public.customer_favorites'), -1);
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B: does not see the favorites of A',
  (select count(*) from public.customer_favorites where store_id = tests.fx('store_a'))::int, 0);
select tests.logout();

-- Cascades: deleting a product or a customer removes its favorites.
delete from public.products where id = tests.fx('p-a2');
select tests.eq('deleting a product removes it from favorites',
  (select count(*) from public.customer_favorites where product_id = tests.fx('p-a2'))::int, 0);
delete from public.customers where id = tests.fx('c_a2');
select tests.eq('deleting a customer removes its favorites',
  (select count(*) from public.customer_favorites where customer_id = tests.fx('c_a2'))::int, 0);
