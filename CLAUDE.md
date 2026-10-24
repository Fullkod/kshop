@AGENTS.md

<!-- titan-factory-claude:start -->
# Titan Factory (Claude Code) — Kshop

`AGENTS.md` (importado arriba) contiene las reglas del proyecto comunes a Claude Code y Codex
(stack, arquitectura multi-tenant, reglas de app móvil, módulos, reglas de código). Este bloque
agrega lo propio de Claude Code. Si algo choca, gana la instrucción explícita del usuario, luego
`AGENTS.md`, luego este bloque.

## Memoria compartida con Codex (SIEMPRE ACTIVA)

Claude Code y Codex comparten **una sola** memoria versionada en git:

| Qué | Dónde |
|-----|-------|
| Decisiones, feedback, referencias | `.titan/memory/` (índice: `MEMORY.md`) |
| PRPs / planes de fases | `.titan/plans/` (plantilla: `prp-base.md`) |
| Evidencia de QA (notas, capturas) | `.titan/qa/` |

- Al empezar una tarea relevante, lee `.titan/memory/MEMORY.md` y solo las entradas
  relacionadas (`tf-primer` lo hace al inicio de sesión; `tf-memory-manager` define formato).
- Auto-memory de Claude Code está desactivada en `.claude/settings.json`. NUNCA crees
  `.claude/memory/` ni otra copia de la memoria.
- Puede haber entradas escritas por Codex: trátalas igual. El código actual gana sobre una
  nota vieja; marca lo superado en vez de borrarlo.
- Las tareas de solo lectura no escriben memoria. Nunca guardes credenciales.

## Coexistencia con Titan Factory Codex

| Claude Code | Codex |
|-------------|-------|
| `CLAUDE.md` (+ `@AGENTS.md`) | `AGENTS.md` |
| `.claude/skills/tf-*` | `plugins/titan-factory-codex/skills/tf-*` (marketplace `kshop`) |
| `.claude/agents/tf-*.md` | `.codex/agents/tf-*.toml` |
| `.claude/skills/{supabase,…}` (puentes) | `.agents/skills/` (fuente real, `skills-lock.json`) |
| `.mcp.json` | MCP configurado en cada instalación de Codex |

Los skills tienen el mismo nombre en ambos lados. No edites `plugins/`, `.codex/` ni
`.agents/` salvo que la tarea sea sobre Codex o los skills compartidos. Para actualizar la
fábrica de Claude usa `tf-update-tf` (nunca copies el template encima).

## Qué skill usar en Kshop

```
├── Fase o feature compleja (DB + API + UI)
│       → tf-prp (plan en .titan/plans/) → Roberto aprueba → tf-bucle-agentico
├── Base de datos, RLS, funciones SQL, pg_graphql, pg_net/triggers
│       → tf-supabase + supabase + supabase-postgres-best-practices
│         (migraciones en supabase/; tests de aislamiento entre tiendas obligatorios)
├── Revisar / testear / bug en UI → tf-playwright-cli (evidencia en .titan/qa/)
├── App móvil (Capacitor)        → tf-add-mobile como referencia, respetando las reglas de AGENTS.md
├── Emails / IA / imágenes       → tf-add-emails / tf-ai / tf-image-generation
├── Logo / marca                  → logo-design
├── Automatizaciones / n8n        → tf-n8n-mcp-tools-expert primero, luego tf-n8n-workflow-patterns
├── Manual de usuario             → tf-add-manual
├── "Recuerda…", "en qué quedamos" → tf-memory-manager
├── Contexto del proyecto         → tf-primer
├── Crear/optimizar skills        → tf-skill-creator / tf-autoresearch
├── Tareas del equipo             → tf-tasknic (TASKNIC_API_KEY de este repo, en .env.local)
└── Nada encaja → leer el código, seguir sus patrones y ejecutar
```

**No aplican tal cual:**
- `tf-new-app`: el negocio ya está definido en `.titan/memory/project/` (no rehacer la entrevista).
- `tf-add-login`: la auth de Kshop es multi-tenant (superadmin, staff por tienda, clientes con email
  sintético por tienda); usar el skill solo como referencia.
- `tf-add-payments` (Polar), `tf-easypanel-deploy` (Prisma): cobro manual de suscripciones,
  checkout por WhatsApp, BD Supabase, deploy en Vercel.
- `tf-eject-tf`, `tf-update-tf`: revisar antes de ejecutar; `tf-eject-tf` es DESTRUCTIVO (confirmar siempre).

Integraciones opcionales (Polar, Resend, OpenRouter, n8n…) no reemplazan en silencio lo decidido
(checkout por WhatsApp, avisos por OpenWA de la plataforma, cobro manual).

## Subagentes: solo con permiso

`.claude/agents/` tiene 7 subagentes `tf-*` (backend-specialist, frontend-specialist,
supabase-admin, codebase-analyst, vercel-deployer, gestor-documentacion, validacion-calidad).

1. Se invocan a petición del usuario.
2. Si consideras útil delegar, **pide permiso ANTES**, cada vez. Una aprobación anterior no cubre la siguiente.

## MCPs

`.mcp.json` (versionado, sin secretos) define `supabase`, `next-devtools`, `playwright` y `n8n-mcp`.
`supabase` arranca con `node scripts/supabase-mcp.mjs`, que lee `SUPABASE_ACCESS_TOKEN` y
`SUPABASE_PROJECT_REF` de `.env.local` (git-ignored) y limita el MCP al proyecto Supabase propio de
Kshop (nunca el de klauShop); sin `SUPABASE_PROJECT_REF` no arranca. `n8n-mcp` necesita
`N8N_API_URL`/`N8N_API_KEY` en el entorno. Si un MCP no conecta, trabajar con CLI/código y avisar.
Setup completo: `docs/AGENT_SETUP.md`.
<!-- titan-factory-claude:end -->
