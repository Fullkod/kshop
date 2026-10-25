<!-- titan-factory-codex:start -->
## Titan Factory Codex

- At the start of a relevant project task, read `.titan/memory/MEMORY.md` if present and only its relevant linked entries.
- Use available `tf-` skills for matching work. Skills do not imply connected services or permission for unrelated actions.
- This project has its own stack (see below). Never migrate it to the Titan Factory golden path. Preserve this project's stack and the user's explicit choices.
- Keep project decisions in `.titan/memory/`, feature plans in `.titan/plans/` and useful QA evidence in `.titan/qa/`. Read-only tasks must not write state.
- Reuse authorization already given for the task. Delegate only when the user requests or authorizes delegation; do not launch agents merely because role files exist.
- Preserve local code and project knowledge during toolkit updates. Never store credentials in shared memory.
<!-- titan-factory-codex:end -->

<!-- titan-factory-shared:start -->
## Shared agent tooling

- This repository hosts two Titan Factory toolboxes: Codex (`plugins/titan-factory-codex/`, `.codex/`, `.agents/`) and Claude Code (`CLAUDE.md`, `.claude/`). Both use the same `tf-` skill names.
- Both share one project memory: `.titan/memory/` (plus `.titan/plans/` and `.titan/qa/`). Never create a second copy such as `.claude/memory/`. Entries may come from either agent; keep the existing format (plain Markdown, `# Title`, one-line index entries appended to `MEMORY.md`).
- Do not modify the other agent's toolbox unless the task is about it. Setup for both agents: `docs/AGENT_SETUP.md`.
<!-- titan-factory-shared:end -->

# Kshop — reglas del proyecto (comunes a Claude Code y Codex)

> SaaS multi-tienda de **Fullkod**: cada tienda tiene su subdominio (`{slug}.kshop.fullkod.com`) o dominio
> propio, su catálogo, clientes, monedas y panel de admin. Un **superadmin** crea tiendas y cobra
> suscripciones (cobro manual al inicio). Mercado principal: Cuba (CUP/USD/EUR, checkout por WhatsApp).
> klauShop será la tienda nº 1 (migración de datos en la Fase 8), sin tocar su producción antes.
> Titan Factory es **solo la capa de agente**; el código NO sigue el Golden Path (ver abajo).

## Al empezar cada sesión

1. Leer `.titan/memory/MEMORY.md` y las entradas relevantes ANTES de tocar código.
   Las decisiones de producto viven en `.titan/memory/project/` (origen: `C:\Local-Disc-D\Project\Fullkod\_materiales\kshop`).
   Si algo choca, gana la decisión más reciente.
2. Si un skill asume el Golden Path (Polar, Prisma, Server Actions, Next 16 sin monorepo…), **las reglas de este
   archivo ganan**. Adapta el skill al proyecto; no migres el proyecto al skill.
3. Trabajo por fases: una fase = un PRP en `.titan/plans/` aprobado por Roberto → implementación →
   verificación (typecheck, lint, tests, tests de RLS, prueba en navegador) → commit.
4. **Nada de push, deploy ni cambios en servicios externos** (Vercel, GitHub, DNS) sin permiso explícito.
   Excepción (Roberto, 2026-10-24): el **Supabase online de Kshop** (dev y prod por ahora) admite migraciones,
   tests y config de Auth sin pedir permiso cada vez.

## Los 4 comportamientos (anti-fallos de código)

1. **Pensar antes de codificar** — Declara supuestos. Si hay varias interpretaciones, preséntalas. Las decisiones
   de producto las toma Roberto; las técnicas no triviales se proponen, no se imponen.
2. **Simplicidad primero** — El mínimo código que resuelve el problema. Sin abstracciones especulativas.
3. **Cambios quirúrgicos** — Toca solo lo necesario. Sigue el estilo existente.
4. **Ejecución orientada a objetivos** — Criterios verificables e iterar hasta cumplirlos. Plan breve `Paso → verificar: check`.

## Stack (confirmado en la Fase 0b)

