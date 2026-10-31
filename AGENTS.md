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
| Lecturas | **Funciones SQL por PostgREST, nunca pg_graphql** (R11, 2026-10-28: su primera consulta por conexión reconstruye el esquema, ~250 ms de CPU, segundos en la Nano). Admin (web y Kshop Admin): `public.admin_*` (`security invoker`) por `reads` de la sesión (`createAdminReads`). Tienda pública: `public.sf_<operación>(p_vars jsonb)` por `createGraphqlClient`, que manda cada documento GraphQL de `packages/data` a su función. Los documentos GraphQL quedan **solo como forma y tipos** (codegen sobre `packages/data/graphql/schema.json`); cada función devuelve exactamente esa forma (numeric y jsonb como texto). Toda función nueva: comparador (`scripts/compare-admin-reads.mjs`, `scripts/compare-storefront-reads.mjs`) y test de aislamiento. Filtros facetados/búsqueda → funciones SQL |
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
- **Secciones del menú (R12):** el superadmin pone cada módulo no básico de una tienda en Visible / «Gestionado por
  admin» / Oculto (`store_section_settings`). Es aparte del plan: ocultar no apaga ni borra. Las escrituras del personal
  en esa sección dan 403 en `assertStoreWritable` según `server/section-guard.ts`; **toda ruta nueva de escritura bajo
  `/api/v1/stores/{id}/` va en `SECTION_WRITES` o `SECTION_FREE_WRITES`** (un test lo exige). Básicas, nunca
  configurables: Inicio, Pedidos, Clientes, Catálogo, Plan y facturación, Equipo.
- **Dinero:** `numeric(12,2)` + código de moneda (`CUP`, `USD`, `EUR`; el MLC no existe). Órdenes y líneas
  guardan snapshot de precios, costo, tasa y descuentos.
- **Storage:** prefijo `stores/{store_id}/...` y políticas por `store_id`: `store-media` (lectura pública: imágenes,
  logos) y `store-private` (solo staff de la tienda, URLs firmadas: comprobantes de pago).

## Reglas de código

- Código, identificadores, comentarios, commits y nombres de archivo en **inglés**; UI en **español**
  (sin i18n en el MVP, pero sin textos imposibles de extraer después).
