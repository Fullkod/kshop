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
| `pnpm dev`, `demo:seed`, `superadmin:create`, `e2e:*`, `qa:*`, `test:rls` | `db:status`, `db:migrate`, `db:query`, `db:auth-config`, `db:graphql-schema`, `klaushop:*` |
| `db:test:status`, `db:test:migrate`, `db:test:query`, `db:test:auth-config` (always test) | |

Run a test-by-default command against production with `KSHOP_DB_TARGET=prod` (PowerShell:
`$env:KSHOP_DB_TARGET="prod"; pnpm ...`). Measuring production: `KSHOP_DB_TARGET=prod
QA_ADMIN_URL=https://demo.kshop.fullkod.com pnpm qa:admin-perf <label>`.

## New migration

1. `pnpm db:test:migrate`, then `pnpm test:rls` (test).
2. Production: `pnpm db:migrate`, then one `KSHOP_DB_TARGET=prod pnpm test:rls` and `pnpm db:graphql-schema && pnpm codegen`,
   never while someone uses the admin. The schema is always dumped from production: the test project has other OIDs
   and orders the same schema differently, so its dump is a diff of hundreds of lines.

## Setting it up again

`pnpm db:test:migrate` → `pnpm db:test:auth-config` → open one Realtime connection (a new project has no
`realtime.messages` partitions until Realtime sees its first client; without them the realtime RLS tests fail) →
`pnpm test:rls` → `pnpm demo:seed`.
