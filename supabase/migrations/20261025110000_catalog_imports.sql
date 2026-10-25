-- Phase 1.7: Excel import jobs (decision D2). The file goes to the private bucket store-imports, the server
-- parses and validates it into import_job_rows (preview), then applies it product by product.

create type public.import_job_status as enum ('ready', 'importing', 'done', 'failed', 'cancelled');
create type public.import_mode as enum ('create_only', 'upsert');

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  product_type_id uuid,
  mode public.import_mode not null default 'create_only',
  file_key text not null,
  file_name text,
  status public.import_job_status not null default 'ready',
  total_rows int not null default 0,
  total_products int not null default 0,
  created_count int not null default 0,
  updated_count int not null default 0,
  skipped_count int not null default 0,
  error_count int not null default 0,
  -- Preview summary: structure to create (categories, brands, values), limit warning…
  options jsonb not null default '{}',
  summary jsonb not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (store_id, id),
  foreign key (store_id, product_type_id) references public.product_types (store_id, id) on delete set null (product_type_id)
);

create index import_jobs_store_idx on public.import_jobs (store_id, created_at desc);
create index import_jobs_type_idx on public.import_jobs (store_id, product_type_id);
create index import_jobs_created_by_idx on public.import_jobs (created_by);

create table public.import_job_rows (
  store_id uuid not null,
  job_id uuid not null,
  row_number int not null,
  product_key text not null,
  data jsonb not null,
  -- create | update | skip (decided at preview; skip when the row or its product group has errors)
  action text not null check (action in ('create', 'update', 'skip')),
  errors jsonb not null default '[]',
  applied_at timestamptz,
  primary key (job_id, row_number),
  foreign key (store_id, job_id) references public.import_jobs (store_id, id) on delete cascade
);

create index import_job_rows_group_idx on public.import_job_rows (job_id, product_key);
create index import_job_rows_store_idx on public.import_job_rows (store_id, job_id);

alter table public.import_jobs enable row level security;
alter table public.import_job_rows enable row level security;
revoke all on public.import_jobs, public.import_job_rows from anon, authenticated;
grant select on public.import_jobs, public.import_job_rows to authenticated;

create policy "import_jobs: store admins" on public.import_jobs for select
to authenticated
using ((select private.is_superadmin()) or private.has_store_role(store_id, 'admin'));

create policy "import_job_rows: store admins" on public.import_job_rows for select
to authenticated
using ((select private.is_superadmin()) or private.has_store_role(store_id, 'admin'));

-- ---------------------------------------------------------------------------
-- Private bucket for the uploaded spreadsheets: stores/{store_id}/imports/...
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-imports',
  'store-imports',
  false,
  10485760,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

create policy "store-imports: admins upload to own store" on storage.objects for insert
to authenticated
with check (
  bucket_id = 'store-imports'
  and (storage.foldername(name))[3] = 'imports'
  and (select private.has_store_role(private.storage_store_id(name), 'admin'))
);

create policy "store-imports: admins read own store" on storage.objects for select
to authenticated
using (
  bucket_id = 'store-imports'
  and (select private.has_store_role(private.storage_store_id(name), 'admin'))
);

-- ---------------------------------------------------------------------------
-- Applies one product group of an import in one transaction.
-- p_payload: {product_type_id, name, slug, description, category_id, brand_id, status, tags[],
--             collection_ids[], attributes[], variants: [{sku, name, price, compare_at_price, cost, stock,
--             attribute_values[]}]}  (same shape as save_product)
-- New product (no SKU of the group exists): save_product. Existing product (mode upsert): updates the given
-- fields and variants by SKU, adds new variants, never deletes variants missing from the file.
-- Returns 'created' | 'updated' | 'skipped'.
-- ---------------------------------------------------------------------------

