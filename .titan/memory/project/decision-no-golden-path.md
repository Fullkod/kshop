# Decisión: Kshop NO sigue el Golden Path de Titan Factory

**Fecha:** 2026-10-24

Titan Factory se instaló solo como capa de agente (skills, subagentes, memoria). La arquitectura de la app
la fijan las decisiones de producto (ver [decisiones.md](decisiones.md)), no el template.

**Diferencias clave con el Golden Path:**
- Monorepo pnpm + Turborepo (`apps/web`, `packages/{ui,core,data}`, luego apps Capacitor), no app única.
- Sin Server Actions para lógica de negocio: API `/api/v1` con Bearer o RPC (la app móvil las necesita).
- Lecturas por pg_graphql + urql; escrituras críticas en servidor con transacción.
- Sin Polar ni Prisma: suscripciones con cobro manual; checkout por WhatsApp.
- Auth multi-tenant: superadmin, staff por tienda y clientes con email sintético por tienda; sin OAuth para clientes.

**Cómo aplicar:** cuando un skill asuma el Golden Path, adaptar el skill a `AGENTS.md`, no al revés.
`tf-eject-tf` y `tf-update-tf` asumen la estructura del template: revisar lo que tocan antes de ejecutarlos.
