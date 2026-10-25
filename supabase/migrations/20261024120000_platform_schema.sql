-- Phase 0b: platform schema (stores, domains, members, modules, plans, subscriptions).
-- Every store table carries store_id first in composite keys. RLS is enabled on every table.
-- Writes go through the server (service_role); anon/authenticated only read what policies allow.

create extension if not exists pg_graphql;

create schema if not exists private;
revoke all on schema private from public;
-- RLS policies call private helpers, so the API roles need usage (pg_graphql only exposes public).
grant usage on schema private to anon, authenticated, service_role;

comment on schema public is '@graphql({"inflect_names": true, "max_rows": 100})';

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.store_status as enum ('active', 'suspended', 'archived');
-- Ordered from least to most privileged so roles compare with >=.
create type public.store_role as enum ('staff', 'admin', 'owner');
create type public.domain_type as enum ('subdomain', 'custom');
create type public.module_source as enum ('plan', 'addon', 'grant');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'suspended', 'cancelled', 'comped');
create domain public.currency_code as text check (value in ('CUP', 'USD', 'EUR'));

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stores
-- ---------------------------------------------------------------------------

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (char_length(name) between 2 and 80),
  status public.store_status not null default 'active',
  base_currency public.currency_code not null default 'CUP',
  order_prefix text not null check (order_prefix ~ '^[A-Z0-9]{1,6}$'),
  whatsapp_phone text check (whatsapp_phone ~ '^\+?[0-9]{8,15}$'),
  logo_url text,
  theme jsonb not null default '{}',
  settings jsonb not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Same rules as storeSlugSchema / RESERVED_SLUGS in @kshop/core.
  constraint stores_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' and position('--' in slug) = 0),
  constraint stores_slug_not_reserved check (slug <> all (array[
    'admin', 'api', 'app', 'assets', 'auth', 'blog', 'cdn', 'dashboard', 'dev', 'docs', 'fullkod', 'help', 'kshop',
    'mail', 'platform', 'shop', 'soporte', 'static', 'status', 'superadmin', 'support', 'test', 'www'
  ]))
);

create index stores_created_by_idx on public.stores (created_by);

create trigger stores_set_updated_at
before update on public.stores
for each row execute function private.set_updated_at();

create table public.store_domains (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  domain text not null unique check (domain = lower(domain)),
  type public.domain_type not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  vercel_status text,
  created_at timestamptz not null default now()
);

create index store_domains_store_id_idx on public.store_domains (store_id);
create unique index store_domains_one_primary_idx on public.store_domains (store_id) where is_primary;

