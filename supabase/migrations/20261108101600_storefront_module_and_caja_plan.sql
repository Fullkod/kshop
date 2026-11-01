-- KSH0004: the «Caja» plan, for a business that only keeps its inventory and sells at the counter, without an online
-- store (Roberto, 2026-11-01: 3 USD/month, 30/year, catalog + counter + orders + sales of the day + Excel, 300 products
-- and 2 staff). The online store becomes a module of its own («Tienda online», in Base and Pro, never sold alone): the
-- public web, the cart, the WhatsApp checkout and the customer accounts of a store without it are off, and what is
-- public in the database (store_is_public, public_store_ids) requires it. Nothing is deleted when a store loses it.

-- ---------------------------------------------------------------------------
-- Module «Tienda online», in every plan that sells online (and in the stores already on them)
-- ---------------------------------------------------------------------------

insert into public.modules (code, name, description, depends_on, is_core, sort_order)
values ('storefront', 'Tienda online', 'La web pública de la tienda: catálogo, carrito, pedidos por WhatsApp y cuentas de clientes.',
  '{catalog}', false, coalesce((select sort_order from public.modules where code = 'orders'), 0) + 5)
on conflict (code) do nothing;

insert into public.plan_modules (plan_id, module_code)
select id, 'storefront' from public.plans where code in ('base', 'pro')
on conflict do nothing;

insert into public.store_modules (store_id, module_code, source)
select s.store_id, 'storefront', 'plan'
from public.subscriptions s join public.plans p on p.id = s.plan_id
where p.code in ('base', 'pro')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Plan «Caja», before the Base
-- ---------------------------------------------------------------------------

insert into public.plans (code, name, price, yearly_price, currency, billing_interval, is_public, sort_order)
values ('caja', 'Caja', 3, 30, 'USD', 'month', true, 5)
on conflict (code) do nothing;

insert into public.plan_modules (plan_id, module_code)
select p.id, m.code
from public.plans p cross join unnest(array['catalog', 'orders', 'pos', 'sales_today', 'excel_import']) as m(code)
where p.code = 'caja'
on conflict do nothing;

insert into public.plan_limits (plan_id, key, value)
select p.id, l.key, l.value
from public.plans p cross join (values ('max_products', 300), ('max_staff', 2)) as l(key, value)
where p.code = 'caja'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- What is public needs the module: every anon policy and sf_* reader goes through one of these two
-- ---------------------------------------------------------------------------

create or replace function private.store_is_public(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stores s
    where s.id = p_store_id and s.status = 'active' and private.store_has_module(p_store_id, 'storefront')
  );
$$;

create or replace function private.public_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.stores s
  where s.status = 'active'
    and exists (
      select 1 from public.store_modules sm
      where sm.store_id = s.id and sm.module_code = 'storefront' and sm.enabled
        and sm.starts_at <= now() and (sm.ends_at is null or sm.ends_at > now())
    );
$$;

-- The hashed id sets of the catalog policies inlined «the store is active»: now through public_store_ids().
create or replace function private.public_product_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.products p
  where p.status = 'published' and p.store_id in (select private.public_store_ids());
$$;

create or replace function private.public_variant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select v.id
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where p.status = 'published' and p.store_id in (select private.public_store_ids());
$$;
