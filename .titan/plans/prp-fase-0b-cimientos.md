# PRP-0b: Cimientos de Kshop

> **Estado**: COMPLETADO (2026-10-24) — evidencia en `.titan/qa/fase-0b/`
> **Fecha**: 2026-10-24
> **Proyecto**: Kshop
> **Fase**: 0b (ver `arranque-y-fases.md`)

---

## Objetivo

Dejar el monorepo de Kshop funcionando en local con su esquema de plataforma multi-tenant en Supabase
(tiendas, dominios, miembros, módulos, planes) protegido por RLS con tests de aislamiento, resolución de
tienda por host, y un superadmin que puede crear tiendas con su dueño, de forma que cada tienda se abre en
su subdominio `{slug}.kshop.localhost`.

## Por Qué

| Problema | Solución |
|----------|----------|
| El repo solo tiene la capa de agente; no hay donde construir el catálogo (Fase 1) | Monorepo pnpm + Turborepo con `apps/web`, `packages/{ui,core,data}` y `supabase/`, con typecheck, lint y tests desde el primer commit |
| En multi-tenant un fallo de RLS es una fuga de datos entre clientes | Tablas de plataforma con RLS y helpers `private.*`, y tests de aislamiento A/B que se corren con un comando |
| Las tiendas se tienen que abrir solas por subdominio, sin tocar DNS ni código | Proxy/middleware de Next que resuelve la tienda por `Host` y hace rewrite interno |
| Las reglas de app móvil y de módulos son caras de añadir después | API `/api/v1` con Bearer, paquetes sin `next/*` y registro de módulos con comprobación en UI, API y BD desde el día 1 |
| Dar de alta una tienda no puede requerir a un desarrollador | Panel de superadmin: crear tienda, subdominio y dueño en un solo flujo |

**Valor de negocio**: es la base de todas las fases siguientes. Al cerrarla, Fullkod puede crear tiendas en
local en segundos y cada fase posterior (catálogo, tienda pública, compra…) se monta sobre un aislamiento
entre tiendas ya probado.

## Qué

### Criterios de Éxito
- [x] `pnpm install && pnpm dev` levanta `apps/web`; `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm build` pasan desde la raíz (Turborepo).
- [x] `supabase start` + `supabase db reset` aplican todas las migraciones desde cero sin errores; `pnpm test:rls` (pgTAP vía `supabase test db`) pasa con los tests de aislamiento entre tiendas A y B: miembros, módulos, config privada, suscripción y storage.
- [x] Un superadmin entra en `kshop.localhost:3000/superadmin`, crea las tiendas «Tienda A» y «Tienda B» con su dueño, y ambas aparecen en el listado.
- [x] `tienda-a.kshop.localhost:3000` muestra la tienda A y `tienda-b.kshop.localhost:3000` la B; un slug inexistente da 404 y una tienda suspendida muestra «Tienda temporalmente no disponible».
- [x] El dueño de A entra en `tienda-a.kshop.localhost:3000/admin` y ve su panel con el menú generado desde sus entitlements; con su sesión, `/admin` de B y la API de B le responden 403 (y la BD no le devuelve filas de B).
- [x] Ninguna mutación usa Server Actions; todas pasan por `/api/v1/*` con `Authorization: Bearer`; `packages/*` no importa `next/*` (comprobado por lint).
- [x] Prueba E2E con Playwright del flujo anterior, con capturas en `.titan/qa/fase-0b/`.

### Comportamiento Esperado (Happy Path)

1. Roberto ejecuta `pnpm db:start` (Supabase local en Docker) y `pnpm superadmin:create <email>`, que crea
   (o promociona) su usuario con `app_metadata.role = 'superadmin'`.
2. Entra en `http://kshop.localhost:3000/superadmin/login`, inicia sesión y ve el listado de tiendas (vacío).
3. Pulsa «Nueva tienda»: nombre «Tienda A» → slug `tienda-a` sugerido (editable, con comprobación de
   disponibilidad y lista de slugs reservados) → email del dueño → moneda base (CUP/USD/EUR) → prefijo de
   orden → WhatsApp → plan (Base por defecto) y días de prueba.
4. El panel llama a `POST /api/v1/platform/stores` (Bearer). El servidor valida con Zod, comprueba superadmin,
   crea o reutiliza el usuario del dueño en Supabase Auth y, en una transacción, crea `stores`,
   `store_domains` (subdominio, primario), `store_members` (owner), la suscripción/plan y los
   `store_modules` del plan. Devuelve la tienda y un **enlace de acceso para el dueño** (ver decisión D4).
