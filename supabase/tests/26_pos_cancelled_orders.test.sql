-- A counter sale cancelled as an order (after the upload) reaches the phone: admin_pos_cancelled_orders gives the
-- cancelled ones among the orders it asks for; staff of the store sees them, another store never.

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Anuladas A', 'anuladas-a', tests.fx('owner_a'), 'CUP', 'AA', '5351111111', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Anuladas B', 'anuladas-b', tests.fx('owner_b'), 'CUP', 'AB', '5352222222', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');

insert into public.product_types (store_id, name, slug) values (tests.fx('store_a'), 'Simple', 'simple');
insert into pg_temp.fixtures (key, id)
select 'product', public.save_product(tests.fx('store_a'),
  jsonb_build_object('product_type_id', (select id from public.product_types where store_id = tests.fx('store_a')),
    'name', 'Jabón', 'slug', 'jabon-anulado', 'status', 'published',
    'variants', jsonb_build_array(jsonb_build_object('sku', 'JAB-X26', 'price', 400, 'stock', 100))),
  tests.fx('owner_a'));
insert into pg_temp.fixtures (key, id)
select 'variant', id from public.product_variants where product_id = tests.fx('product');

create function pg_temp.sale(p_number text) returns uuid language sql as $$
  select (public.pos_record_sale(tests.fx('store_a'), jsonb_build_object(
    'id', gen_random_uuid(), 'device_id', '00000000-0000-4000-8000-000000000026', 'local_number', p_number,
    'sold_at', now(),
    'lines', jsonb_build_array(jsonb_build_object('variant_id', tests.fx('variant'), 'quantity', 1, 'unit_price', 400,
      'product_name', 'Jabón')),
    'payments', jsonb_build_array(jsonb_build_object('amount', 400))), tests.fx('staff_a')) ->> 'order_id')::uuid;
$$;
insert into pg_temp.fixtures (key, id) select 'kept', pg_temp.sale('X-1');
insert into pg_temp.fixtures (key, id) select 'cancelled', pg_temp.sale('X-2');
select public.order_cancel(tests.fx('store_a'), tests.fx('cancelled'), null, tests.fx('staff_a'));

create function pg_temp.cancelled(p_store text) returns jsonb language sql as $$
  select public.admin_pos_cancelled_orders(tests.fx(p_store), array[tests.fx('kept'), tests.fx('cancelled')]);
$$;

select tests.login('staff_a');
select tests.eq('staff: only the cancelled order of the two', pg_temp.cancelled('store_a'),
  jsonb_build_array(tests.fx('cancelled')));
select tests.logout();

select tests.login('owner_a');
select tests.eq('owner: the same', pg_temp.cancelled('store_a'), jsonb_build_array(tests.fx('cancelled')));
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B: nothing of A, asking with either store', pg_temp.cancelled('store_a') || pg_temp.cancelled('store_b'),
  '[]'::jsonb);
select tests.logout();

select tests.login_anon();
select tests.check('anon: cannot call it', tests.throws(
  format($$select public.admin_pos_cancelled_orders(%L, array[%L]::uuid[])$$, tests.fx('store_a'), tests.fx('cancelled'))));
select tests.logout();
