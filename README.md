# Kshop

Multi-store e-commerce SaaS by Fullkod: each store gets its own subdomain
(`{slug}.kshop.fullkod.com`) or custom domain, catalog, customers, currencies and admin panel.

Status: Phase 0b done — monorepo, platform schema with RLS and cross-store isolation tests, store
resolution by host, superadmin (create/suspend stores and owners) and a minimal store admin driven by
the module registry.

## Quick start

```bash
pnpm install
cp .env.example .env.local   # fill in the Supabase values (repo root)
pnpm dev                     # http://kshop.localhost:3000 and http://{slug}.kshop.localhost:3000
```

`*.localhost` resolves to 127.0.0.1 in Chrome, Edge and Firefox without editing `hosts`.

## Layout

| Path | What |
|------|------|
| `apps/web` | Next.js 16: platform (`/`, `/superadmin`), stores (`proxy.ts` rewrites `{slug}.host` to `/s/{slug}`), API `/api/v1` (Bearer) |
| `packages/core` | Zod schemas, host parsing, slugs, roles, module codes (no Next.js) |
| `packages/data` | Supabase clients, urql client for pg_graphql + codegen, typed `/api/v1` client |
| `packages/ui` | Brand tokens (Tailwind v4) and base components |
| `supabase/` | Migrations, RLS isolation tests, Auth config |
| `scripts/` | `db.mjs` (migrations/tests via Management API), `create-superadmin.mjs`, `e2e.mjs`, `supabase-mcp.mjs` |

Commands: see "Comandos" in [AGENTS.md](AGENTS.md).

- Project rules: [AGENTS.md](AGENTS.md)
- Agent setup: [docs/AGENT_SETUP.md](docs/AGENT_SETUP.md)
- Decisions and design: [.titan/memory/MEMORY.md](.titan/memory/MEMORY.md)
- Phases: [.titan/plans/arranque-y-fases.md](.titan/plans/arranque-y-fases.md)