5. `http://tienda-a.kshop.localhost:3000` muestra una portada mínima con el nombre de la tienda (las
   secciones reales llegan en la Fase 2).
6. El dueño abre el enlace, fija su contraseña y entra en `http://tienda-a.kshop.localhost:3000/admin`:
   ve el nombre de su tienda, su rol y el menú del admin construido desde el registro de módulos y sus
   entitlements (los módulos no incluidos aparecen como «Disponible en el plan Pro»).
7. Se repite para «Tienda B». El dueño de A no puede ver ni tocar nada de B por UI, API ni BD.

---

## Contexto

### Referencias
- `.titan/memory/project/decisiones.md` — decisiones 0–20 (leer antes de implementar).
- `.titan/memory/project/tenancy-dominios-auth.md` — host → tienda, alta de tienda, usuarios, storage.
- `.titan/memory/project/lecturas-graphql-y-rls.md` — reglas de RLS, pg_graphql y tests de aislamiento.
- `.titan/memory/project/modulos-y-planes.md` — `modules`, `plan_modules`, `store_modules`, entitlements en 3 capas.
- `.titan/memory/project/modelo-de-datos.md` §1 — tablas de plataforma.
- `.titan/memory/project/app-movil.md` — reglas 1–5 (sin Server Actions, Bearer, sin `next/*` en paquetes).
- `C:\Local-Disc-D\Project\Fullkod\klauShop` (**solo lectura**): `src/middleware.ts`, patrón `requireAdmin`,
  `scripts/check-graphql-schema.ts`, `scripts/supabase-mcp.mjs`, configuración de codegen (`graphql/`, `src/gql/`).
- Skills: `tf-supabase`, `supabase`, `supabase-postgres-best-practices` (RLS, índices, migraciones),
  `tf-playwright-cli` (E2E).