- Componentes `PascalCase.tsx`; funciones/variables `camelCase`.
- Admin: crear/editar corto en el `Dialog` de `@kshop/ui` (R13); los largos (producto, nuevo pedido) en su página.
- **Teléfono:** lo que se toca mide 40 px o más bajo la variante `touch:` (dedo o pantalla estrecha), los campos van a 16 px solos; pestañas de módulo con `AdminSubNav`, filtros de lista con `FilterBar`, «Volver» lo pone la barra del móvil (ver `.titan/memory/reference/web-en-el-telefono.md`).
- Confirmaciones con `useConfirm()` de `@kshop/ui` (R14), nunca `window.confirm`/`prompt`/`alert` (lint `no-alert`); todo
  borrado y toda acción que cambie la factura o suspenda una tienda pregunta antes.
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
| `pnpm db:test:status` · `db:test:migrate` · `db:test:query` · `db:test:auth-config` | R11: proyecto Supabase de prueba «KShop Test» (`SUPABASE_TEST_PROJECT_REF`). `pnpm dev`, `demo:seed`, `superadmin:create`, `e2e:*`, `qa:*`, `test:rls` van a **prueba** por defecto (`scripts/db-env.mjs`; `KSHOP_DB_TARGET=prod` para producción). `node scripts/copy-demo-to-test.mjs` copia la Tienda Demo de producción a prueba (sin clientes). Migración nueva: primero prueba, luego producción. Ver `docs/TEST_DB.md` |
| `pnpm db:status` · `pnpm db:migrate` | Estado / aplicar `supabase/migrations/*.sql` en el Supabase online (Management API, con historial) |
| `pnpm test:rls` | Tests de aislamiento entre tiendas (`supabase/tests/*.test.sql`), en una transacción con rollback |
| `pnpm db:query "<sql>"` | SQL ad hoc contra el proyecto |
| `pnpm db:auth-config` | Aplica `supabase/auth-config.json` (site URL, redirects `*.kshop.localhost`, signup cerrado) |
| `pnpm db:graphql-schema` → `pnpm codegen` | Vuelca el esquema de pg_graphql **del proyecto de prueba** (producción ya no tiene la extensión) y regenera los tipos de `packages/data/src/gql` |
| `node scripts/db-env.mjs node scripts/compare-admin-reads.mjs` · `… compare-storefront-reads.mjs` | Comparan cada función `admin_*` / `sf_*` con su documento GraphQL en el proyecto de prueba (único con pg_graphql); obligatorio al crear o cambiar una |
| `pnpm superadmin:create <email>` | Crea o promueve un superadmin |
| `pnpm e2e:setup` · `pnpm e2e:api` · `pnpm e2e:cleanup` | Cuentas `@e2e.kshop.test`, checks de API y limpieza (con `pnpm dev` corriendo) |
| `pnpm e2e:catalog` · `pnpm e2e:excel` · `pnpm e2e:excel-load` | API del catálogo (tiendas temporales), Excel e imágenes por URL (Tienda Demo) y carga de 1 000 filas (Tienda Demo, borra lo creado), con `pnpm dev` corriendo |
| `pnpm e2e:orders` · `pnpm qa:orders` | API de clientes, carrito, checkout y pedidos (tiendas temporales) y QA en navegador del ciclo de compra en la Tienda Demo (playwright-core con el Chromium de la caché de Playwright o `QA_CHROMIUM_PATH`; capturas en `.titan/qa/fase-3/`), con `pnpm dev` corriendo |
| `pnpm e2e:pos` · `pnpm qa:pos` | POS: API de la caja en tiendas temporales (catálogo sin costos, subir ventas, repetir sin duplicar, sin stock, sección y tienda suspendida) y QA en navegador de lo que ve el dueño en la Tienda Demo: venta sin teléfono, pestaña Mostrador, Admin › Caja, anotaciones y cancelar, y vender desde la web, también perdiendo la conexión (capturas en `.titan/qa/pos/`), con `pnpm dev` corriendo (`E2E_APP_URL`/`QA_BASE_URL` para otro puerto) |
| `pnpm qa:pos-offline` | POS: Kshop Admin sin red en el navegador (arranque, token caducado, vender, respuesta perdida, rechazo, anular, 7 días, cerrar sesión) en la Tienda Demo; con `pnpm dev` y el Vite de Kshop Admin en 5174 con `KSHOP_API_URL` al puerto de la web y `db-env`; capturas en `.titan/qa/pos/`. No sustituye la prueba en un Android real |
| `pnpm qa:payments` | KSH0002: QA en navegador del cobro en otra moneda en la Tienda Demo (móvil y escritorio; capturas en `.titan/qa/pos/`), con `pnpm dev` corriendo (`QA_BASE_URL` para otro puerto) |
| `pnpm e2e:discounts` · `pnpm e2e:notifications` · `pnpm qa:discounts` · `pnpm qa:notifications` | Fase 4: API de promociones/cupones (carrera por el último uso) y de avisos WhatsApp en `dry_run` (tiendas temporales), y QA en navegador en la Tienda Demo (capturas en `.titan/qa/fase-4/`), con `pnpm dev` corriendo |
| `pnpm e2e:favorites` | Rediseño v2: API de favoritos del cliente en la Tienda Demo (cliente temporal `@e2e.kshop.test`, se borra), con `pnpm dev` corriendo |
| `pnpm e2e:sections` · `pnpm qa:sections` | R12: visibilidad de las secciones del admin (403 `section_managed`/`section_hidden` al personal, el superadmin pasa; tienda temporal) y QA en navegador del menú de la Demo, la lista de tiendas y «Menú de la tienda» (capturas en `.titan/qa/r12-superadmin-v3/`), con `pnpm dev` corriendo (`E2E_APP_URL`/`QA_BASE_URL` para otro puerto) |
| `pnpm qa:dialogs` | R13: QA en navegador de los formularios en diálogo del admin de la Tienda Demo (17 pantallas, crea y borra una marca; capturas en `.titan/qa/r13-dialogos/`), con `pnpm dev` corriendo (`QA_BASE_URL` para otro puerto) |
| `pnpm qa:confirms` | R14: QA en navegador de las confirmaciones (Tienda Demo como dueño y tienda temporal como superadmin): cancelar no escribe nada, confirmar hace lo de siempre, ninguna caja del navegador; capturas en `.titan/qa/r14-confirmaciones/`, con `pnpm dev` corriendo (`QA_BASE_URL` para otro puerto) |
| `pnpm app:config <slug>` · `pnpm app:build <slug\|admin>` · `pnpm app:publish <slug\|admin>` · `pnpm app:keystore <slug\|admin>` | Fase 7: config de la app de tienda; proyecto Android con iconos (`--assemble` compila y firma; en la práctica lo hace el workflow «Android app» de GitHub Actions); sube el APK del artefacto a `store-apps` y lo registra oculto; crea la clave de firma fuera del repo (`--github`: secretos de Actions). Ver `docs/APPS.md` |
| `pnpm qa:apps` | QA en navegador de la app de tienda, Kshop Admin y la distribución (`/app`, Admin › App móvil, Superadmin › Apps), con `pnpm dev` y los Vite de las apps (5173, 5174) corriendo; capturas en `.titan/qa/fase-7/` |
| `pnpm demo:seed` | Crea/repara la tienda de pruebas permanente «Tienda Demo» (`demo.kshop.localhost:3000`) |
| `pnpm qa:admin-perf [etiqueta]` | R11: abre las 37 vistas del admin de la Tienda Demo como dueño (solo lectura) y guarda tiempo, peticiones y fallos por vista en `.titan/qa/r11-rendimiento-admin/perf-<etiqueta>.json`; `QA_ADMIN_URL` para medir producción, `QA_VIEWS` para algunas vistas |
| `pnpm qa:mobile` | La web en un teléfono: 61 páginas (admin de la Tienda Demo, tienda y superadmin) a 390 px con táctil; informe de desbordes, objetivos de menos de 40 px, campos de menos de 16 px, tablas sin scroll y subpáginas sin «Volver» en `.titan/qa/mobile-web/`, con `pnpm dev` corriendo (`QA_BASE_URL`, `QA_PLATFORM_URL`, `QA_PAGES`, `QA_VIEWS`) |

