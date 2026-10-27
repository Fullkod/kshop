# Memoria del Proyecto — Índice

> Archivos organizados por carpeta (tipo). Máx 200 líneas.
> Gestionado por skill tf-memory-manager. Compartida por Claude Code y Codex. Auto-memory de Claude Code DESACTIVADO.

## user/ — Sobre el usuario/equipo

- [equipo.md](user/equipo.md) — Fullkod, Roberto decide producto, idioma (español), commits en inglés, sin push/deploy sin permiso

## project/ — Proyectos y decisiones activas

- [identidad-kshop.md](project/identidad-kshop.md) — Nombre, dominio kshop.fullkod.com, qué es, índice de los documentos de diseño
- [decisiones.md](project/decisiones.md) — Decisiones tomadas (0–24, hasta 2026-10-25), recomendaciones confirmadas y preguntas abiertas. LEER ANTES DE CADA FASE
- [2026-10-24-estudio-klaushop-vs-dcabellos.md](project/2026-10-24-estudio-klaushop-vs-dcabellos.md) — Qué se adopta de cada uno y qué no
- [modelo-de-datos.md](project/modelo-de-datos.md) — Esquema v0: plataforma, clientes, catálogo Saleor, monedas, carrito, órdenes, descuentos, temas, entregas, WhatsApp, Excel
- [tenancy-dominios-auth.md](project/tenancy-dominios-auth.md) — Tienda por host, wildcard Vercel, email sintético por tienda, alta de tienda, storage
- [lecturas-graphql-y-rls.md](project/lecturas-graphql-y-rls.md) — pg_graphql vs Drizzle, qué da velocidad, reglas de RLS y tests de aislamiento
- [suscripciones.md](project/suscripciones.md) — Planes, trials, grants (fundador, cortesía), facturas manuales, suspensión
- [app-movil.md](project/app-movil.md) — Capacitor tienda + admin; reglas 1–5 desde el día 1; distribución (Play, APK, Apklis) y riesgos
- [modulos-y-planes.md](project/modulos-y-planes.md) — Base/Pro + add-ons, entitlements en 3 capas, multi-almacén, módulo Finanzas
- [decision-no-golden-path.md](project/decision-no-golden-path.md) — 2026-10-24: TF solo como capa de agente; en qué se aparta Kshop del template
- [2026-10-24-dual-agent-tooling.md](project/2026-10-24-dual-agent-tooling.md) — Fase 0a: Claude Code + Codex copiados de klauShop, marketplace kshop, MCP Supabase con project ref propio
- [2026-10-24-fase-0b-cimientos.md](project/2026-10-24-fase-0b-cimientos.md) — Fase 0b cerrada: D1–D7 confirmadas, Supabase online sin permiso por migración, trucos (introspección, urql POST, versiones de migración), cuentas
- [2026-10-25-fase-1-catalogo.md](project/2026-10-25-fase-1-catalogo.md) — Fase 1 CERRADA: dónde está cada pieza del catálogo, pruebas y datos de la Tienda Demo
- [2026-10-25-fase-2-tienda-publica.md](project/2026-10-25-fase-2-tienda-publica.md) — Fase 2 hecha (Lighthouse en Vercel medido; listado CLS 0, falta LCP): decisiones (URLs en inglés, Cache Components, WhatsApp), dónde está cada pieza, invalidación
- [2026-10-25-fase-3-clientes-y-compra.md](project/2026-10-25-fase-3-clientes-y-compra.md) — Fase 3 hecha: dónde está cada pieza, pruebas, pendientes
- [2026-10-25-fase-4-avisos-y-descuentos.md](project/2026-10-25-fase-4-avisos-y-descuentos.md) — Fase 4 hecha: motor de precios SQL, promociones, cupones y avisos WhatsApp (dry_run; falta OpenWA real)
- [2026-10-25-estudio-precios-cuba.md](project/2026-10-25-estudio-precios-cuba.md) — Precios en USD para Cuba (Base 5, Pro 12, sueltos 2–3, prueba 30 días, fundadores); competencia Plaza Cubana; cobro en efectivo
- [2026-10-25-fase-5-suscripciones-y-modulos.md](project/2026-10-25-fase-5-suscripciones-y-modulos.md) — Fase 5 hecha: precios USD, cupones y apariencia fuera del Base, dónde está cada pieza, pendientes
- [2026-10-26-fase-6-pro.md](project/2026-10-26-fase-6-pro.md) — Fase 6 hecha: decisiones de Roberto, dónde está cada pieza, pendientes de Roberto (elTOQUE, Vercel real)
- [2026-10-27-fase-7-apps.md](project/2026-10-27-fase-7-apps.md) — Fase 7 hecha: apps Capacitor (tienda por slug + Kshop Admin), GitHub Actions, claves de firma, `/app`, pendientes
- [2026-10-27-rediseno-v2.md](project/2026-10-27-rediseno-v2.md) — Rediseño v2 hecho (R0–R7): decisiones de Roberto, tienda sin hex, landing con datos de planes, dónde está cada pieza, pendientes
- [tienda-demo.md](project/tienda-demo.md) — Tienda de pruebas permanente «Tienda Demo» (demo.kshop), plan Pro, dueño y empleado; credenciales en Tasknic y .env.local

