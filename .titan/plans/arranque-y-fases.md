> Sembrado el 2026-10-24 desde `_materiales/kshop/09-arranque-repo.md`. Las referencias "ver 0X" apuntan a las
> entradas hermanas de `project/` (ver índice en `MEMORY.md`). Desde ahora la memoria viva es esta.

# Arranque del repo `kshop`

> Para el agente (Claude Code / Codex) que trabaje en `C:\Local-Disc-D\Project\Fullkod\kshop`
> (carpeta y repo de GitHub ya renombrados desde `fullshop`; el repo está vacío).
> Las decisiones de producto se toman en esta carpeta de materiales; el repo las implementa.
> Si algo de aquí choca con lo que se vaya decidiendo después, gana lo más reciente en `01-decisiones.md`.

## Paso 0 (obligatorio, antes de escribir código): Titan Factory para Claude Code **y** Codex
El repo debe quedar con **las dos fábricas listas y funcionando**, igual que klauShop y LensSpace
(layout dual: ver `klauShop/.titan/memory/project/2026-10-02-dual-agent-tooling.md` y `klauShop/docs/AGENT_SETUP.md`).

| Pieza | Claude Code | Codex |
|-------|-------------|-------|
| Reglas del proyecto | `CLAUDE.md` (importa `@AGENTS.md` + bloque propio de Claude) | `AGENTS.md` (fuente común) |
| Skills `tf-*` (mismos nombres) | `.claude/skills/tf-*` | `plugins/titan-factory-codex/skills/tf-*` (marketplace `kshop`: `titan-factory-codex@kshop`) |
| Subagentes | `.claude/agents/tf-*.md` | `.codex/agents/tf-*.toml` + `.codex/config.toml` |
| Skills de terceros | puentes en `.claude/skills/{supabase,supabase-postgres-best-practices,logo-design}` | fuente real en `.agents/skills/` + `skills-lock.json` |
| MCP | `.mcp.json` (supabase vía script con token de `.env.local` limitado al proyecto nuevo, next-devtools, playwright, n8n-mcp) | configurado en cada instalación de Codex |
| Ajustes | `.claude/settings.json` con `"autoMemoryEnabled": false` | — |
| Memoria compartida | `.titan/memory/` (`MEMORY.md` + `user/`, `feedback/`, `project/`, `reference/`), `.titan/plans/` (`prp-base.md`), `.titan/qa/` | la misma |
| Docs | `docs/AGENT_SETUP.md` (setup de ambos agentes) | el mismo |

Criterios de "listo" (verificar en ambos agentes):
- `/tf-primer` funciona en Claude Code y `tf-primer` en Codex: sincroniza git, carga `.titan/memory/MEMORY.md`,
  lee `AGENTS.md`, mapea BD (o avisa si el MCP no conecta) y entrega el resumen.
- `tf-prp`, `tf-bucle-agentico`, `tf-memory-manager`, `tf-supabase`, `tf-playwright-cli` y `tf-tasknic` disponibles en ambos.
- `AGENTS.md` describe el stack **real** de Kshop (monorepo, pg_graphql + RLS, multi-tenant, módulos,
  reglas de app móvil) y en qué se aparta del Golden Path de Titan Factory (sin Polar/Prisma, pago manual,
  checkout WhatsApp), para que ningún skill "migre" el proyecto a su plantilla.
- `.titan/memory/` sembrada con estos materiales (decisiones → `project/`, el equipo → `user/`) y su índice.
- Origen de la copia registrado (`.claude/titan-factory-source.json`, como en klauShop). Para actualizar
  después: `tf-update-tf`, nunca copiar el template encima.
- Sin secretos versionados (`.env.local` en `.gitignore`; `.mcp.json` sin tokens). `TASKNIC_API_KEY` propia de este repo.
- Primer commit: solo la fábrica + `AGENTS.md`/`CLAUDE.md` + memoria (sin código de app).

## Cómo se trabaja
1. Antes de cada fase, leer `01-decisiones.md` y los documentos de la fase.
2. Al crear el repo, copiar estos materiales a `.titan/memory/` (decisiones como entradas `project/`)
   y cada fase como PRP en `.titan/plans/`. Desde entonces la memoria viva es la del repo; esta carpeta
   queda como origen y para lo que se siga hablando fuera (marca, negocio).
3. Una fase = un PRP aprobado por Roberto → implementación → verificación (typecheck, lint, tests,
   tests de RLS, prueba en navegador) → commit.
4. Nada de push, deploy ni cambios en servicios externos (Supabase, Vercel, GitHub) sin permiso explícito.

## Convenciones
- Código, identificadores, comentarios, commits y nombres de archivo en **inglés**; UI en **español**
  (preparado para traducir más adelante, pero sin i18n en el MVP).
- Prefijo de paquetes `@kshop/*`; appId de las apps `com.fullkod.kshop.<slug>` (tienda) y
  `com.fullkod.kshop.admin`.
