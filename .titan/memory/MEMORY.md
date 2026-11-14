# Memoria del Proyecto — Índice

> Archivos organizados por carpeta (tipo). Máx 200 líneas.
> Gestionado por skill tf-memory-manager. Compartida por Claude Code y Codex. Auto-memory de Claude Code DESACTIVADO.

## user/ — Sobre el usuario/equipo

- [equipo.md](user/equipo.md) — Fullkod, Roberto decide producto, idioma (español), commits en inglés, sin push/deploy sin permiso

## project/ — Proyectos y decisiones activas

- [identidad-kshop.md](project/identidad-kshop.md) — Nombre, dominio kshop.fullkod.com, qué es, índice de los documentos de diseño
- [decisiones.md](project/decisiones.md) — Decisiones tomadas (0–24, hasta 2026-10-25; 25–30 del 2026-10-31/11-01; 31–32 del 2026-11-08: puesta en marcha 5 USD, prueba de 15 días, servicio de inventario), recomendaciones confirmadas y preguntas abiertas. LEER ANTES DE CADA FASE
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
- [2026-10-28-admin-formularios-en-dialogo.md](project/2026-10-28-admin-formularios-en-dialogo.md) — Crear/editar del admin en diálogo (cortos) o página (producto, pedido); hoja en móvil; `Dialog` de `@kshop/ui`; **R13 hecho** (17 pantallas, en `main`); confirmaciones en `useConfirm()` (R14 hecho)
- [2026-10-28-r12-superadmin-v3.md](project/2026-10-28-r12-superadmin-v3.md) — R12 hecho: secciones del menú por tienda (Visible / Gestionado por admin / Oculto, 403 en la API), lista de tiendas v3, «Menú de la tienda»; dónde está cada pieza; en `main`
- [2026-10-29-donde-quedamos.md](project/2026-10-29-donde-quedamos.md) — **Dónde quedamos** (pausa 2026-10-29): R12–R14 hechos y en `main`, qué sigue (8.6, 8.7, logs R11) y cómo retomar
- [credito-fullkod.md](project/credito-fullkod.md) — Crédito «Un producto de Fullkod» en plataforma, superadmin, admin y pie de todas las tiendas; **próximo:** ajuste en el admin para mostrarlo u ocultarlo en la tienda
- [tienda-demo.md](project/tienda-demo.md) — Tienda de pruebas permanente «Tienda Demo» (demo.kshop), plan Pro, dueño y empleado; credenciales en Tasknic y .env.local
- [tienda-minimercado.md](project/tienda-minimercado.md) — Cliente real: portada y marca montadas sin catálogo; el superadmin ya puede subir a `store-media`; 2026-11-04: 2 empleados y Excel de la agenda de precios por revisar
- [pendiente-superadmin-importar-excel.md](project/pendiente-superadmin-importar-excel.md) — Hecho 2026-10-30: el superadmin importa Excel a cualquier tienda (`store-imports`, solo INSERT en `imports/`)
- [pendiente-editar-categorias.md](project/pendiente-editar-categorias.md) — Hecho 2026-10-30: editar categorías daba 500 (trigger con `ltree` y `search_path` vacío); cuidado con operadores de extensiones
- [2026-11-01-dominio-klaushop.md](project/2026-11-01-dominio-klaushop.md) — **Corte 8.7 hecho:** `klaushop.fullkod.com` sirve la tienda `klau` (fila `custom` en `store_domains`, Vercel por Roberto); falta `--delta` y verify final
- [2026-11-01-donde-quedamos.md](project/2026-11-01-donde-quedamos.md) — **Dónde quedamos** (2026-11-01): KSH0004–KSH0007 y el SKU automático desplegados (`9f2779a`), corte de dominio de klauShop, reloj del PC adelantado (401 en local); qué sigue
- [2026-10-31-donde-quedamos.md](project/2026-10-31-donde-quedamos.md) — Superado. **Dónde quedamos** (2026-10-31): POS fases 1-6 en producción, venta también en la web, APK publicados y la web adaptada al teléfono (2 rondas, tema claro/oscuro); falta probar en un Android y un iPhone reales. `main` al día en `origin`
- [2026-11-01-ksh0004-plan-caja.md](project/2026-11-01-ksh0004-plan-caja.md) — KSH0004 hecho y desplegado: plan «Caja» (3 USD, mostrador sin tienda online), módulo `storefront` en 3 capas, candados BASE/PRO por `admin_bootstrap.upgrades`, landing con 3 planes (plan visible en producción)
- [2026-11-01-ksh0005-ayuda.md](project/2026-11-01-ksh0005-ayuda.md) — KSH0005 hecho: ayuda en la app («?» por vista, página Ayuda, primer día, glosario, FAQ, PDF/MD) en admin, superadmin y Kshop Admin; contenido en `packages/admin/src/help/`; regla: cambiar la UI ⇒ actualizar guía, `help:shots` y `help:pdf`; ayuda pública en `kshop.fullkod.com/help` (2026-11-14)
- [2026-11-01-ksh0006-paginas.md](project/2026-11-01-ksh0006-paginas.md) — KSH0006 (desplegado): `.sf-prose` no tenía CSS (por eso las páginas se veían apretadas), saltos de línea, botones y preguntas plegables desde Markdown, barra y vista previa en el editor; `pnpm qa:pages`
- [2026-11-01-ksh0007-menu-pie.md](project/2026-11-01-ksh0007-menu-pie.md) — KSH0007 (desplegado): el editor de menús muestra y edita los enlaces de cada columna del pie (solo UI), `pnpm qa:menus`; aprendizaje sobre sesiones en scripts de QA
- [2026-11-01-sku-automatico.md](project/2026-11-01-sku-automatico.md) — Un SKU vacío se crea en el servidor del nombre del producto (`skuBase`/`fillMissingSkus`), único en la tienda; el Excel sigue exigiéndolo
- [2026-11-02-codigo-de-atributo.md](project/2026-11-02-codigo-de-atributo.md) — Campo «Código» del atributo (como Saleor): dos «Talla» (ropa, calzado) con códigos distintos; error claro si se repite
- [2026-10-31-ksh0003-calculadora-precio.md](project/2026-10-31-ksh0003-calculadora-precio.md) — KSH0003: calculadora de costo unitario + margen en el editor de producto (diálogo, web y Kshop Admin), `unitCost`/`priceFromCost` en core, teléfonos cubanos como `+53 5 256 4206`; `pnpm qa:price-calculator`
- [2026-11-05-caja-v2.md](project/2026-11-05-caja-v2.md) — Caja v2 en el teléfono: ticket como pantalla, «⋯» con catálogo y ventas del día (abren su pedido), teclado sin barras, «Equivale a», pagos hechos en verde, safe area en `Dialog`, «Mostrador» segundo en Pedidos; método de pago en todos lados (KSH0010), cambiar el precio de una línea (KSH0011) y cierre de caja de todo el local (KSH0012/KSH0014)
- [2026-11-07-ksh0015-venta-por-peso.md](project/2026-11-07-ksh0015-venta-por-peso.md) — KSH0015 venta por peso/medida: dónde está cada pieza (units.ts, migración `20261108102500_sale_units`, `QuantityInput`, «Por importe»); **en producción 2026-11-07** (web `0cc534c`, Kshop Admin 1.0.25); pendientes en KSH0020
- KSH0017 Ganancia del día en el cierre (2026-11-07): calculada al leer, costos nuevos rellenan ventas pasadas, solo dueño/admin, en el WhatsApp; detalle en `.titan/plans/prp-ksh0012-cierre-de-caja.md` (migración `20261108102600`, en producción 2026-11-07)
- KSH0018 Guardar un producto vuelve a «Productos» (2026-11-07, Roberto): las fotos se suben abriéndolo de nuevo
- KSH0016 Filtro «Sin costo» en Catálogo › Productos (2026-11-07, `admin_products(p_no_cost)`, migración `20261108102400`), solo dueño/admin
- [2026-11-14-ksh0023-puesta-en-marcha.md](project/2026-11-14-ksh0023-puesta-en-marcha.md) — KSH0023: la puesta en marcha (5 USD, `setup_fee_usd`) va sola en la primera factura de cada tienda nueva; dónde está cada pieza
- [2026-10-30-donde-quedamos.md](project/2026-10-30-donde-quedamos.md) — Superado: cobro mixto y POS fases 1-2 en producción
- [2026-11-08 — Acompañar a un negocio nuevo](project/2026-11-08-alta-de-un-negocio-nuevo.md) — Qué pedirle al cliente, qué hacemos en la carga, módulos y límites de Caja/Base/Pro; el cierre por WhatsApp es solo Pro o suelto y Caja no tiene el botón de Kshop Admin
- [2026-11-08 — Guías en PDF por plan](project/2026-11-08-guias-por-plan.md) — Seis PDF (app y web de Caja, Base y Pro) en `_materiales/kshop/guias/`, cómo regenerarlos con `build.cjs` y qué falta (al día 2026-11-14; desde ese día en el repo: `packages/admin/src/help/guides/`, `pnpm help:guides`, descargables en Ayuda por todas las tiendas)
- [2026-11-13 — KSH0022 Costo en la lista de productos](project/2026-11-13-ksh0022-costos-en-lista.md) — Columna «Costo» editable (dueño/admin), diálogo para variantes, `PUT catalog/costs` → `set_variant_costs`
- [2026-11-14 — KSH0024 Ventas de un cierre y búsqueda por producto](project/2026-11-14-cierres-ventas-por-producto.md) — Pedido de Minimercado: «Ver sus ventas» abre las ventas con sus productos, filtro que se conserva al volver, cierres anteriores y búsqueda en todos; dónde está cada pieza y qué falta