| Capa | Tecnología |
|------|------------|
| Monorepo | **pnpm + Turborepo**. Paquetes `@kshop/*` |
| Web | `apps/web`: **Next.js 16** App Router (`proxy.ts`, no `middleware.ts`; leer `node_modules/next/dist/docs/`) — tienda pública (SSR/SEO), admin de tienda, superadmin y API `/api/v1` |
| Apps móviles | `apps/store-app` (una por tienda) y `apps/admin-app`: **Vite + React + Capacitor** (se añaden en la Fase 7) |
| Paquetes | `packages/ui` (shadcn/Tailwind, temas por tokens), `packages/core` (tipos, Zod, dinero/monedas, carrito, estados de orden), `packages/data` (cliente Supabase, documentos GraphQL + codegen, llamadas a la API) |
| BD / Auth / Storage | **Supabase** (proyecto propio `siyiupetrjyzkumhdupy`, nunca el de klauShop; por ahora dev = prod) |
| Lecturas | **pg_graphql** + urql + graphql-codegen; filtros facetados/búsqueda → funciones SQL |
| Escrituras críticas | Funciones SQL transaccionales (`for update` cuando toque) con `execute` solo para `service_role`, llamadas por RPC desde `/api/v1` |
| Esquema | `supabase/migrations/*.sql` (SQL a mano, sin Drizzle) aplicadas con la Management API; tests de RLS en `supabase/tests/` |
| Estilos | Tailwind v4 + componentes propios estilo shadcn en `@kshop/ui`; tokens de la marca (violeta #5B21B6, noche #24104F, dorado #F2B705; Outfit + DM Sans) |
| Deploy | Vercel con wildcard `*.kshop.fullkod.com` (en local: `*.localhost`) |

**Se aparta del Golden Path de Titan Factory:** sin Polar ni Prisma; suscripciones con cobro manual
(`platform_invoices`); checkout por WhatsApp; sin login OAuth para clientes; sin Server Actions para lógica.

## Arquitectura (reglas desde el primer commit)

- **Multi-tenant:** `store_id` en toda tabla de tienda, primero en los índices compuestos; slugs/SKU/números de
  orden únicos **por tienda**. RLS en **todas** las tablas + **tests de aislamiento entre tiendas** (un usuario de
  la tienda A no lee ni escribe nada de B: órdenes, clientes, carritos, storage).
- **Resolución de tienda por host** en el middleware de Next → rewrite a `/_store/[storeSlug]/...`; mapa host → store cacheado.
- **Usuarios:** superadmin = `app_metadata.role = 'superadmin'`; staff en `store_members` (owner/admin/staff);
  clientes = **una cuenta por tienda con email sintético** (`c_{hash}@customers.kshop.fullkod.com`,
  `app_metadata.store_id`). La RLS exige además que el `store_id` del JWT coincida.
- **RLS:** helpers `security definer` en schema `private`, envueltos en `(select …)`; tablas internas fuera de
  `public` o con RLS sin políticas + `revoke` (pg_graphql expone todo `public`). El **precio de costo nunca** se
  expone en lecturas públicas.
- **App móvil (Capacitor) desde el día 1:** nada de lógica de negocio en Server Actions; toda mutación por
  `/api/v1/...` con `Authorization: Bearer <token Supabase>` o RPC; auth por token (no solo cookies); el
  código de `packages/*` **no importa `next/*`**; en la app la tienda viene de la config del build.
- **Módulos por plan:** el esquema existe para todas las tiendas; se activa la funcionalidad. Cada módulo en
  `features/<modulo>/` con su `module.ts`, registrado en un registro central. Comprobación en las tres capas:
  UI (entitlements), API (`requireModule(storeId, code)`) y BD (`private.store_has_module`). Desactivar un
  módulo nunca borra datos. El core no importa módulos opcionales.
- **Dinero:** `numeric(12,2)` + código de moneda (`CUP`, `USD`, `EUR`; el MLC no existe). Órdenes y líneas
  guardan snapshot de precios, costo, tasa y descuentos.
- **Storage:** bucket único con prefijo `stores/{store_id}/...` y políticas por `store_id`.

## Reglas de código

- Código, identificadores, comentarios, commits y nombres de archivo en **inglés**; UI en **español**
  (sin i18n en el MVP, pero sin textos imposibles de extraer después).
- Componentes `PascalCase.tsx`; funciones/variables `camelCase`.
- Validar con **Zod** toda entrada (route handlers, funciones). Escrituras críticas con
  `requireStoreRole(storeId, role)` explícito en servidor.
- Operaciones de stock/órdenes en transacción con `for update`.
- Nuevo `any` prohibido (usar `unknown`).
- **NUNCA** exponer secretos (ni en código, ni en memoria, ni en `.mcp.json`). `.env.local` está en `.gitignore`.
- appId de las apps: `com.fullkod.kshop.<slug>` (tienda) y `com.fullkod.kshop.admin`.
- Commits: `feat:` / `fix:` / `refactor:` / `chore:` / `docs:` en inglés.

## Comandos

`.env.local` vive en la **raíz** (lo leen los scripts y `apps/web/next.config.ts`); plantilla en `.env.example`.

| Comando | Qué hace |
|---------|----------|
| `pnpm dev` | Web en `http://kshop.localhost:3000` (plataforma) y `http://{slug}.kshop.localhost:3000` (tiendas) |
| `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` | Calidad (Turborepo). El lint prohíbe `next/*` en `packages/*`, `"use server"` y `any` |
| `pnpm db:status` · `pnpm db:migrate` | Estado / aplicar `supabase/migrations/*.sql` en el Supabase online (Management API, con historial) |
| `pnpm test:rls` | Tests de aislamiento entre tiendas (`supabase/tests/*.test.sql`), en una transacción con rollback |
| `pnpm db:query "<sql>"` | SQL ad hoc contra el proyecto |
| `pnpm db:auth-config` | Aplica `supabase/auth-config.json` (site URL, redirects `*.kshop.localhost`, signup cerrado) |
| `pnpm db:graphql-schema` → `pnpm codegen` | Vuelca el esquema de pg_graphql (introspección solo en transacción) y regenera `packages/data/src/gql` |
| `pnpm superadmin:create <email>` | Crea o promueve un superadmin |
| `pnpm e2e:setup` · `pnpm e2e:api` · `pnpm e2e:cleanup` | Cuentas `@e2e.kshop.test`, checks de API y limpieza (con `pnpm dev` corriendo) |

Tras cada migración que toque tablas o funciones públicas: `pnpm test:rls`, `pnpm db:graphql-schema && pnpm codegen`.

## Auto-blindaje

Error → fix → documentar. Errores de una fase en su PRP (`.titan/plans/`); patrones recurrentes en
`.titan/memory/reference/`; reglas críticas para todo el proyecto en este archivo.