## feedback/ — Correcciones y preferencias

- [secretos-en-assets-titan-factory.md](feedback/secretos-en-assets-titan-factory.md) — Imágenes pueden llevar API keys en metadatos; escanear binarios antes de push (heredado de klauShop)

## reference/ — Dónde encontrar cosas

- [trucos-entorno-y-next.md](reference/trucos-entorno-y-next.md) — Cache Components, pg_graphql y trucos del entorno de Roberto (puertos, *.localhost, Playwright, Lighthouse)
- [fuentes.md](reference/fuentes.md) — Rutas de materiales, klauShop, dcabellos, apululu y Saleor, y para qué sirve cada uno

## Planes (`.titan/plans/`)

- `arranque-y-fases.md` — Paso 0, convenciones, fases 0a–8 y tabla de estado (0a, 0b, 1 y 2 hechas; Fase 3 en curso)
- `prp-base.md` — Plantilla de PRP
- `prp-fase-0b-cimientos.md` — Fase 0b: monorepo, esquema de plataforma + RLS + tests A/B, host → tienda, superadmin (COMPLETADO 2026-10-24, commit 9fcd43f)
- `prp-fase-1-catalogo.md` — Fase 1: catálogo (tipos, atributos, variantes, costo privado, monedas, categorías, colecciones, marcas, medias, almacenes/stock, Excel) (COMPLETADO 2026-10-25, commits hasta d6f1507)
- `prp-fase-2-tienda-publica.md` — Fase 2: tienda pública (COMPLETADO 2026-10-25; Lighthouse en Vercel en el PRP)
- `prp-fase-3-clientes-y-compra.md` — Fase 3: clientes y compra (COMPLETADO)
- `prp-fase-4-avisos-y-descuentos.md` — Fase 4: promociones, cupones y avisos WhatsApp de plataforma (COMPLETADO salvo OpenWA real)
- `prp-fase-5-suscripciones-y-modulos.md` — Fase 5: planes, add-ons, grants, facturas manuales, límites, equipo, suspensión (HECHA)
- `prp-fase-6-pro.md` — Fase 6: Finanzas, multi-almacén, multimoneda, dominio propio (HECHA)
- `prp-fase-7-apps.md` — Fase 7: app de tienda y Kshop Admin con Capacitor (HECHA; cómo generar un APK en `docs/APPS.md`)
- `prp-rediseno-v2.md` — Rediseño v2 (R0–R7: tokens, tienda, ficha, portada, admin, Kshop Admin, landing) (HECHO 2026-10-27)