## feedback/ — Correcciones y preferencias

- [secretos-en-assets-titan-factory.md](feedback/secretos-en-assets-titan-factory.md) — Imágenes pueden llevar API keys en metadatos; escanear binarios antes de push (heredado de klauShop)

## reference/ — Dónde encontrar cosas

- [trucos-entorno-y-next.md](reference/trucos-entorno-y-next.md) — Cache Components, pg_graphql y trucos del entorno de Roberto (puertos, *.localhost, Playwright, Lighthouse)
- [fuentes.md](reference/fuentes.md) — Rutas de materiales, klauShop, dcabellos, apululu y Saleor, y para qué sirve cada uno
- [web-en-el-telefono.md](reference/web-en-el-telefono.md) — La web abierta desde un iPhone/Android: variante `touch:`, campos a 16 px, «Volver» en la barra, `AdminSubNav`, `FilterBar`, barras fijas, variantes en tarjetas, tema por elección, `pnpm qa:mobile` (2026-10-31)
- [Correo de Fullkod](reference/correo-fullkod-resend.md) — @fullkod.com va por Resend (contact@, support@), sin reenvío; cada proyecto decide cómo avisar de sus formularios; Kshop envía por Resend los enlaces de acceso del personal (noreply@)

## Planes (`.titan/plans/`)

