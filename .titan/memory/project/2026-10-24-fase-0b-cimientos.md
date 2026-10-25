# Fase 0b — cimientos (cerrada el 2026-10-24)

PRP: `.titan/plans/prp-fase-0b-cimientos.md`. Evidencia: `.titan/qa/fase-0b/`.

## Decisiones confirmadas
- **D1** Esquema con migraciones SQL a mano (`supabase/migrations/`), sin Drizzle.
- **D2** Escrituras críticas = funciones SQL `security definer` en `public` con `execute` **solo para
  `service_role`** (así pg_graphql no las expone a anon/authenticated), llamadas por RPC desde `/api/v1`
  con la secret key. Sin `DATABASE_URL`.
- **D3** (Roberto) Se trabaja **directo contra el Supabase online** `siyiupetrjyzkumhdupy` (dev = prod por
  ahora), sin pedir permiso para migraciones/tests/config de Auth. Cuenta Supabase: fullkod.dev.
- **D4** Acceso del dueño: `generateLink` (invite, o magiclink si ya existe) → el superadmin lo envía por
  WhatsApp. Sin proveedor de email. Signup público cerrado (`disable_signup`).
- **D5** `subscriptions` mínima; grants/facturas/suspensión automática en la Fase 5.
- **D6** Next 16.4 (`proxy.ts`), React 19, Tailwind v4, TS 5.9 (no 7 todavía), ESLint 9, Vitest 5, Zod 4.
- **D7** Tests de RLS con un harness SQL propio (`supabase/tests/_harness.sql`), no pgTAP: corren por la
  Management API en una transacción con rollback y devuelven filas `{name, ok, detail}`.

## Cómo funciona (lo que no se ve en el código a primera vista)
- `.env.local` único en la raíz; `apps/web/next.config.ts` lo carga y fija `env` para las `NEXT_PUBLIC_*`.
- Rutas: `proxy.ts` → plataforma (`kshop.localhost:3000`) o rewrite a `/s/{slug}`; `/s/...` directo y
  dominios propios dan 404 (dominios propios en la Fase 6). La API nunca deduce la tienda del host.
- `store_domains.domain` guarda el dominio canónico (`{slug}.kshop.fullkod.com`) aunque se cree en local.
- pg_graphql: introspección **desactivada** en vivo; `pnpm db:graphql-schema` la activa solo dentro de una
  transacción revertida para el codegen. urql necesita `preferGetMethod: false` (Supabase solo acepta POST).
- La API de migraciones sella la versión con la hora actual: `db.mjs` la reescribe con la del archivo.
- Supabase bloquea `delete` directo en `storage.objects` (trigger): en tests, "no borra" = error o 0 filas.
- Next 16 genera `apps/web/AGENTS.md` (reglas de Next) al hacer `dev`; se versiona.

## Cuentas
- Superadmin real: `kshop@fullkod.com` — contraseña en la nota del Espacio de KShop en Tasknic
  ("Acceso superadmin Kshop"), nunca en el repo.
- E2E: `*@e2e.kshop.test`, contraseñas generadas en `.env.local`; `pnpm e2e:cleanup` las borra.
