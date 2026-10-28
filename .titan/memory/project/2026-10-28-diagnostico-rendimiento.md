# Diagnóstico de rendimiento del admin (2026-10-28)

Roberto preguntó si la lentitud y las vistas del admin que no cargan son mala programación o un negocio demasiado
grande para la base, y qué se puede hacer sin pagar. Auditoría de solo lectura con 19 agentes (7 investigadores,
síntesis, 10 revisores que intentaron refutar cada causa: ninguna cayó). Informe completo con cifras y fuentes:
`.titan/qa/r11-rendimiento-admin/informe-diagnostico-2026-10-28.md`. Plan de arreglo: `.titan/plans/prp-r11-rendimiento-admin.md`.

## Veredicto
- **El volumen no es el problema**: 67 MB de 500 MB, 2 tiendas, 321 productos, 189 pedidos; lecturas del admin en
  caliente 5–142 ms. Es **diseño + operación + un bug**, y casi todo se arregla con $0.
- **Peaje de pg_graphql (C2, confianza alta)**: la primera consulta de cada conexión y rol reconstruye el esquema
  (~37 000 bloques, 190–270 ms de CPU; la segunda tarda 1 ms). Es ~75 % del tiempo de la base. En 24 h: ~380
  errores 57014, todos de GraphQL; REST/RPC solo 1. **Mover lecturas calientes a funciones SQL (RPC → jsonb) es la
  vía gratis que más blinda.**
- **La Nano va a créditos de CPU y los gasta el desarrollo (C1)**: ~39 000 de ~42 000 peticiones/24 h salieron de
  la máquina de Roberto (scripts, e2e, imports, codegen); clientes reales de Cuba: 3. La peor hora (01:00 UTC) la
  provocaron el import de klau y un build de Vercel. Cualquier DDL (incluidos los `pg_temp` de `test:rls`, ~55
  ejecuciones en 81 h) sube `graphql.seq_schema_version` y obliga a reconstruir el esquema en todas las conexiones (C5).
- **Admin frágil (C4, C6)**: arranque en cascada (`me()` → `StoreEntitlements`), sin timeouts, «todo o nada»;
  `session.tsx` recrea los clientes en cada evento de Auth (volver a la pestaña, renovación del token cada hora) y
  relanza todo sin cancelar; errores mal mostrados («Pedido no encontrado», «Cargando…» infinito en la ficha); la
  campana ejecuta `admin_home_summary` en cada cambio de página.
- **Bug (C3)**: `/admin/login` y `/admin/set-password` abiertos directamente nunca cargan en producción
  (`AdminShell.tsx` compara `pathname` con `/admin/login`, pero en el servidor la ruta es `/s/{slug}/admin/login`);
  en Chrome acaba en «Out of Memory». Los correos de invitación llevan a `set-password`: dueños y personal nuevos no
  pueden entrar. Rodeo: entrar por `/admin`.
- **Menores**: guardián de `/api/v1` con 3–4 viajes en serie (C7, +0,25–0,4 s de mediana); RPC de dominio propio en
  el proxy sin tiendas con dominio (C8); 2 tareas pg_cron cada minuto (C9, síntoma, no causa); orden de condiciones
  en RLS del personal (C10, milisegundos hoy).

## Reglas operativas que salen de aquí
- **Nunca** lanzar `e2e:*`, `qa:*`, `klaushop:*`, `test:rls` ni `pnpm build` mientras alguien usa la web ni justo
  antes de un deploy; en serie, nunca a la vez. Es lo más barato de todo (G2).
- No usar pings para «mantener caliente», no subir `statement_timeout`, no alargar `cacheLife("minutes")` (la
  suspensión diaria y los banners dependen de él).
- Supera la conclusión de `lecturas-tienda-r9.md` («se arregla con la instancia»): subir a Pro + Small (~$30/mes) se
  recomienda **por copias de seguridad y uso real**, no porque arregle los fallos; pagar no corrige ningún fallo de código.

## Decisiones de Roberto (2026-10-28, PRP R11 aprobado)
- D1: desarrollo y tests en **Supabase local con Docker**, dentro de R11 (Fase 0b) — **retirado** (ver «Avance»). En producción solo `db:migrate`,
  una pasada de `test:rls` por migración y las mediciones.
- D2: solo las **promociones** pueden ir hasta 5 min tarde (cron cada 5 min con ventana ampliada); WhatsApp sigue cada minuto.
- D3: `getClaims` aceptado (baneado en Auth conserva acceso ≤ 1 h; superadmin sigue con `getUser`).
- D4: pagar Supabase Pro + Small / Vercel Pro se decide **después de medir R11**.
- D5: G13 (RLS del personal) y G14 (esquema de pg_graphql) **dentro de R11** (fases 6b y 6c); el cambio de
  `search_path` en producción se avisa antes con la medición local.

## Avance de R11 (2026-10-28)
- Hecho y verificado en local, migraciones en producción (RLS 644/644): login/set-password, sesión estable, timeouts +
  un reintento (`packages/data/src/resilient-fetch.ts`), arranque en una llamada (`/api/v1/me?storeId=` →
  `admin_bootstrap`), campana con `admin_to_confirm`, señales Realtime con tabla, `getClaims` + `api_guard`, cron de
  promociones cada 5 min, RLS del personal sin función por fila. G14 medido y descartado (−6/−19 %). Detalle en el PRP.