- Reglas de arquitectura de `07-app-movil.md` desde el primer commit: sin lógica de negocio en Server
  Actions, API `/api/v1` con Bearer, auth por token, código compartido sin `next/*`.
- `store_id` en toda tabla de tienda; RLS en todas las tablas + tests de aislamiento entre tiendas.
- Módulos con registro central y comprobación en UI, API y BD (`08-modulos-y-planes.md`).
- Validación con Zod en toda entrada; operaciones de stock/órdenes en transacción con `for update`.
- Sin `any` nuevo; secretos nunca en código ni en memoria.

## Stack (propuesto aquí; el confirmado en la Fase 0b está en `AGENTS.md`: SQL a mano, sin Drizzle; Next 16 con Cache Components desde la Fase 2)
Monorepo (pnpm + Turborepo): `apps/web` (Next.js App Router, última estable), `packages/{ui,core,data}`,
`supabase/` (esquema, migraciones, RLS, funciones, tests). Supabase (Postgres + Auth + Storage +
pg_graphql), urql + graphql-codegen para lecturas, Drizzle o SQL para esquema y escrituras transaccionales,
Tailwind + shadcn/ui, Vercel. Apps Capacitor (`apps/store-app`, `apps/admin-app`) se añaden en su fase.
Proyecto Supabase **nuevo y propio** (nunca el de klauShop), con entorno de desarrollo separado de producción.

## Estado (actualizado 2026-10-28)
| Fase | Estado | PRP / memoria | Último commit |
|------|--------|---------------|---------------|
| 0a. Fábrica | Hecha | `project/2026-10-24-dual-agent-tooling.md` | — |
| 0b. Cimientos | Hecha | `prp-fase-0b-cimientos.md` | `9fcd43f` |
| 1. Catálogo | Hecha (incluye imágenes por URL en Excel y prueba de 1 000 filas) | `prp-fase-1-catalogo.md` | `0684e23` |
| 2. Tienda pública | Hecha. Lighthouse en Vercel: portada 97–98, ficha 89–93, listado 76–90 tras el deploy (CLS 0; queda el LCP de la imagen) | `prp-fase-2-tienda-publica.md` | `f1b50e0` |
| 3. Clientes y compra | Hecha (avisos automáticos por OpenWA en la Fase 4) | `prp-fase-3-clientes-y-compra.md` | ver PRP |
| 4. Avisos y descuentos | Hecha; **pendiente** probar con la instancia OpenWA real (hoy en modo simulado) | `prp-fase-4-avisos-y-descuentos.md` | ver PRP |
| 5. Suscripciones y módulos | Hecha; **pendiente** poner a cero el contador de facturas antes de la primera real y configurar el WhatsApp de soporte | `prp-fase-5-suscripciones-y-modulos.md` | ver PRP |
| 6. Pro | Hecha (almacenes, monedas, finanzas, dominio propio). **Pendiente**: token de elTOQUE, probar Vercel con un dominio real (con permiso) y Vercel Pro antes de vender dominios | `prp-fase-6-pro.md` | ver PRP |
| 7. Apps | Hecha: app de tienda por slug y Kshop Admin (Capacitor), APK firmados en GitHub Actions, `/app` de la tienda, Admin › App móvil, Superadmin › Apps. **Pendiente**: Roberto publica las versiones probadas; Google Play e iOS más adelante | `prp-fase-7-apps.md`, `docs/APPS.md` | ver PRP |
| v2. Rediseño (R0–R7) | Hecha. **Pendiente**: recompilar las APK (con permiso) y probar en móvil real realtime y favoritos tras «sin conexión»; Lighthouse móvil de la landing 87 (objetivo 90, limitación de todo el sitio) | `prp-rediseno-v2.md`, `project/2026-10-27-rediseno-v2.md` | `0c71388`, `f6aa223` |
| R8. Superadmin v2 + Realtime | Hecha, pendiente de la revisión de Roberto | `prp-r8-superadmin-y-realtime.md`, `project/pendiente-realtime.md` | `da1a97d`, `eecd58f` |
| R9. Lecturas de la tienda | Hecha, pendiente de la revisión de Roberto: portada en 2 tandas, carruseles por índice, conteos de lo mostrado, refresco en segundo plano tras un pedido; sidebars con arriba y abajo fijos | `prp-r9-lecturas-tienda.md`, `project/lecturas-tienda-r9.md` | `8be1278` |
| R10. Deuda de lecturas | Hecha (aprobada por Roberto el 2026-10-27): RLS del catálogo con subplan hash (777 variantes 16–101 ms → 3,9 ms), facetas en una pasada (267 → 36 ms), `hasModule` cacheado por tienda | `prp-r10-deuda-lecturas.md`, `project/lecturas-tienda-r9.md` | ver PRP |
| R11. Rendimiento del admin | Hecha 2026-10-28: todo se lee por funciones SQL (`admin_*`, `sf_*`), pg_graphql quitado de producción, proyecto de prueba «KShop Test»; admin mediana 1,05 s. **Pendiente**: 24 h de logs y la tabla «Pendiente tras R11» del PRP | `prp-r11-rendimiento-admin.md`, `project/2026-10-28-diagnostico-rendimiento.md` | `634a742` |
| R12. Superadmin v3 | Hecha 2026-10-28: secciones del menú por tienda (Visible / Gestionado por admin / Oculto, 403 en la API), lista de tiendas v3, «Menú de la tienda». Migración en producción; subido a `main` por Roberto. **Pendiente**: enlace de entrada de un solo uso | `prp-r12-superadmin-v3.md`, `project/2026-10-28-r12-superadmin-v3.md` | `d487b17` |
| R13. Formularios en diálogo | Hecha 2026-10-28: `Dialog` de `@kshop/ui`, 17 pantallas; subido a `main` por Roberto | `prp-r13-formularios-en-dialogo.md`, `project/2026-10-28-admin-formularios-en-dialogo.md` | `4d30e09` |
| R14. Confirmaciones en diálogo | Hecha 2026-10-29: `useConfirm()` de `@kshop/ui` (sin `window.confirm`/`prompt`, regla `no-alert`), confirmación nueva en borrados que no preguntaban, suspender tienda y quitar regalo/suelto; cancelar pedido y acciones de factura en diálogo; subido a `main` por Roberto | `prp-r14-confirmaciones-en-dialogo.md` | ver PRP |
| POS sin conexión | Fases 1 (cobro en varias monedas, KSH0002) y 2 (módulo y servidor) en producción; 3, 4, 5 y 6 hechas en local 2026-10-31, sin Android real; falta la 7 | `prp-pos-offline.md`, `project/2026-10-30-donde-quedamos.md` | `f133ef2` |
| 8. Migrar klauShop | 8.1–8.5 hechas 2026-10-28 (tienda `klau`; `klaushop:verify` 21/22, el único «not ok» son los avisos del incidente documentado). **Pendiente**: 8.6 (QA en navegador y medición) y 8.7 (corte, con permiso de Roberto) | `prp-fase-8-klaushop.md` | ver PRP |

