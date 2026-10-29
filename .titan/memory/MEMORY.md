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
- [lecturas-graphql-y-rls.md](project/lecturas-graphql-y-rls.md) — pg_graphql vs Drizzle, qué da velocidad, reglas de RLS y tests de aislamiento (lecturas superadas en R11: funciones SQL; RLS vigente)
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
- [2026-10-27-rediseno-v2.md](project/2026-10-27-rediseno-v2.md) — Rediseño v2 hecho (R0–R9): decisiones de Roberto, tienda sin hex, landing con datos de planes, dónde está cada pieza, pendientes y **dónde quedamos** (pausa 2026-10-27)
- [pendiente-realtime.md](project/pendiente-realtime.md) — Realtime con señales sin datos (hecho 2026-10-27): temas, dónde está y cómo añadir una pantalla
- [lecturas-tienda-r9.md](project/lecturas-tienda-r9.md) — Por qué la Nano se hundía (demasiadas consultas en serie, recorridos del catálogo, tienda en frío tras cada pedido), qué se cambió en R9 y la deuda resuelta en R10 (RLS con subplan hash, facetas en una pasada, entitlements cacheados)
- [2026-10-28-diagnostico-rendimiento.md](project/2026-10-28-diagnostico-rendimiento.md) — Auditoría del admin lento y los 57014: no es volumen; peaje de esquema de pg_graphql por conexión + ráfagas del desarrollo + admin frágil + bug login/set-password; reglas operativas (nada de e2e/qa/imports/build con la web en uso), decisiones D1–D5 cerradas, WhatsApp en «Simulado» durante R11; **todo se lee por funciones SQL (`admin_*`, `sf_*`); pg_graphql quitado de producción** (decisión de Roberto, 2026-10-28); proyecto de prueba «KShop Test»
- [2026-10-28-admin-formularios-en-dialogo.md](project/2026-10-28-admin-formularios-en-dialogo.md) — Crear/editar del admin en diálogo (cortos) o página (producto, pedido); hoja en móvil; falta `Dialog` en `@kshop/ui`; PRP R13 pendiente
- [tienda-demo.md](project/tienda-demo.md) — Tienda de pruebas permanente «Tienda Demo» (demo.kshop), plan Pro, dueño y empleado; credenciales en Tasknic y .env.local

## feedback/ — Correcciones y preferencias

- [secretos-en-assets-titan-factory.md](feedback/secretos-en-assets-titan-factory.md) — Imágenes pueden llevar API keys en metadatos; escanear binarios antes de push (heredado de klauShop)

## reference/ — Dónde encontrar cosas

- [trucos-entorno-y-next.md](reference/trucos-entorno-y-next.md) — Cache Components, pg_graphql y trucos del entorno de Roberto (puertos, *.localhost, Playwright, Lighthouse)
- [fuentes.md](reference/fuentes.md) — Rutas de materiales, klauShop, dcabellos, apululu y Saleor, y para qué sirve cada uno
- [Correo de Fullkod](reference/correo-fullkod-resend.md) — @fullkod.com va por Resend (contact@, support@), sin reenvío; cada proyecto decide cómo avisar de sus formularios; Kshop envía por Resend los enlaces de acceso del personal (noreply@)

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
- `prp-r8-superadmin-y-realtime.md` — R8: panel del superadmin v2, Realtime y arreglo del build de Vercel (HECHO 2026-10-27)
- `prp-r9-lecturas-tienda.md` — R9: lecturas de la tienda sin recorrer el catálogo (portada en 2 tandas, carruseles por índice, conteos de lo mostrado, refresco en segundo plano tras un pedido) (HECHO 2026-10-27)
- `prp-r10-deuda-lecturas.md` — R10: deuda medida en R9 (RLS sin función por fila, facetas en una pasada, `hasModule` cacheado) (HECHO 2026-10-27, aprobado por Roberto)
- `prp-fase-8-klaushop.md` — Fase 8: migrar klauShop como tienda `klaushop` (export read-only → snapshot → import por lotes reanudable → verify → corte), en la Nano; decisiones D1–D12 y 6 preguntas abiertas (PENDIENTE, 2026-10-27)
- `prp-r11-rendimiento-admin.md` — R11: admin lento y 57014 según el informe de diagnóstico (`.titan/qa/r11-rendimiento-admin/`): bug login/set-password, sesión estable + timeouts/reintento único, arranque plano por `/api/v1/me?storeId=` (`admin_bootstrap`), `getClaims` + `api_guard`, proxy sin RPC de dominio, G10/cron/tests condicionales; D1–D6 cerradas: proyecto de prueba «KShop Test» (Docker retirado), cron solo promociones, getClaims sí, G13 hecho y G14 descartado, todo a funciones SQL y pg_graphql quitado, pagar tras medir. **HECHO** 2026-10-28 (admin mediana 1,05 s, p95 2,2 s, 0 errores); falta la Fase 7 (24 h de logs) y lo de «Pendiente tras R11»
- `prp-r12-superadmin-v3.md` — R12: visibilidad del menú de cada tienda (Visible / Gestionado / Oculto) con bloqueo de escrituras en `assertStoreWritable`, tabla `store_section_settings`, lista de tiendas v3 (`platform_stores_overview`, búsqueda, filtros, acciones) y accesos directos en la ficha; D1–D10; preguntas respondidas: básicas siempre visibles, texto «Gestionado por admin», todas las columnas (2026-10-28, falta el «adelante»)