create table public.store_members (
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.store_role not null,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create index store_members_user_id_idx on public.store_members (user_id);

-- Internal per-store configuration (tokens, integrations). Outside public: pg_graphql never sees it.
create table private.store_private_config (
  store_id uuid not null references public.stores (id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (store_id, key)
);

-- ---------------------------------------------------------------------------
-- Modules, plans and subscriptions
-- ---------------------------------------------------------------------------

create table public.modules (
  code text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  depends_on text[] not null default '{}',
  is_core boolean not null default false,
  addon_price numeric(12, 2) check (addon_price >= 0),
  addon_currency public.currency_code,
  sort_order int not null default 0
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price numeric(12, 2) not null check (price >= 0),
  currency public.currency_code not null,
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  is_public boolean not null default true,
  sort_order int not null default 0
);

create table public.plan_modules (
  plan_id uuid not null references public.plans (id) on delete cascade,
  module_code text not null references public.modules (code),
  limits jsonb not null default '{}',
  primary key (plan_id, module_code)
);

create index plan_modules_module_code_idx on public.plan_modules (module_code);

create table public.plan_limits (
  plan_id uuid not null references public.plans (id) on delete cascade,
  key text not null,
  value int not null check (value >= 0),
  primary key (plan_id, key)
);

-- Effective modules of a store. Disabling a module never deletes data: it only flips this table.
create table public.store_modules (
  store_id uuid not null references public.stores (id) on delete cascade,
  module_code text not null references public.modules (code),
  source public.module_source not null,
  enabled boolean not null default true,
  limits jsonb not null default '{}',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (store_id, module_code, source)
);

create index store_modules_module_code_idx on public.store_modules (module_code);
create index store_modules_granted_by_idx on public.store_modules (granted_by);

-- Minimal in Phase 0b (decision D5): grants, invoices and automatic suspension come in Phase 5.
create table public.subscriptions (
  store_id uuid primary key references public.stores (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_plan_id_idx on public.subscriptions (plan_id);

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth helpers (security definer, empty search_path; call them as (select private.fn()) in policies)
-- ---------------------------------------------------------------------------

create function private.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin', false);
$$;

create function private.my_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.store_id from public.store_members m where m.user_id = (select auth.uid());
$$;

create function private.has_store_role(p_store_id uuid, p_min_role public.store_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_members m
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
      and m.role >= p_min_role
  );
$$;

create function private.store_has_module(p_store_id uuid, p_module_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_modules sm
    join public.stores s on s.id = sm.store_id
    where sm.store_id = p_store_id
      and sm.module_code = p_module_code
      and sm.enabled
      and sm.starts_at <= now()
      and (sm.ends_at is null or sm.ends_at > now())
      and s.status <> 'archived'
  );
$$;

revoke all on all functions in schema private from public;
grant execute on function private.is_superadmin() to anon, authenticated, service_role;
grant execute on function private.my_store_ids() to anon, authenticated, service_role;
grant execute on function private.has_store_role(uuid, public.store_role) to anon, authenticated, service_role;
grant execute on function private.store_has_module(uuid, text) to anon, authenticated, service_role;
grant execute on function private.try_uuid(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing and grant only what the API roles need.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

-- Public store card. settings, created_by and order_prefix stay server-only.
grant select (id, slug, name, status, base_currency, whatsapp_phone, logo_url, theme, created_at)
  on public.stores to anon, authenticated;
grant select on public.modules, public.plans, public.plan_modules, public.plan_limits to anon, authenticated;
grant select on public.store_domains, public.store_members, public.store_modules, public.subscriptions
  to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.stores enable row level security;
alter table public.store_domains enable row level security;
alter table public.store_members enable row level security;
alter table public.modules enable row level security;
alter table public.plans enable row level security;
alter table public.plan_modules enable row level security;
alter table public.plan_limits enable row level security;
alter table public.store_modules enable row level security;
alter table public.subscriptions enable row level security;
-- No policies on purpose: only service_role (which bypasses RLS) can touch it.
alter table private.store_private_config enable row level security;

create policy "stores: public cards are readable"
on public.stores for select
to anon, authenticated
using (status <> 'archived' or (select private.is_superadmin()));

create policy "store_domains: members and superadmin read"
on public.store_domains for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "store_members: members and superadmin read"
on public.store_members for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "modules: catalog is public"
on public.modules for select
to anon, authenticated
using (true);

create policy "plans: public plans are readable"
on public.plans for select
to anon, authenticated
using (is_public or (select private.is_superadmin()));

create policy "plan_modules: readable with its plan"
on public.plan_modules for select
to anon, authenticated
using (exists (select 1 from public.plans p where p.id = plan_id and (p.is_public or (select private.is_superadmin()))));

create policy "plan_limits: readable with its plan"
on public.plan_limits for select
to anon, authenticated
using (exists (select 1 from public.plans p where p.id = plan_id and (p.is_public or (select private.is_superadmin()))));

create policy "store_modules: members and superadmin read"
on public.store_modules for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));

create policy "subscriptions: members and superadmin read"
on public.subscriptions for select
to authenticated
using (store_id in (select private.my_store_ids()) or (select private.is_superadmin()));