- Estado actual del repo: solo capa de agente (`.claude/`, `.codex/`, `.agents/`, `plugins/`), memoria,
  `scripts/supabase-mcp.mjs`, `.env.example` (ya prevé `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `DATABASE_URL`, `NEXT_PUBLIC_PLATFORM_DOMAIN=kshop.localhost`). Sin código de app ni `supabase/`.
- Entorno comprobado: Node 24.8, pnpm 9.15, Supabase CLI 2.121, Docker 24. `SUPABASE_PROJECT_REF` ya está en
  `.env.local` (proyecto propio de Kshop). El MCP de Supabase no conectó en esta sesión.

### Decisiones técnicas propuestas (Roberto confirma o cambia)

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D1 | Fuente del esquema | **Migraciones SQL con Supabase CLI** (`supabase/migrations/`). RLS, funciones, storage y comentarios de pg_graphql son SQL de todos modos | Drizzle para el esquema (como klauShop) + SQL a mano para RLS. Drizzle puede entrar más tarde solo para escrituras tipadas si hace falta |
| D2 | Escrituras críticas | **Confirmado con ajuste**: funciones SQL transaccionales (`public.create_store(...)`, `security definer`) con `execute` **solo para `service_role`** (revocado a `anon`/`authenticated`, así pg_graphql no las expone), llamadas desde el servidor por RPC con la secret key. Sin `DATABASE_URL` ni `postgres.js` en 0b | Drizzle con `db.transaction` |
| D3 | Entornos | **Decidido por Roberto (2026-10-24)**: se trabaja **directamente contra el Supabase online** (`SUPABASE_PROJECT_REF`), que por ahora es desarrollo y producción a la vez. Migraciones y cambios de config de Auth en ese proyecto **sin pedir permiso cada vez**. Las migraciones se aplican con la Management API (`pnpm db:migrate`, registra el historial igual que la CLI/MCP) y los tests de RLS corren en una transacción con `rollback` (`pnpm test:rls`) | Supabase local con Docker |
| D4 | Acceso del dueño | El servidor crea el usuario y genera un **enlace de acceso** (`auth.admin.generateLink`, tipo invite/recovery) que el superadmin copia y envía por WhatsApp. No depende de proveedor de email (aún sin decidir). En local también llega a Mailpit | Invitación por email (necesita SMTP propio en producción) o contraseña temporal mostrada una vez |
| D5 | Suscripción en 0b | **Mínima**: `subscriptions` (store_id, plan_id, status, trial_ends_at, current_period_end) para saber el plan de cada tienda y sembrar `store_modules`. Grants, facturas y suspensión automática → Fase 5 | Sin `subscriptions`; solo `store_modules` sembrados con el plan Base |
| D6 | Versiones | Next.js **última estable** al implementar (16.x: `proxy.ts` en lugar de `middleware.ts`), React 19, TypeScript estricto, Tailwind v4 + shadcn/ui, Vitest, ESLint flat config, Prettier | — |
| D7 | Tests de RLS | **pgTAP** en `supabase/tests/` (`supabase test db`), simulando JWT con `set local role` + `request.jwt.claims`. Un test de integración extra (Vitest + supabase-js) para storage y la API | Solo tests con supabase-js |

### Arquitectura Propuesta

```
kshop/
├── apps/
│   └── web/                         Next.js App Router
│       └── src/
│           ├── proxy.ts             Host → plataforma | tienda (rewrite interno)
│           ├── app/
│           │   ├── (platform)/      kshop.localhost: landing mínima + /superadmin
│           │   ├── s/[storeSlug]/   destino interno del rewrite: portada y /admin de la tienda
│           │   └── api/v1/          route handlers (Bearer): platform/stores, me, stores/[id]/entitlements
│           ├── server/              auth (getUserFromBearer, requireSuperadmin, requireStoreRole,
│           │                        requireModule), db (postgres.js), supabase admin client, errors
│           └── features/            un módulo por carpeta con su module.ts (registro central)
├── packages/
│   ├── core/                        tipos, Zod (slug, store input, currency), parseo de host,
│   │                                slugs reservados, códigos de módulos y registro, roles
│   ├── data/                        cliente Supabase por token (web y futura app), cliente urql
│   │                                para pg_graphql, documentos .graphql + codegen, cliente /api/v1
│   └── ui/                          shadcn/Tailwind, tokens de tema base
├── supabase/
│   ├── config.toml                  site_url y redirect URLs con wildcard *.kshop.localhost
│   ├── migrations/                  esquema de plataforma, helpers private.*, RLS, storage
│   ├── seed.sql                     módulos, planes Base/Pro, plan_modules, plan_limits
│   └── tests/                       pgTAP: aislamiento A/B
├── turbo.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.mjs
└── scripts/                         supabase-mcp.mjs (existe), create-superadmin.ts
```

Rutas por host (local):

| Host | Resultado |
|------|-----------|
| `kshop.localhost:3000` | Plataforma: landing mínima, `/superadmin/*` |
| `{slug}.kshop.localhost:3000` | Rewrite a `/s/{slug}/...`: portada de la tienda, `/admin/*` |
| `*/api/v1/*` | Sin rewrite; la tienda va en la ruta (`/api/v1/stores/{storeId}/...`), nunca se infiere del host (la app móvil no tiene host) |
| Acceso directo a `/s/...` desde el host de plataforma | 404 |
| Dominio propio | Tabla `store_domains` lista; lookup y alta con Vercel en la Fase 6 |

### Modelo de Datos

```sql
-- Tipos
create type public.store_status   as enum ('active', 'suspended', 'archived');
create type public.store_role     as enum ('owner', 'admin', 'staff');
create type public.domain_type    as enum ('subdomain', 'custom');
create type public.module_source  as enum ('plan', 'addon', 'grant');
create type public.subscription_status as enum ('trialing','active','past_due','suspended','cancelled','comped');
create domain public.currency_code as text check (value in ('CUP', 'USD', 'EUR'));

-- Plataforma
create table public.stores (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  name            text not null,
  status          public.store_status not null default 'active',
  base_currency   public.currency_code not null default 'CUP',
  order_prefix    text not null,
  whatsapp_phone  text,
  logo_url        text,
  theme           jsonb not null default '{}',
  settings        jsonb not null default '{}',
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.store_domains (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  domain        text not null unique,                    -- único global: un host = una tienda
  type          public.domain_type not null,
  is_primary    boolean not null default false,
  verified_at   timestamptz,
  vercel_status text,
  created_at    timestamptz not null default now()
);
create unique index on public.store_domains (store_id) where is_primary;

create table public.store_members (
  store_id   uuid not null references public.stores(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.store_role not null,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index on public.store_members (user_id);

create table private.store_private_config (         -- fuera de public: pg_graphql no la ve
  store_id uuid not null references public.stores(id) on delete cascade,
  key      text not null,
  value    jsonb not null,
  primary key (store_id, key)
);

-- Módulos y planes
create table public.modules (
  code text primary key, name text not null, description text,
  depends_on text[] not null default '{}', is_core boolean not null default false,
  addon_price numeric(12,2), addon_currency public.currency_code
);
create table public.plans (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  price numeric(12,2) not null, currency public.currency_code not null, interval text not null default 'month',
  is_public boolean not null default true, sort_order int not null default 0
);
create table public.plan_modules (plan_id uuid references public.plans(id), module_code text references public.modules(code),
  limits jsonb not null default '{}', primary key (plan_id, module_code));
create table public.plan_limits  (plan_id uuid references public.plans(id), key text, value int not null,
  primary key (plan_id, key));
create table public.store_modules (
  store_id uuid not null references public.stores(id) on delete cascade,
  module_code text not null references public.modules(code),
  source public.module_source not null, enabled boolean not null default true,
  limits jsonb not null default '{}', starts_at timestamptz not null default now(), ends_at timestamptz,
  granted_by uuid references auth.users(id),
  primary key (store_id, module_code, source)
);
create table public.subscriptions (                  -- mínima (D5); grants/facturas en Fase 5
  store_id uuid primary key references public.stores(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz, current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- Helpers (security definer, search_path fijo, se usan como (select private.fn()))
-- private.is_superadmin()                         -> app_metadata.role = 'superadmin'
-- private.my_store_ids()                          -> setof uuid de store_members del usuario
-- private.has_store_role(store_id, min_role)      -> owner > admin > staff
-- private.store_has_module(store_id, code)        -> módulo vigente (plan/addon/grant, fechas, enabled)
-- public.store_entitlements(store_id)             -> módulos + límites efectivos; solo miembros o superadmin
-- private.create_store(...)                       -> transacción de alta (stores, domain, member, subscription, store_modules)

-- RLS: enable en TODAS las tablas
--   stores:         select anon/auth si status <> 'archived' (columnas públicas por GRANT de columnas;
--                   created_by y settings no se exponen a anon); escritura solo servidor
--   store_domains:  select miembros + superadmin; escritura solo servidor
--   store_members:  select miembros de esa tienda + superadmin
--   store_modules, subscriptions: select miembros + superadmin
--   modules, plans (is_public), plan_modules, plan_limits: select público
--   private.*:      revoke all de anon/authenticated
-- Storage: bucket `store-media`, rutas `stores/{store_id}/...`; lectura pública, escritura solo
--   staff de esa tienda (has_store_role(..., 'staff') sobre el primer segmento tras `stores/`)
```

Seed: módulos (`catalog`, `orders`, `shipping`, `discounts`, `themes`, `excel_import`, `mobile_app`,
`sales_today` como base; `finance`, `multi_warehouse`, `multi_currency`, `whatsapp_notifications`,
`custom_domain` como Pro/sueltos), planes `base` y `pro` con precio provisional, `plan_limits.max_staff = 2`
en Base (decisión 20). `max_products` queda sin valor hasta que Roberto lo decida.

---

## Blueprint (Assembly Line)

> IMPORTANTE: Solo se definen FASES. Las subtareas se generan al entrar a cada fase
> siguiendo el bucle agéntico (mapear contexto → generar subtareas → ejecutar).

### Fase 1: Monorepo y tooling
**Objetivo**: pnpm workspace + Turborepo con `apps/web` (Next.js), `packages/{core,data,ui}`, TypeScript
estricto compartido, ESLint (con regla que prohíbe `next/*` en `packages/*` y `any` nuevo), Prettier,
Vitest y scripts raíz (`dev`, `build`, `typecheck`, `lint`, `test`, `test:rls`, `db:*`).
**Validación**: `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm build` pasan con una
página vacía; importar `next/server` en `packages/core` hace fallar el lint.

### Fase 2: Supabase local y esquema de plataforma
**Objetivo**: `supabase/` inicializado (config con redirect URLs `*.kshop.localhost`), migraciones de tipos,
tablas de plataforma, helpers `private.*`, RLS, grants de columnas, bucket de storage con políticas,
`private.create_store` y seed de módulos/planes.
**Validación**: `supabase db reset` aplica todo desde cero; `supabase db lint` sin errores; los advisors de
seguridad no marcan tablas sin RLS; pg_graphql expone solo lo previsto (introspección revisada).

### Fase 3: Tests de aislamiento entre tiendas
**Objetivo**: suite pgTAP que crea tiendas A y B con dueño, staff y un usuario ajeno, y verifica que nadie
lee ni escribe datos de la otra tienda (miembros, módulos, suscripción, dominios, config privada, storage),
que anon solo ve lo público y que el superadmin ve todo.
**Validación**: `pnpm test:rls` en verde; romper a propósito una política hace fallar al menos un test.

### Fase 4: Paquetes compartidos (core y data)
**Objetivo**: `@kshop/core` con Zod de entradas de plataforma, parseo de host → `{ kind, slug }`, slugs
reservados, roles y registro de códigos de módulos; `@kshop/data` con cliente Supabase por token, cliente
urql para pg_graphql, codegen desde el esquema local y cliente tipado de `/api/v1`.
**Validación**: tests de Vitest para parseo de host y validación de slug; `pnpm codegen` genera tipos sin
errores; un test comprueba que los códigos del registro TS coinciden con el seed de `modules`.

### Fase 5: Resolución de tienda por host
**Objetivo**: `proxy.ts` que separa plataforma y tiendas y hace rewrite a `/s/{slug}`; lookup de tienda por
slug cacheado con tag `store:{id}` (sin consultar la BD en cada request); páginas 404 y «Tienda
temporalmente no disponible»; portada mínima de la tienda.
**Validación**: en local, dos slugs sembrados se abren en su subdominio, uno inexistente da 404, uno
suspendido muestra el aviso y `/s/...` desde el host de plataforma da 404.

### Fase 6: Auth y API v1 base
**Objetivo**: login por email/contraseña (staff y superadmin) con sesión en la web que envía Bearer a la API;
helpers de servidor `getUserFromBearer`, `requireSuperadmin`, `requireStoreRole`, `requireModule`; formato
de error común; `GET /api/v1/me` y `GET /api/v1/stores/{id}/entitlements`; script `create-superadmin`.
**Validación**: tests de integración de la API: sin token 401, token de otra tienda 403, superadmin 200;
el script promociona un usuario y su JWT trae `role = superadmin`.

### Fase 7: Superadmin — crear tiendas y dueños
**Objetivo**: `/superadmin` con login, listado de tiendas (estado, plan, subdominio) y formulario «Nueva
tienda» que llama a `POST /api/v1/platform/stores` (Zod + `private.create_store` + usuario del dueño +
enlace de acceso según D4), con compensación si falla la transacción; cambiar estado activa/suspendida.
**Validación**: crear «Tienda A» y «Tienda B» desde la UI; slug duplicado o reservado da error claro en
español; si la BD falla no queda usuario huérfano.

### Fase 8: Admin mínimo de tienda y registro de módulos
**Objetivo**: `{slug}.kshop.localhost/admin` con login del staff de esa tienda, layout del admin y menú
generado desde el registro de módulos (`features/<modulo>/module.ts`) y los entitlements; módulos no
incluidos se muestran como «Disponible en el plan Pro»; un usuario sin rol en la tienda ve 403.
**Validación**: el dueño de A entra en A y no en B; quitar un módulo en `store_modules` lo cambia en el
menú sin borrar datos.

### Fase 9: Validación final
**Objetivo**: sistema funcionando end-to-end y documentado.
**Validación**:
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:rls` y `pnpm build` pasan
- [x] E2E Playwright: superadmin crea A y B → cada dueño entra en su subdominio → acceso cruzado rechazado; capturas en `.titan/qa/fase-0b/`
- [x] Criterios de éxito cumplidos
- [x] `AGENTS.md` (sección Comandos), `README.md`, `.env.example` y `docs/` actualizados; memoria en `.titan/memory/` con las decisiones D1–D7 confirmadas
- [x] Commit(s) `feat:`/`chore:` en local (sin push ni `db push` sin permiso)

---

## 🧠 Aprendizajes (Self-Annealing / Neural Network)

> Esta sección CRECE con cada error encontrado durante la implementación.
> El conocimiento persiste para futuros PRPs. El mismo error NUNCA ocurre dos veces.

- **Next 16 no lee `.env.local` de la raíz del monorepo** y `loadEnvConfig` en `next.config` no sirve (ya está cacheado): parsear el archivo a mano y fijar `env` para las `NEXT_PUBLIC_*`.
- **urql 6 usa GET** para consultas cortas y `/graphql/v1` de Supabase responde PGRST202: `preferGetMethod: false`.
- **Introspección de pg_graphql desactivada** por defecto: no se reactiva en vivo; el codegen la activa dentro de una transacción revertida y resuelve con `graphql.resolve` como `authenticated`.
- **pg_graphql no expone funciones que devuelven `table(...)`**: devolver `setof <tabla>` (store_entitlements).
- **Management API de migraciones**: sella la versión con la hora actual (dos en el mismo segundo chocan) → reescribir con la versión del archivo tras aplicar.
- **Supabase bloquea `delete` directo en `storage.objects`** con un trigger: los tests aceptan error o 0 filas y comprueban que el objeto sigue.
- **Dominios en `pg_graphql`** (`currency_code`) salen como `Opaque`: validar con Zod en el cliente.
- **`generateLink` (invite) funciona con `disable_signup`**: el alta de dueños no necesita signup público.
- **pgTAP sustituido** por un harness SQL mínimo: con la Management API solo se recibe el último `select`, así que los resultados van a una tabla temporal.
- Pendiente menor: aviso de consola "preload del logo no usado" (el `not-found` raíz renderiza `Brand`).

---

## Gotchas

> Cosas críticas a tener en cuenta ANTES de implementar

- [x] En App Router, las carpetas que empiezan por `_` son **privadas** (no generan rutas): el destino del rewrite no puede llamarse `_store`. Se propone `s/[storeSlug]` y bloquear su acceso directo en el proxy.
- [x] `*.localhost` resuelve a 127.0.0.1 en Chrome/Firefox sin tocar `hosts`; Playwright y `fetch` de Node pueden no hacerlo: puede hacer falta `--host-resolver-rules` o entradas en `hosts` para los tests.
- [x] Las cookies de sesión son por host: la sesión de `tienda-a.kshop.localhost` no sirve en `tienda-b` (bien), pero no compartir cookies en `.kshop.localhost`.
- [x] Supabase Auth necesita las URLs de redirección con wildcard (`http://*.kshop.localhost:3000/**`) en `config.toml`, y en remoto en el dashboard.
- [x] pg_graphql expone todo `public` (tablas y funciones): helpers y `create_store` van en `private`; las funciones públicas (`store_entitlements`) validan al llamador.
- [x] Helpers de RLS como `security definer` con `set search_path = ''` y envueltos en `(select …)`; índices en `store_members (user_id)` y en las columnas de las políticas.
- [x] `app_metadata` solo cambia vía Admin API y el JWT no se actualiza hasta el siguiente refresh: tras promover a superadmin hay que volver a iniciar sesión.
- [x] Crear el usuario en Auth no entra en la transacción SQL: si `private.create_store` falla, borrar el usuario recién creado (compensación); si el email ya existe, reutilizarlo (un dueño puede tener varias tiendas).
- [x] Conexión directa desde serverless: usar el pooler en modo transacción y `prepare: false` en `postgres.js`.
- [x] Slugs reservados (`www`, `api`, `admin`, `app`, `superadmin`, `kshop`, `mail`, `static`, `assets`…) validados en Zod **y** con check/tabla en BD.
- [x] El proxy de Next no debe consultar la BD por request: para subdominios el slug sale del host; el lookup cacheado ocurre en el layout de la tienda.
- [x] La tienda en la API va siempre en la ruta, nunca se infiere del host (la app móvil no tiene host propio).

## Anti-Patrones

- NO crear nuevos patrones si los existentes funcionan
- NO ignorar errores de TypeScript
- NO hardcodear valores (dominio de plataforma, puertos y URLs por env; slugs reservados y códigos de módulos como constantes en `@kshop/core`)
- NO omitir validación Zod en inputs de usuario
- NO usar Server Actions para lógica de negocio ni importar `next/*` en `packages/*`
- NO usar el service role en el navegador ni exponer `SUPABASE_SERVICE_ROLE_KEY` con prefijo `NEXT_PUBLIC_`
- NO crear tablas sin RLS ni dejar tablas internas en `public` sin `revoke`
- NO tocar el Supabase remoto (`db push`), Vercel, DNS ni GitHub sin permiso explícito de Roberto
- NO usar nada del Supabase de klauShop

---

*PRP aprobado el 2026-10-24. Marca: `_materiales/kshop/brand` (violeta #5B21B6, noche #24104F, dorado #F2B705; Outfit + DM Sans).*
