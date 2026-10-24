# Dual-agent tooling: Claude Code and Codex

Date: 2026-10-24 (Phase 0a)

## Decision

Kshop starts with the same dual-agent layout as klauShop and LensSpace, copied from klauShop's tracked
files (Titan Factory Claude toolbox commit `1d92ede`, Codex plugin 0.1.0 — the same version in klauShop,
LensSpace and creatifit-ai on 2026-10-24).

- Memory in `.titan/memory/`, plans in `.titan/plans/`, QA in `.titan/qa/`. `.claude/memory/` must never exist.
- Skills and subagents with the `tf-` prefix, same names in Claude Code and Codex.
- Codex marketplace `kshop` (`titan-factory-codex@kshop`).
- Third-party skills in `.agents/skills/` (`supabase`, `supabase-postgres-best-practices`, `logo-design`),
  locked in `skills-lock.json`; `.claude/skills/` has thin bridges.
- `.mcp.json`: `supabase` via `scripts/supabase-mcp.mjs`, reading `SUPABASE_ACCESS_TOKEN` and
  `SUPABASE_PROJECT_REF` from `.env.local`; it refuses to start without a project ref (never unscoped,
  never klauShop's project). Local servers via `cmd /c npx` (Windows).
- `TASKNIC_API_KEY` of this repo lives in `.env.local` (git-ignored).

## Evidence

- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.claude/`, `.codex/`, `.agents/`, `plugins/`
- `.claude/titan-factory-source.json`
- `docs/AGENT_SETUP.md`

Pending: verify `tf-primer` in Codex (Roberto, from Codex). Supabase project ref not yet created.
