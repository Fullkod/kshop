# Memoria del Proyecto — Índice

> Archivos organizados por carpeta (tipo). Máx 200 líneas.
> Gestionado por skill tf-memory-manager. Compartida por Claude Code y Codex. Auto-memory de Claude Code DESACTIVADO.

## user/ — Sobre el usuario/equipo

- [equipo.md](user/equipo.md) — Fullkod, Roberto decide producto, idioma (español), commits en inglés, sin push/deploy sin permiso

## project/ — Proyectos y decisiones activas

- [identidad-kshop.md](project/identidad-kshop.md) — Nombre, dominio kshop.fullkod.com, qué es, índice de los documentos de diseño
- [decisiones.md](project/decisiones.md) — 2026-10-24: decisiones tomadas (0–20), recomendaciones pendientes y preguntas abiertas. LEER ANTES DE CADA FASE
- [2026-10-24-estudio-klaushop-vs-dcabellos.md](project/2026-10-24-estudio-klaushop-vs-dcabellos.md) — Qué se adopta de cada uno y qué no
- [modelo-de-datos.md](project/modelo-de-datos.md) — Esquema v0: plataforma, clientes, catálogo Saleor, monedas, carrito, órdenes, descuentos, temas, entregas, WhatsApp, Excel
- [tenancy-dominios-auth.md](project/tenancy-dominios-auth.md) — Tienda por host, wildcard Vercel, email sintético por tienda, alta de tienda, storage
- [lecturas-graphql-y-rls.md](project/lecturas-graphql-y-rls.md) — pg_graphql vs Drizzle, qué da velocidad, reglas de RLS y tests de aislamiento
- [suscripciones.md](project/suscripciones.md) — Planes, trials, grants (fundador, cortesía), facturas manuales, suspensión
- [app-movil.md](project/app-movil.md) — Capacitor tienda + admin; reglas 1–5 desde el día 1; distribución (Play, APK, Apklis) y riesgos
- [modulos-y-planes.md](project/modulos-y-planes.md) — Base/Pro + add-ons, entitlements en 3 capas, multi-almacén, módulo Finanzas
- [decision-no-golden-path.md](project/decision-no-golden-path.md) — 2026-10-24: TF solo como capa de agente; en qué se aparta Kshop del template
- [2026-10-24-dual-agent-tooling.md](project/2026-10-24-dual-agent-tooling.md) — Fase 0a: Claude Code + Codex copiados de klauShop, marketplace kshop, MCP Supabase con project ref propio

## feedback/ — Correcciones y preferencias

- [secretos-en-assets-titan-factory.md](feedback/secretos-en-assets-titan-factory.md) — Imágenes pueden llevar API keys en metadatos; escanear binarios antes de push (heredado de klauShop)

## reference/ — Dónde encontrar cosas

- [fuentes.md](reference/fuentes.md) — Rutas de materiales, klauShop, dcabellos, apululu y Saleor, y para qué sirve cada uno

## Planes (`.titan/plans/`)

- `arranque-y-fases.md` — Paso 0, convenciones y fases 0a–8 (cada fase → su PRP)
- `prp-base.md` — Plantilla de PRP