- `arranque-y-fases.md` — Paso 0, convenciones, fases 0a–8 y tabla de estado (al 2026-11-01: 0a–7, v2, R8–R14, POS 1–6 y KSH0002–KSH0007 hechas; Fase 8 con el corte de dominio hecho y pendientes `--delta`, verify y 8.6)
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
- `prp-fase-8-klaushop.md` — Fase 8: migrar klauShop como tienda `klaushop` (export read-only → snapshot → import por lotes reanudable → verify → corte), en la Nano; decisiones D1–D12 respondidas; **8.1–8.5 hechas** 2026-10-28 (`klaushop:verify` 21/22); faltan 8.6 (QA) y 8.7 (corte, con permiso)
- `prp-r11-rendimiento-admin.md` — R11: admin lento y 57014 según el informe de diagnóstico (`.titan/qa/r11-rendimiento-admin/`): bug login/set-password, sesión estable + timeouts/reintento único, arranque plano por `/api/v1/me?storeId=` (`admin_bootstrap`), `getClaims` + `api_guard`, proxy sin RPC de dominio, G10/cron/tests condicionales; D1–D6 cerradas: proyecto de prueba «KShop Test» (Docker retirado), cron solo promociones, getClaims sí, G13 hecho y G14 descartado, todo a funciones SQL y pg_graphql quitado, pagar tras medir. **HECHO** 2026-10-28 (admin mediana 1,05 s, p95 2,2 s, 0 errores); falta la Fase 7 (24 h de logs) y lo de «Pendiente tras R11»
- `prp-r12-superadmin-v3.md` — R12: visibilidad del menú de cada tienda (Visible / Gestionado / Oculto) con bloqueo de escrituras en `assertStoreWritable`, tabla `store_section_settings`, lista de tiendas v3 (`platform_stores_overview`, búsqueda, filtros, acciones) y accesos directos en la ficha; D1–D10; preguntas respondidas: básicas siempre visibles, texto «Gestionado por admin», todas las columnas — **HECHO** 2026-10-28 (en `main`)
- `prp-r13-formularios-en-dialogo.md` — R13: crear/editar del admin en `Dialog` (`<dialog>` nativo, hoja en móvil), 17 pantallas, `qa:dialogs` — **HECHO** 2026-10-28 (en `main`)
- `prp-r14-confirmaciones-en-dialogo.md` — R14: `window.confirm`/`prompt` → `ConfirmDialog` + `useConfirm()` sobre el `Dialog` de R13 (13 llamadas), confirmar borrados y acciones del superadmin que hoy no preguntan, cancelar pedido y anular factura en diálogo, regla `no-alert`; **HECHO** 2026-10-29 (`qa:confirms` 32/32; en `main`)
- `prp-ksh0004-plan-caja.md` — KSH0004: plan «Caja» (mostrador sin tienda online) con módulo nuevo `storefront` que apaga la web pública; P1–P7 aprobados y **HECHO** y desplegado 2026-11-01 (plan visible en producción)
- `prp-ksh0005-ayuda.md` — KSH0005: ayuda en la app como la de Tasknic («?» por vista, página Ayuda, primer día, glosario, FAQ, capturas por script, PDF/MD) en admin, Kshop Admin y superadmin; decisiones de Roberto del 2026-11-01; **HECHO** y desplegado 2026-11-01 (5 fases, `qa:help` 55/55 con Kshop Admin; aprendizajes del deploy dentro)
- `prp-pos-offline.md` — POS sin conexión en Kshop Admin (módulo `pos`), aprobado 2026-10-30: fases 1 a 6 en producción y APK publicados; falta probar en un Android real. Inventario en la etapa 2
- `prp-ksh0012-cierre-de-caja.md` — KSH0012: cierre de caja (esperado vs contado, fondo fijo por tienda, WhatsApp al dueño con el cuadre); HECHO 2026-11-06; **KSH0014: el cierre es de todo el local** (todas las cuentas y teléfonos, días anteriores sin cerrar, desglose por persona); dónde está cada pieza, pendientes y aprendizajes dentro
- `prp-venta-por-peso.md` — KSH0015: Venta por peso y medida (lb, kg, L, m…): cantidad decimal `numeric(12,2)` en carrito, pedidos, caja (también sin conexión) y stock, unidad en el producto, tienda online también; P1–P6 respondidas por Roberto (2026-11-07), aprobado; 7 fases
- `prp-cierres-ventas-por-producto.md` — KSH0024: Ventas de un cierre con sus productos, filtro por producto que se conserva al volver, «Ver cierres anteriores» y búsqueda de un producto en todos los cierres (pedido de Minimercado, D1–D3 de Roberto 2026-11-14); COMPLETADO y en producción (web `99ba868`, Kshop Admin 1.0.33)