El remoto `origin` (`Fullkod/kshop`) se sube solo con permiso de Roberto. Al 2026-10-30 llega hasta el cierre de las fases 1 y 2 del POS.

## Fases (cada una se detalla en su PRP)
| Fase | Alcance | Verificación |
|------|---------|--------------|
| 0a. Fábrica | Titan Factory Claude Code + Codex, memoria `.titan/` sembrada (ver "Paso 0") | `tf-primer` OK en Claude Code y en Codex |
| 0b. Cimientos | Monorepo, Supabase nuevo, tablas de plataforma (`stores`, `store_domains`, `store_members`, `modules`, `plans`…), resolución de tienda por host, superadmin (login + crear tienda + dueño), registro de módulos, tests de RLS | Crear 2 tiendas desde el superadmin y entrar a cada una por su subdominio en local; tests de aislamiento en verde |
| 1. Catálogo | Tipos, atributos, variantes, precios/costos, monedas, categorías, colecciones, marcas, medias, almacenes/stocks; admin de catálogo; importar/exportar Excel | Crear y importar productos con variantes; costo invisible en lectura pública |
| 2. Tienda pública | Home por secciones, listados con filtros, ficha, búsqueda, menús, páginas, temas | Lighthouse y navegación en móvil; lecturas cacheadas por tienda |
| 3. Clientes y compra | Cuentas por tienda (email sintético + recuperación por WhatsApp), carrito, checkout WhatsApp, entregas, órdenes, reservas, estados, pagos | Flujo completo de compra y cambio de estados; aislamiento de cuentas entre tiendas |
| 4. Avisos y descuentos | WhatsApp de plataforma (plantillas, log), promociones y cupones | Avisos llegan; descuentos se reflejan en la orden |
| 5. Suscripciones y módulos | Planes Base/Pro, add-ons, grants, facturas manuales, límites, suspensión | Bajar/subir de plan activa/desactiva funciones sin perder datos |
| 6. Pro | Finanzas, multi-almacén, multimoneda, dominio propio | Informes por moneda cuadran con las órdenes |
| 7. Apps | Capacitor tienda + admin, build por tienda | APK instalable de una tienda de prueba |
| v2. Rediseño | Diseño v2 (`docs/design-v2/`): tokens y 6 temas, tienda, ficha, portada de 13 secciones, admin, Kshop Admin y landing (PRP `prp-rediseno-v2.md`, HECHO 2026-10-27) | Capturas 1280/390 por fase; QA, RLS y build en verde |
| 8. Migrar klauShop | Datos de klauShop como tienda nº 1 | Comparativa de productos/órdenes; cambio de dominio con permiso |

## Lo que aún no bloquea pero hay que decidir en su fase
Delegación DNS de `kshop.fullkod.com` a Vercel (antes de Fase 0b en producción; en local se usa `*.localhost`), proveedor de
email, límite de productos por plan, precios, logo y paleta (antes de la Fase 2 para los temas por defecto).
