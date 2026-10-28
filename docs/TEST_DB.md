# Test database ("KShop Test")

Production runs on a Supabase **Nano** (CPU on burst credits): a burst of tests or a schema dump leaves it throttled for
minutes and the admin fails with 57014 (R11). Development and tests therefore run on a second Supabase project in the
same organization, **KShop Test** (Free plan, `us-east-1`). Its ref goes in `.env.local` as
`SUPABASE_TEST_PROJECT_REF`; URL and keys are read from the Management API on each run, so nothing else is stored.

It has no OpenWA key in Vault, so it **never sends a real WhatsApp**. A Free project pauses after a week without
activity: restore it from the Supabase dashboard.

## Which command goes where

`scripts/db-env.mjs` decides: `--target=test|prod`, else `KSHOP_DB_TARGET` from the environment, else from `.env.local`,
else **test** when `SUPABASE_TEST_PROJECT_REF` is set.

| Test by default (through `scripts/db-env.mjs`) | Always production |
|---|---|
| `pnpm dev`, `demo:seed`, `superadmin:create`, `e2e:*`, `qa:*`, `test:rls` | `db:status`, `db:migrate`, `db:query`, `db:auth-config`, `klaushop:*` |
| `db:test:status`, `db:test:migrate`, `db:test:query`, `db:test:auth-config`, `db:graphql-schema` (always test) | |

Run a test-by-default command against production with `KSHOP_DB_TARGET=prod` (PowerShell:
`$env:KSHOP_DB_TARGET="prod"; pnpm ...`). Measuring production: `KSHOP_DB_TARGET=prod
QA_ADMIN_URL=https://demo.kshop.fullkod.com pnpm qa:admin-perf <label>`.

## New migration

1. `pnpm db:test:migrate`, then `pnpm test:rls` (test).
2. A new or changed read function (`admin_*`, `sf_*`): its comparator here (`node scripts/db-env.mjs node
   scripts/compare-admin-reads.mjs` or `compare-storefront-reads.mjs`) and, if a GraphQL document changed,
   `pnpm db:graphql-schema && pnpm codegen`.
3. Production: `pnpm db:migrate`, then one `KSHOP_DB_TARGET=prod pnpm test:rls`, never while someone uses the admin.

## pg_graphql

Production has no pg_graphql (removed on 2026-10-28, R11: its first query on every connection rebuilt its schema).
The test project keeps it only to compare each read function with the GraphQL document that gives it its shape and
types, and to dump `packages/data/graphql/schema.json` (`pnpm db:graphql-schema`). The first dump from here reorders
the file (other OIDs); after that the diffs are normal.

## Realistic data

`node scripts/copy-demo-to-test.mjs` copies the Tienda Demo of production (read only) into this project, without
customers (run `pnpm demo:seed` first so the owner and staff exist here).

## Setting it up again

`pnpm db:test:migrate` → `pnpm db:test:auth-config` → open one Realtime connection (a new project has no
`realtime.messages` partitions until Realtime sees its first client; without them the realtime RLS tests fail) →
`pnpm test:rls` → `pnpm demo:seed`.