- ~~Desarrollo y tests en Supabase local (Docker)~~ **retirado el 2026-10-28** a petición de Roberto: las imágenes
  llenaron el disco C:. Se quitaron `scripts/db-env.mjs`, `docs/LOCAL_DB.md`, `supabase/config.toml` y los
  `db:local:*`; todo vuelve a la base online. D1 queda abierta: la alternativa es un **2º proyecto Supabase Free**
  de pruebas (la organización tiene 1 de 2), **hecho el 2026-10-28**: «KShop Test» (`peyfwvjwmuokllmqeexh`, Free,
  us-east-1), 59 migraciones, RLS 644/644, Tienda Demo sembrada; `scripts/db-env.mjs` manda dev/e2e/qa/test:rls/codegen
  ahí por defecto (`KSHOP_DB_TARGET=prod` para producción). Ver `docs/TEST_DB.md`. Sin clave de OpenWA: nunca envía
  WhatsApp reales. Un proyecto nuevo no tiene particiones de `realtime.messages` hasta su primer cliente Realtime.
- **Desplegado 2026-10-28** (`92ebd31` + `b161a32`). Producción después (`perf-prod-despues*.json`): mediana 4,4 s →
  1,8–2,0 s, máximo 33,8 s → 16–24 s, peticiones 168 → 90–100, GraphQL 66 → 26. Quedan picos de pg_graphql en frío
  (lote de 9,7 s con 500 en themes/menus) y en la 1ª ronda, justo tras el deploy, 500 rápidos pasajeros en `/api/v1`
  (`/me`, billing, warehouses…) que no se repitieron; causa sin confirmar (logs de Vercel en otra cuenta).
- **Fase 5 (2026-10-28)**: el peaje es pg_graphql en frío (226–296 ms por conexión nueva frente a 11–47 ms de la
  consulta). Pedidos, detalle, Inicio, Métodos de pago, Entregas y registro de avisos leen por RPC (`admin_orders`,
  `admin_order`, `admin_checkout_settings`, `admin_notification_log`, idénticas a pg_graphql:
  `scripts/compare-admin-reads.mjs`). Regla: una vista solo se libra del peaje si **no** le queda ninguna lectura
  pg_graphql. Nunca medir con DDL (tabla temporal): invalida la caché de pg_graphql de todos.
- **Decisión de Roberto (2026-10-28): todo el admin fuera de pg_graphql.** 15 RPC `admin_*` (migraciones
  20261108100400 y 20261108100500) con la forma exacta del documento GraphQL (35/35 idénticas en
  `scripts/compare-admin-reads.mjs`, tests 15 y 16; RLS 661/661). La sesión del admin ya no tiene cliente `graphql`,
  solo `reads`. pg_graphql queda para la tienda pública, tras la caché del servidor. Regla en `AGENTS.md` (Stack ›
  Lecturas). Si un día nada lo usa, se puede quitar la extensión (decisión aparte).
- Ojo al escribir una RPC: `product_media` (oculta `source_url`) y `stores` tienen permisos por columna para
  `authenticated`: nada de `select *` sobre ellas.
- **T9 hecho (2026-10-28):** `KSHOP_CUSTOM_DOMAIN_REDIRECT=off` en Vercel (la puso Roberto; Claude no tiene acceso a
  Vercel: guiarle paso a paso). Quitarla antes del primer dominio propio activo (regla en `AGENTS.md`).
- **Tienda pública fuera de pg_graphql (2026-10-28):** 16 funciones `sf_*` (migración 20261108100700) con la forma
  exacta de cada documento (36/36 en `scripts/compare-storefront-reads.mjs`); `createGraphqlClient` ya no llama a
  `/graphql/v1`: manda cada operación a `sf_<operación>`. Test 17. Páginas de producción (pg_graphql) y local (RPC)
  con el mismo texto; producción daba error de servidor en `/products?page=3&sort=price-desc` (anon 57014) y local no.
- **Otros (2026-10-28):** el arranque del admin (web y app) se guarda 24 h por usuario y tienda en localStorage
  (`kshop.admin.*`, se borra al cerrar sesión) y se pinta al instante; Equipo lee `store_team` (antes listaba todas
  las cuentas de Auth). Las RPC de Finanzas/Inicio cuestan 1–34 ms calientes: su segundo de más es Vercel en frío y
  la Nano, no el código.
- **Pendiente:** quitar la extensión pg_graphql cuando los logs no muestren peticiones a `/graphql/v1` (APK de Kshop
  Admin antiguos la usaban) y rehacer los 10 checks de RLS que usan `graphql.resolve` (tests 02, 03, 04).
- (Antes) Falta: desplegar el código (permiso de Roberto) y medir en producción con `qa:admin-perf` (línea base
  `.titan/qa/r11-rendimiento-admin/perf-prod-antes.json`: mediana 4,4 s, p95 20,9 s).

## Estado al cerrar la sesión
- WhatsApp en **«Simulado»** (`dry_run`) mientras dure R11, por decisión de Roberto.
- Nada de código ni datos tocado. Única huella: `graphql.seq_schema_version` 15 756 → 15 757 por una tabla temporal
  de prueba.
- No se pudo medir: mínimo real de CPU de la Nano (ver Dashboard › Observability), logs/región de Vercel (el MCP
  estaba en otra cuenta, `lgiavedonis-projects`), experiencia desde Cuba.
