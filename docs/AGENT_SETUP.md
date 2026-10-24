# AI agent setup (Codex + Claude Code)

Kshop keeps the shared AI-agent context in the repository so every contributor starts with
the same instructions, workflows and project memory, whether they use Codex, Claude Code or
both. The toolboxes are an agent layer only: the app follows its own stack (see `AGENTS.md`).
The layout is the same as klauShop and LensSpace (Titan Factory copied from klauShop on 2026-10-24).

## What is versioned

### Shared by both agents

- `AGENTS.md`: project rules (stack, multi-tenant architecture, mobile-app rules, modules,
  code rules). Claude Code imports it from `CLAUDE.md`; `GEMINI.md` imports it too.
- `.titan/memory/`: the single project memory (decisions, feedback, references).
- `.titan/plans/`: phase plans (PRPs, template `prp-base.md`). `.titan/qa/`: QA evidence.
- `.agents/skills/` + `skills-lock.json`: third-party project skills (Supabase,
  Supabase Postgres best practices, logo design).

### Codex

- `plugins/titan-factory-codex/`: the Titan Factory Codex plugin (29 `tf-` skills,
  scripts, references and templates).
- `.agents/plugins/marketplace.json`: the repo marketplace (`kshop`) that exposes the plugin.
- `.codex/config.toml`: enables the repo plugin once the project is trusted.
- `.codex/agents/`: the seven `tf-` roles.

### Claude Code

- `CLAUDE.md`: imports `AGENTS.md` and adds the Claude-specific Titan Factory rules.
- `.claude/skills/tf-*`: the 29 Titan Factory skills (same names as Codex).
- `.claude/skills/{supabase,supabase-postgres-best-practices,logo-design}`: thin bridges
  that point Claude Code to the real skills in `.agents/skills/` (no duplication).
- `.claude/agents/tf-*.md`: the seven subagents (used only with user permission).
- `.claude/design-systems/`: optional design-system references.
- `.claude/settings.json`: disables Claude Code auto-memory so memory lives in `.titan/`.
- `.claude/titan-factory-source.json`: upstream commit and hashes of the synced toolbox.
- `.mcp.json`: project MCP servers (`supabase`, `next-devtools`, `playwright`, `n8n-mcp`)
  with no secrets.

### Never versioned

OAuth tokens, Supabase access tokens, API keys (including `TASKNIC_API_KEY`), `.env`,
`.env*.local`, `.claude/settings.local.json`, `CLAUDE.local.md`, plugin caches and personal
agent settings stay on each machine.

## Local secrets

Copy `.env.example` to `.env.local` and fill in:

```
TASKNIC_API_KEY=tk_...        # this repo's own Tasknic key
SUPABASE_ACCESS_TOKEN=sbp_... # Supabase Dashboard -> Account -> Access Tokens
SUPABASE_PROJECT_REF=...      # Kshop's own Supabase project (never klauShop's)
```

## First use with Codex

1. Clone the repository and open its root as a trusted project in Codex.
2. Restart Codex after the clone so it discovers the project skills and the repo marketplace.
3. If the Titan Factory plugin is not visible, register the repo marketplace:

   ```powershell
   codex plugin marketplace add .
   ```

4. Install the plugin from that marketplace if Codex has not restored it automatically:

   ```powershell
   codex plugin add titan-factory-codex@kshop
   ```

5. Add the hosted Supabase MCP server to your Codex installation and log in through the
   browser (OAuth, no personal access token), using Kshop's project ref:

   ```powershell
   codex mcp add supabase --url "https://mcp.supabase.com/mcp?project_ref=<KSHOP_PROJECT_REF>"
   codex mcp login supabase
   ```

6. Run `tf-primer` to load project context and the shared memory.

## First use with Claude Code

1. Clone the repository and open its root in Claude Code. `CLAUDE.md`, the skills,
   subagents and `.claude/settings.json` load automatically.
2. Approve the project MCP servers from `.mcp.json` when asked. The `supabase` server runs
   `node scripts/supabase-mcp.mjs`, which starts `@supabase/mcp-server-supabase` scoped to
   `SUPABASE_PROJECT_REF` with the token from `.env.local`. Without a project ref it refuses
   to start (it never runs unscoped). Reload VS Code / restart Claude Code after changing it.
3. `n8n-mcp` (optional) reads `N8N_API_URL` and `N8N_API_KEY` from your environment.
4. The local servers in `.mcp.json` launch through `cmd /c npx` because native Windows
   cannot spawn `npx` directly. On macOS/Linux, override them with local-scope entries of
   the same name:

   ```bash
   claude mcp add --scope local playwright -- npx @playwright/mcp@latest
   claude mcp add --scope local next-devtools -- npx -y next-devtools-mcp@latest
   claude mcp add --scope local n8n-mcp -e MCP_MODE=stdio -- npx n8n-mcp
   ```

5. Run `/tf-primer` to load project context and the shared memory.

## Common steps

1. Verify the project skills: `npx skills list`.
2. If a third-party skill directory is missing, restore the locked skills:
   `npx skills experimental_install`.

## Updating the toolboxes

- **Third-party skills** (shared): `npx skills update --project --yes`, then review the diff,
  especially third-party scripts and assets. The Claude bridges need no change.
- **Titan Factory Codex**: use the plugin's own lifecycle scripts
  (`plugins/titan-factory-codex/scripts/titan.py`).
- **Titan Factory Claude Code**: ask Claude for `/tf-update-tf`, or run the sync script with
  the path to your local `titan-factory` repository:

  ```powershell
  python .claude/skills/tf-update-tf/scripts/sync_titan_factory.py --source "<path>\titan-factory"
  python .claude/skills/tf-update-tf/scripts/sync_titan_factory.py --source "<path>\titan-factory" --apply
  ```

  It previews by default, re-applies the `tf-` prefix and the `.titan/` memory paths, never
  deletes project-only skills, never overwrites hand-adapted skills (`tf-memory-manager`,
  `tf-primer`, `tf-eject-tf`, `tf-update-tf`) and never touches `.titan/`.

Neither update path may remove or rewrite `.titan/memory/`. After any update, scan new assets
for secrets, binaries included (see `.titan/memory/feedback/secretos-en-assets-titan-factory.md`).
