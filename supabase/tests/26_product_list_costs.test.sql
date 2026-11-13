-- KSH0022: the costs in Catálogo › Productos. admin_products brings each variant's cost to the owner and admins
-- only (the staff get null); set_variant_costs changes only the costs, of variants of that store, and only the
-- service role can call it (/api/v1 checks owner/admin).

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('staff_a');
select tests.create_user('owner_b');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Costos Test A', 'costos-test-a', tests.fx('owner_a'), 'CUP', 'CA', '5351111111', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Costos Test B', 'costos-test-b', tests.fx('owner_b'), 'CUP', 'CB', '5352222222', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into public.store_members (store_id, user_id, role) values (tests.fx('store_a'), tests.fx('staff_a'), 'staff');

create function pg_temp.seed(p_store text, p_owner text, p_prefix text, p_cost jsonb)
returns void
language plpgsql as $$
declare
  v_type uuid; v_product uuid;
begin
  select id into v_type from public.product_types where store_id = tests.fx(p_store) and slug = 'simple';
  if v_type is null then
    insert into public.product_types (store_id, name, slug) values (tests.fx(p_store), 'Simple', 'simple')
      returning id into v_type;
  end if;
  v_product := public.save_product(tests.fx(p_store), jsonb_build_object(
    'product_type_id', v_type, 'name', 'Prod ' || p_prefix, 'slug', 'prod-' || p_prefix, 'status', 'published',
    'variants', jsonb_build_array(jsonb_build_object('sku', upper(p_prefix), 'price', 1500, 'stock', 5, 'cost', p_cost))),
    tests.fx(p_owner));
  insert into pg_temp.fixtures select p_prefix || '_variant', id from public.product_variants where product_id = v_product;
end;
$$;
select pg_temp.seed('store_a', 'owner_a', 'arroz', '{"price": 3, "currency": "USD"}');
select pg_temp.seed('store_a', 'owner_a', 'frijol', 'null');
select pg_temp.seed('store_b', 'owner_b', 'queso', '{"price": 900, "currency": "CUP"}');

create function pg_temp.list_costs(p_store text) returns text
language sql as $$
  select string_agg(format('%s:%s', v -> 'node' ->> 'sku',
    coalesce((v -> 'node' -> 'variantCosts' ->> 'costPrice') || ' ' || (v -> 'node' -> 'variantCosts' ->> 'costCurrency'), '-')),
    ' ' order by v -> 'node' ->> 'sku')
  from jsonb_array_elements(public.admin_products(tests.fx(p_store), 50) -> 'adminSearchProducts' -> 'edges') e,
    jsonb_array_elements(e -> 'node' -> 'productVariantsCollection' -> 'edges') v;
$$;

-- ---------------------------------------------------------------------------
-- set_variant_costs (service role, as /api/v1 calls it)
-- ---------------------------------------------------------------------------

select tests.eq('set_variant_costs: a new cost and a changed one',
  public.set_variant_costs(tests.fx('store_a'), jsonb_build_array(
    jsonb_build_object('variant_id', tests.fx('arroz_variant'), 'cost', jsonb_build_object('price', 3.25, 'currency', 'USD')),
    jsonb_build_object('variant_id', tests.fx('frijol_variant'), 'cost', jsonb_build_object('price', 400, 'currency', 'CUP')))),
  2);
select tests.eq('set_variant_costs: the costs saved, nothing else of the product touched',
  (select string_agg(format('%s %s %s', v.sku, c.cost_price, c.cost_currency), ', ' order by v.sku)
   from public.variant_costs c join public.product_variants v on v.id = c.variant_id
   where c.store_id = tests.fx('store_a')) || ' | ' ||
  (select string_agg(price::text, ',') from public.product_variants where store_id = tests.fx('store_a')),
  'ARROZ 3.25 USD, FRIJOL 400.00 CUP | 1500.00,1500.00');
select public.set_variant_costs(tests.fx('store_a'), jsonb_build_array(
  jsonb_build_object('variant_id', tests.fx('frijol_variant'), 'cost', null)));
select tests.eq('set_variant_costs: null removes a cost',
  (select count(*) from public.variant_costs where variant_id = tests.fx('frijol_variant'))::int, 0);
select tests.check('set_variant_costs: a variant of another store is refused (and nothing is saved)',
  tests.throws(format($q$select public.set_variant_costs(%L, %L::jsonb)$q$, tests.fx('store_a'), jsonb_build_array(
    jsonb_build_object('variant_id', tests.fx('arroz_variant'), 'cost', jsonb_build_object('price', 1, 'currency', 'USD')),
    jsonb_build_object('variant_id', tests.fx('queso_variant'), 'cost', jsonb_build_object('price', 1, 'currency', 'CUP')))))
  and (select cost_price from public.variant_costs where variant_id = tests.fx('arroz_variant')) = 3.25
  and (select cost_price from public.variant_costs where variant_id = tests.fx('queso_variant')) = 900);
select tests.check('set_variant_costs: an unknown currency is refused',
  tests.throws(format($q$select public.set_variant_costs(%L, %L::jsonb)$q$, tests.fx('store_a'), jsonb_build_array(
    jsonb_build_object('variant_id', tests.fx('arroz_variant'), 'cost', jsonb_build_object('price', 1, 'currency', 'MLC'))))));

-- ---------------------------------------------------------------------------
-- Who reads and who writes
-- ---------------------------------------------------------------------------

select tests.login('owner_a');
select tests.eq('owner A: the list brings each cost (and «-» without one)', pg_temp.list_costs('store_a'),
  'ARROZ:3.25 USD FRIJOL:-');
select tests.check('owner A: cannot call set_variant_costs directly',
  tests.throws(format($q$select public.set_variant_costs(%L, '[]'::jsonb)$q$, tests.fx('store_a'))));
select tests.logout();

select tests.login('staff_a');
select tests.eq('staff A: the list without costs', pg_temp.list_costs('store_a'), 'ARROZ:- FRIJOL:-');
select tests.logout();

select tests.login('owner_b');
select tests.eq('owner B on store A: the published products are public, their costs are not',
  pg_temp.list_costs('store_a'), 'ARROZ:- FRIJOL:-');
select tests.logout();