**La base es una Nano con CPU a créditos (R11, 2026-10-28):** una ráfaga la deja estrangulada varios minutos y el admin
cae con 57014. Nunca lanzar `e2e:*`, `qa:*`, `klaushop:*`, `test:rls`, `db:graphql-schema` ni `pnpm build` mientras
alguien usa la web ni justo antes de un deploy; en serie, nunca a la vez. Medir siempre en rondas alternadas.

**Dominio propio y Vercel (R11, 2026-10-28):** `KSHOP_CUSTOM_DOMAIN_REDIRECT=off` en Vercel (Production y Preview) hace
que el proxy no consulte, en cada visita a `{slug}.kshop.fullkod.com`, a qué dominio propio redirigir (ninguna tienda tiene uno
activo). **Antes de activar el primer dominio propio, borrar esa variable y redesplegar**; si no, la tienda funciona pero su
subdominio no redirige al dominio. El dominio propio en sí se resuelve siempre.

**WhatsApp en modo real** (Superadmin › WhatsApp, desde 2026-10-27): los `e2e:*` y `qa:*` crean pedidos y tiendas con
teléfonos de relleno que recibirían mensajes de verdad. Antes de correrlos, poner el modo en «Simulado» (`dry_run`) y
volver a «Real» al terminar. Para probar envíos reales solo los números de prueba de Roberto: +5352564206 y +5353077035.

**pg_graphql no existe en producción** (quitado el 2026-10-28; `create extension pg_graphql` lo devolvería): toda lectura es una
función SQL. Sigue en el proyecto de prueba solo para comparar formas y volcar tipos.

Tras cada migración que toque tablas o funciones públicas: `pnpm test:rls` (prueba y una vez en producción) y, si cambia
un documento GraphQL o una función de lectura, el comparador correspondiente y `pnpm db:graphql-schema && pnpm codegen`.
Después de `prettier --write` también `pnpm codegen` (reformatea el GraphQL embebido). Verifica por código de salida, no con `grep`.

## Auto-blindaje

Error → fix → documentar. Errores de una fase en su PRP (`.titan/plans/`); patrones recurrentes en
`.titan/memory/reference/`; reglas críticas para todo el proyecto en este archivo.