create function public.import_product(
  p_store_id uuid,
  p_job_id uuid,
  p_mode public.import_mode,
  p_payload jsonb,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_variant jsonb;
  v_variant_id uuid;
  v_type public.product_types;
  v_warehouse uuid;
  v_attr jsonb;
  v_value_id text;
  v_next_sort int;
begin
  select v.product_id into v_product_id
  from public.product_variants v
  where v.store_id = p_store_id
    and upper(v.sku) in (select upper(x ->> 'sku') from jsonb_array_elements(p_payload -> 'variants') x)
  limit 1;

  if v_product_id is null then
    perform public.save_product(p_store_id, p_payload, p_user_id);
    -- Movements of the initial stock belong to the job.
    update public.stock_movements m set import_job_id = p_job_id, type = 'import'
    where m.store_id = p_store_id and m.import_job_id is null and m.created_at = now()
      and m.variant_id in (
        select v.id from public.product_variants v
        where v.store_id = p_store_id
          and upper(v.sku) in (select upper(x ->> 'sku') from jsonb_array_elements(p_payload -> 'variants') x)
      );
    return 'created';
  end if;

  if p_mode = 'create_only' then
    return 'skipped';
  end if;

  select t.* into v_type from public.product_types t
  join public.products p on p.product_type_id = t.id
  where p.id = v_product_id;

  update public.products set
    name = coalesce(nullif(p_payload ->> 'name', ''), name),
    description = case when p_payload ? 'description'
      then jsonb_build_object('format', 'plain', 'text', p_payload ->> 'description') else description end,
    description_plain = coalesce(p_payload ->> 'description', description_plain),
    category_id = case when p_payload ? 'category_id' then nullif(p_payload ->> 'category_id', '')::uuid else category_id end,
    brand_id = case when p_payload ? 'brand_id' then nullif(p_payload ->> 'brand_id', '')::uuid else brand_id end,
    status = coalesce(nullif(p_payload ->> 'status', '')::public.product_status, status)
  where id = v_product_id;

  if p_payload ? 'tags' then
    delete from public.product_tags where product_id = v_product_id;
    insert into public.product_tags (store_id, product_id, tag)
    select distinct p_store_id, v_product_id, btrim(t)
    from jsonb_array_elements_text(p_payload -> 'tags') t where btrim(t) <> '';
  end if;

  insert into public.collection_products (store_id, collection_id, product_id)
  select p_store_id, (c)::uuid, v_product_id
  from jsonb_array_elements_text(coalesce(p_payload -> 'collection_ids', '[]'::jsonb)) c
  on conflict do nothing;

  for v_attr in select * from jsonb_array_elements(coalesce(p_payload -> 'attributes', '[]'::jsonb)) loop
    delete from public.product_attribute_values
    where product_id = v_product_id and attribute_id = (v_attr ->> 'attribute_id')::uuid;
    if jsonb_array_length(coalesce(v_attr -> 'value_ids', '[]'::jsonb)) > 0 then
      for v_value_id in select * from jsonb_array_elements_text(v_attr -> 'value_ids') loop
        insert into public.product_attribute_values (store_id, product_id, attribute_id, value_id)
        values (p_store_id, v_product_id, (v_attr ->> 'attribute_id')::uuid, v_value_id::uuid);
      end loop;
    elsif nullif(v_attr ->> 'value_text', '') is not null then
      insert into public.product_attribute_values (store_id, product_id, attribute_id, value_text)
      values (p_store_id, v_product_id, (v_attr ->> 'attribute_id')::uuid, v_attr ->> 'value_text');
    end if;
  end loop;

  select id into v_warehouse from public.warehouses where store_id = p_store_id and is_default;
  select coalesce(max(sort_order) + 1, 0) into v_next_sort from public.product_variants where product_id = v_product_id;

  for v_variant in select * from jsonb_array_elements(p_payload -> 'variants') loop
    select id into v_variant_id from public.product_variants
    where store_id = p_store_id and upper(sku) = upper(v_variant ->> 'sku');

    if v_variant_id is null then
      if not v_type.has_variants then
        raise exception 'This product type has no variants' using errcode = '23514', hint = 'variants';
      end if;
      insert into public.product_variants (store_id, product_id, sku, name, sort_order, price, compare_at_price)
      values (p_store_id, v_product_id, v_variant ->> 'sku', coalesce(v_variant ->> 'name', ''), v_next_sort,
              (v_variant ->> 'price')::numeric, (v_variant ->> 'compare_at_price')::numeric)
      returning id into v_variant_id;
      v_next_sort := v_next_sort + 1;
      insert into public.variant_attribute_values (store_id, variant_id, attribute_id, value_id)
      select p_store_id, v_variant_id, (x ->> 'attribute_id')::uuid, (x ->> 'value_id')::uuid
      from jsonb_array_elements(coalesce(v_variant -> 'attribute_values', '[]'::jsonb)) x;
    else
      if (select product_id from public.product_variants where id = v_variant_id) <> v_product_id then
        raise exception 'SKU % belongs to another product', v_variant ->> 'sku' using errcode = '23505', hint = 'sku';
      end if;
      update public.product_variants set
        price = coalesce((v_variant ->> 'price')::numeric, price),
        compare_at_price = case when v_variant ? 'compare_at_price'
          then (v_variant ->> 'compare_at_price')::numeric else compare_at_price end,
        name = coalesce(nullif(v_variant ->> 'name', ''), name)
      where id = v_variant_id;
    end if;

    if jsonb_typeof(v_variant -> 'cost') = 'object' then
      insert into public.variant_costs (store_id, variant_id, cost_price, cost_currency)
      values (p_store_id, v_variant_id, (v_variant -> 'cost' ->> 'price')::numeric, v_variant -> 'cost' ->> 'currency')
      on conflict (variant_id) do update set cost_price = excluded.cost_price, cost_currency = excluded.cost_currency;
    end if;

    if (v_variant ->> 'stock') is not null then
      perform public.set_stock_quantity(
        p_store_id, v_variant_id, v_warehouse, (v_variant ->> 'stock')::int, 'import', null, p_user_id, p_job_id
      );
    end if;
  end loop;

  perform private.refresh_product_summary(v_product_id);
  return 'updated';
end;
$$;

revoke all on function public.import_product(uuid, uuid, public.import_mode, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.import_product(uuid, uuid, public.import_mode, jsonb, uuid) to service_role;
