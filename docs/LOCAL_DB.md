# Local database (Supabase in Docker)

Since R11 (2026-10-28) development and tests run against a **local Supabase in Docker**, not against the online
project. The online project is a Nano instance with burstable CPU: every burst of e2e, qa, RLS tests, codegen or
imports used its CPU credits and left the real admin throttled for minutes (57014 statement timeouts). See
`.titan/qa/r11-rendimiento-admin/informe-diagnostico-2026-10-28.md`.

## Daily use

```bash
pnpm db:local:start     # first time: downloads the images (several GB) and applies supabase/migrations/*.sql
pnpm demo:seed          # Tienda Demo + its owner and staff (passwords from .env.local)
pnpm superadmin:create you@example.com
pnpm dev                # http://kshop.localhost:3000 and http://demo.kshop.localhost:3000 against the local database
pnpm db:local:stop      # stops the containers (the data stays in Docker volumes)
pnpm db:local:reset     # drops everything and applies the migrations again (then demo:seed)
```

Docker Desktop must be running. Studio (the local dashboard) is at http://127.0.0.1:54323 and the e-mails that Auth
sends locally at http://127.0.0.1:54324.

## Which commands go where

`scripts/db-env.mjs` decides: `KSHOP_DB_TARGET` from the environment, else from `.env.local`, else **local**.

| Local by default (through `scripts/db-env.mjs`) | Always the online project |
|---|---|
| `pnpm dev`, `demo:seed`, `superadmin:create`, every `e2e:*` and `qa:*`, `test:rls`, `db:graphql-schema`, `db:local:migrate`, `db:local:query` | `db:migrate`, `db:status`, `db:query`, `db:auth-config`, `klaushop:*`, `app:*` |

To run a local-by-default command against the online project, prefix it: `KSHOP_DB_TARGET=remote pnpm test:rls`
(after a migration, one pass online is still required). To measure production: `KSHOP_DB_TARGET=remote
QA_ADMIN_URL=https://demo.kshop.fullkod.com pnpm qa:admin-perf prod` (PowerShell: `$env:KSHOP_DB_TARGET="remote"; pnpm ...`).

## New migration

1. Write `supabase/migrations/<timestamp>_<name>.sql`.
2. Locally: `pnpm db:local:migrate` (or `pnpm db:local:reset`),
   `pnpm test:rls`, `pnpm db:graphql-schema && pnpm codegen`.
3. Online: `pnpm db:migrate`, then one `KSHOP_DB_TARGET=remote pnpm test:rls`, never while someone uses the admin.

## Notes

- Local auth settings live in `supabase/config.toml` (signup closed, redirects for `*.kshop.localhost`); the online
  ones in `supabase/auth-config.json` (`pnpm db:auth-config`).
- The local stack signs JWTs with its own keys; nothing local is valid online and vice versa.
- WhatsApp: the local database starts in `dry_run` (simulated) and has no OpenWA key, so nothing is ever sent.
- `apps/web/next.config.ts` refuses to start with `KSHOP_DB_TARGET=local` and an online Supabase URL.
