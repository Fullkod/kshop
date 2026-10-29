# PRP: R11 · Rendimiento del admin y errores 57014

> **Estado**: HECHO (2026-10-28). Todo el admin y la tienda leen por funciones SQL; pg_graphql quitado de producción.
> **Falta**: Fase 7, revisar 24 h de logs con uso normal (57014 y errores 500 de `/api/v1`), a partir del
> 2026-10-29. Resto pendiente (fuera del código) en «Pendiente tras R11» al final.
> **Fecha**: 2026-10-28
> **Proyecto**: Kshop
> **Sigue a**: `prp-r9-lecturas-tienda.md`, `prp-r10-deuda-lecturas.md`. Memoria: `project/lecturas-tienda-r9.md`
> (sección «Admin: 57014 en todo el panel»).
> **Informe de diagnóstico** (solo lectura, 2026-10-28, con cifras y fuentes):
> `.titan/qa/r11-rendimiento-admin/informe-diagnostico-2026-10-28.md`. Este PRP convierte sus recomendaciones
> gratuitas (G1–G15) en fases de código; las decisiones de operación y de pago se listan aparte para Roberto.

---

## Objetivo

Que el admin de tienda (y Kshop Admin) cargue cada vista en menos de ~2 s sobre la instancia actual, sin errores
57014 fuera de las horas de trabajo y sin pantallas que se queden en «Cargando…» o muestren un error falso, cambiando
solo código y configuración propia (coste $0).

## Por Qué

| Problema (medido en el informe) | Solución |
|----------|----------|
| `/admin/login` y `/admin/set-password` nunca cargan en producción: los correos de invitación llevan a `set-password`, así que dueños nuevos y personal invitado no pueden entrar (C3) | Decidir «ruta pública» por segmento del layout, no comparando `pathname` con `/admin/login` (en el servidor la ruta es `/s/{slug}/admin/login`) |
| El marco del admin arranca en cascada (`me()` → `StoreEntitlements` por pg_graphql), 3 reintentos y «todo o nada»; la primera consulta pg_graphql de cada conexión reconstruye el esquema (~200 ms de CPU, 2–8 s con la Nano estrangulada) y acaba en 57014 (C2, C4) | Un solo `/api/v1/me?storeId=` que devuelve rol + módulos + límites + suscripción por REST/RPC; el arranque deja de pasar por pg_graphql |
| Cada cambio de sesión (volver a la pestaña, renovación del token cada ~1 h) crea clientes `api`/`graphql` nuevos y relanza todas las lecturas sin cancelar las anteriores; un panel que funcionaba pasa a «No se pudo cargar el panel» (C4) | Clientes memorizados por `session.user.id`; una recomprobación de fondo nunca pasa de «listo» a «error» |
| Sin timeouts ni reintento único: «Cargando…» infinito en la ficha de producto, «Pedido no encontrado» ante un error de red, un 500 tumba todo el lote y el lote con error se parte en N peticiones en plena crisis (C4) | Timeout de 10–12 s, **un** reintento con espera aleatoria solo ante 5xx/57014, el lote se reintenta entero una vez, mensajes correctos con «Reintentar» |
| La campana ejecuta `admin_home_summary` completo en cada cambio de página y en cada señal Realtime (838 llamadas, p95 5,5 s), dos veces en Inicio; `realtime.ts` descarta la tabla del aviso y las listas recargan por `notification_log` (C6) | Contador ligero sin `pathname` en las dependencias; la señal Realtime expone la tabla para filtrar |
| Cada llamada a `/api/v1` hace `getUser` (GoTrue) + `store_members` + `stores` + entitlements en serie: +0,25–0,4 s de mediana, varios segundos en p95 (C7) | `getClaims()` (verificación local ES256) + una RPC `api_guard` que devuelve rol y estado de tienda en un viaje |
| El proxy llama a `resolve_store_custom_domain` antes de servir páginas cacheadas aunque ninguna tienda tenga dominio propio; `stores.ts:17` repite la llamada sin timeout y un fallo da 500 (C8) | Saltar la RPC cuando no hay dominios vivos; timeout con resultado `null` en `fetchStoreCustomDomain` |
| Retraso artificial de 250 ms en la primera lectura de Productos y Pedidos: esa lectura no entra en el lote y abre una segunda conexión fría (C4) | Sin retraso en la primera carga (el debounce queda solo para la búsqueda) |

**Valor de negocio**: desbloquea el alta de tiendas y de personal (invitaciones), y deja el admin usable sobre la Nano
mientras no haya ingresos que justifiquen pagar. Pagar la instancia (P1/P2) no arregla ninguno de los fallos de código.

## Qué

### Criterios de Éxito
- [x] `/admin/login` y `/admin/set-password` abiertos directamente en `next build && next start` muestran el formulario y **responde** (login real y cambio de contraseña desde un enlace de invitación).
- [x] El marco del admin se pinta tras **una** llamada a `/api/v1/me?storeId=` (0 consultas pg_graphql antes de montar la página); la vista pide sus datos a la vez que el marco, no después.
- [x] Volver a la pestaña o renovar el token no relanza el arranque ni las lecturas de la página, y nunca pasa un panel de «listo» a «error».
- [x] Ninguna vista queda en «Cargando…» infinito ni muestra «Pedido no encontrado» por un error de red: toda carga fallida muestra el error real con «Reintentar» (ficha de producto, pedido, KPIs de Inicio, listas).
- [x] Un 57014 en un lote GraphQL se reintenta **una** vez (lote entero) y no se parte en N peticiones. *(Superado: ya
  no hay lotes GraphQL; cada lectura RPC lleva timeout y un reintento en `resilient-fetch.ts`.)*
- [x] GET de `/api/v1` con sesión: sin llamada a GoTrue en la ruta caliente (`getClaims`), rol + estado de tienda en un viaje.
- [x] Medido con `pnpm qa:admin-perf` (36 vistas, Tienda Demo, hora tranquila, Nano): mediana < 2 s y p95 < 4 s (hoy mediana ~3,6 s, máximo 16,5 s). *(Producción 2026-10-28: mediana 1,05 s, p95 2,2 s, 0 errores.)*
- [ ] 24 h de logs de Supabase fuera de horas de trabajo: **0** errores 57014 (hoy 378–388/24 h).
- [x] `pnpm typecheck`, `lint`, `test`, `test:rls` (≥ 598) y los `e2e:*` afectados en verde; `db:graphql-schema && codegen` sin diff inesperado. *(RLS 670/670 en prueba y producción.)*

### Comportamiento Esperado
1. El dueño abre `tienda.kshop.fullkod.com/admin` (o el enlace de invitación a `/admin/set-password`). La página
   pública carga y el formulario funciona.
2. Con sesión, el marco pide **una vez** `/api/v1/me?storeId=` y pinta la barra lateral; la vista (Inicio, Pedidos,
   Productos…) lanza sus lecturas en el mismo instante, agrupadas en un lote.
3. Si una lectura falla por 5xx/57014, se reintenta una vez tras una espera aleatoria; si vuelve a fallar, la vista
   muestra el error con «Reintentar», sin tumbar el marco ni las demás vistas.
4. Al volver a la pestaña o renovar el token, nada se recarga; solo las señales Realtime (con su tabla) disparan
   lecturas, y la campana lee un contador ligero.
5. La API valida el token localmente y comprueba rol y estado de la tienda en una RPC; la tienda pública no espera
   a la RPC de dominio propio cuando no hay dominios vivos.

---

## Contexto

### Referencias (código que se toca)
- `apps/web/src/app/s/[storeSlug]/admin/AdminShell.tsx` — `PUBLIC_PATHS` (bug C3), arranque en serie, 3 reintentos, campana con `pathname`.
- `packages/admin/src/session.tsx:70-80` — clientes recreados en cada cambio del objeto `session`.
- `packages/admin/src/admin-context.ts` — `loadAdminState`: `me()` y después `StoreEntitlementsQuery` por pg_graphql.
- `packages/data/src/graphql-batch.ts` — lote: `!response.ok` falla todo; errores GraphQL → reenvío en paralelo (líneas 157–178).
- `packages/data/src/api.ts:771` (`createApiClient`) y `packages/data/src/graphql.ts` — sin timeout.
- `packages/admin/src/catalog/ProductList.tsx:51-63`, `orders/OrderList.tsx:148-151` — retraso de 250 ms.
- `packages/admin/src/catalog/ProductEditor.tsx`, `orders/OrderDetail.tsx` — carga en serie, «Cargando…» infinito, error como «no encontrado».
- `packages/data/src/realtime.ts` — `notify` descarta el payload (`table`, `op`) que ya envía `20261106100100_realtime_signals.sql`.
- `apps/web/src/server/auth.ts` — `getUserFromBearer` (`auth.getUser`), `getStoreRole`, `requireModule`; `server/store-writable.ts`.
- `apps/web/src/app/api/v1/me/route.ts` — `MeResponse`; `packages/data/src/api.ts:92-103` (`MeResponse`, `EntitlementsResponse`).
- `apps/web/src/proxy.ts:111` (`cachedRpc`, timeout 3 s) y `apps/web/src/server/stores.ts:16-28` (`fetchStoreCustomDomain`, sin timeout).
- `apps/admin-app/src/App.tsx:230-345` — 4 fases en serie, `me()` dos veces.
- `supabase/migrations/20261024120300_entitlements_security_invoker.sql` (`store_entitlements`, `store_limits`), `20261105100200`/`20261106100300` (`admin_home_summary`), `20261029100300_pricing_engine.sql:1048` y `20261030100200_notifications_engine.sql:416` (cron cada minuto), `supabase/tests/_harness.sql` (DDL por test).
- Patrón de medición: el sondeo de 36 vistas del informe (`admin-probe2.mjs` del scratchpad de la sesión) y `scripts/qa-*.mjs` (playwright-core con el Chromium de la caché).
- Docs: Next 16 `useSelectedLayoutSegment` (`node_modules/next/dist/docs/`); supabase-js `auth.getClaims` (claves asimétricas ES256, JWKS cacheado).

### Arquitectura propuesta
Sin carpetas nuevas: se corrigen las piezas existentes y se añaden dos funciones SQL y un script de QA.

```
supabase/migrations/20261107100100_admin_bootstrap_and_api_guard.sql   (nuevo)
apps/web/src/app/api/v1/me/route.ts            ?storeId= → bootstrap (rol, módulos, límites, suscripción, estado, precios)
apps/web/src/server/auth.ts                    getClaims + api_guard; requireStoreRole sigue siendo explícito
apps/web/src/server/stores.ts, proxy.ts        dominio propio con timeout / salto cuando no hay dominios vivos
packages/data/src/{api.ts,graphql.ts,graphql-batch.ts,realtime.ts}   timeout, reintento único, lote entero, tabla en la señal
packages/admin/src/{session.tsx,admin-context.ts,catalog/*,orders/*}  clientes estables, arranque plano, sin 250 ms, errores con «Reintentar»
apps/web/src/app/s/[storeSlug]/admin/AdminShell.tsx                   rutas públicas por segmento, campana barata
apps/admin-app/src/App.tsx                     un solo me(), arranque plano
scripts/qa-admin-perf.mjs  (`pnpm qa:admin-perf`)   36 vistas: tiempo por vista, lecturas, errores; capturas en .titan/qa/r11-rendimiento-admin/
```

Reglas que se respetan: toda mutación y el arranque por `/api/v1` con Bearer (sirve igual a Kshop Admin); `packages/*`
sin `next/*`; RLS intacta (`admin_bootstrap` es `security invoker`: devuelve lo que el usuario ya puede leer); el
precio de costo no entra en ninguna lectura nueva; sin Server Actions.

### Modelo de datos (funciones nuevas, sin tablas)
```sql
-- Arranque del admin en un viaje (lo que hoy hace StoreEntitlements + /me, fuera de pg_graphql).
-- security invoker: RLS decide; el superadmin ve toda tienda, el personal la suya. Nunca el costo.
create function public.admin_bootstrap(p_store_id uuid) returns jsonb
  language sql stable security invoker set search_path = '' as $$ ... $$;
  -- { role, modules: [{code, source, limits, endsAt}], limits, subscription: {status, trialEndsAt},
  --   storeStatus, addonPrices: {code: usd}, toConfirm }
revoke all on function public.admin_bootstrap(uuid) from public, anon;
grant execute on function public.admin_bootstrap(uuid) to authenticated, service_role;

-- Guardián de la API: rol del usuario en la tienda y estado de la tienda, en una consulta (solo service_role).
create function public.api_guard(p_user_id uuid, p_store_id uuid) returns jsonb
  language sql stable security definer set search_path = '' as $$ ... $$;
  -- { role, storeStatus, isMember }
revoke all on function public.api_guard(uuid, uuid) from public, anon, authenticated;
grant execute on function public.api_guard(uuid, uuid) to service_role;
```
`admin_home_summary` no cambia; la campana usa `toConfirm` del bootstrap y, en cada señal Realtime de `orders`, una
lectura ligera (contador) en vez del resumen completo. Tras la migración: `pnpm test:rls` (tests nuevos: un staff de
A no obtiene el bootstrap de B; anon no ejecuta ninguna de las dos), `pnpm db:graphql-schema && pnpm codegen`.

### Decisiones técnicas propuestas
| # | Decisión | Por qué |
|---|----------|---------|
| T1 | Lo público del admin se decide por segmento de layout (`useSelectedLayoutSegment() === "login" \| "set-password"`), no por `pathname` | En el servidor el `pathname` es `/s/{slug}/admin/login`; el segmento es el mismo en servidor y navegador |
| T2 | `useMemo` de `api`/`graphql` por `session?.user.id` (y `config`), no por el objeto `session`; `getAccessToken` sigue leyendo el token por petición | El token cambia en cada renovación; la identidad no |
| T3 | Red de seguridad en `@kshop/data`: `AbortSignal.timeout(12_000)` en `createApiClient` y en el fetch de urql; un reintento con `random(300–900 ms)` solo ante 5xx o `57014` y nunca tras un aborto propio (abortar en el cliente no cancela la consulta en el servidor) | Un solo sitio para web y apps |
| T4 | En `graphql-batch.ts`: un `!response.ok` del lote se reintenta **una** vez entero; los errores GraphQL de forma siguen reenviándose uno a uno (son deterministas) | Partir el lote en N multiplicaba la carga justo cuando la base está ahogada |
| T5 | `/api/v1/me?storeId=` devuelve `MeResponse & { admin: AdminBootstrap }` llamando a `admin_bootstrap` con el cliente del usuario (REST/RPC, no pg_graphql); `loadAdminState` hace una llamada. `StoreEntitlementsQuery` se retira del arranque (se mantiene si alguna pantalla la usa) | El arranque deja de pagar la reconstrucción del esquema de pg_graphql |
| T6 | El marco no bloquea la página: `AdminShell` monta `children` mientras carga el bootstrap (la vista ya lanza sus lecturas; el menú aparece al llegar) | Quita una tanda en serie por vista |
| T7 | `getUserFromBearer` usa `auth.getClaims(token)` (ES256, JWKS en memoria) para rutas de tienda; el superadmin y las rutas de cuenta siguen con `getUser` | −1 viaje a GoTrue por llamada; coste: un usuario baneado conserva acceso hasta que caduque el token (≤ 1 h) → **decisión de Roberto (D3)** |
| T8 | `requireStoreRole` + `assertStoreWritable` leen `api_guard` una vez por petición (memo en el `request`) | 2–3 consultas en serie pasan a 1 |
| T9 | `proxy.ts` y `stores.ts`: la RPC de dominio se salta si `CUSTOM_DOMAINS_ENABLED` no está activo **o** la lista cacheada de dominios vivos está vacía; `fetchStoreCustomDomain` con timeout 3 s y `null` si falla | Hoy no hay dominios vivos; un fallo de esa RPC no puede dar 500 a la tienda |
| T10 | La señal Realtime expone `{ table, op }` al callback; las listas filtran `notification_log`; la vista de avisos sigue escuchando | El trigger ya lo envía; solo faltaba no descartarlo |
| T11 | Las lecturas calientes a RPC `jsonb` (G10: ficha de producto, lista de pedidos, lista de productos) se abordan **solo si tras las fases 1–4 la medición sigue por encima de 2 s** | Es la fase más cara (3–5 días) y pierde los tipos de codegen; primero se mide |

---

## Blueprint (Assembly Line)

> Solo fases. Las subtareas se generan al entrar a cada fase con `tf-bucle-agentico`. Orden = el del informe
> (§7): primero lo que más daño hace y menos cuesta.

### Fase 0: Línea base y script de medición
**Objetivo**: `scripts/qa-admin-perf.mjs` (`pnpm qa:admin-perf`, a partir del sondeo del informe): abre las 36 vistas
de la Tienda Demo en producción o en local, registra tiempo por vista, número de lecturas (API, GraphQL, lotes) y
errores; cuenta los 57014 de las últimas 24 h con `query_logs`. Evidencia «antes» en
`.titan/qa/r11-rendimiento-admin/`. Añadir a `AGENTS.md` la disciplina G2 (no correr `e2e:*`, `qa:*`, imports ni
`test:rls` mientras se usa la web ni justo antes de un deploy; en serie, nunca a la vez).
**Validación**: el script corre con `pnpm dev` y contra producción; informe «antes» guardado; regla en `AGENTS.md`.

### Fase 0b: Supabase local con Docker para desarrollo y tests (G3, D1) — RETIRADA 2026-10-28
> Se hizo y se usó para las fases 1–6b, pero las imágenes llenaron el disco C: y Roberto pidió quitarla: los scripts
> vuelven a la base online. **Sustituida el mismo día** por el proyecto Supabase Free «KShop Test»
> (`peyfwvjwmuokllmqeexh`): `scripts/db-env.mjs` manda ahí dev, e2e, qa, `test:rls` y `db:graphql-schema` por defecto;
> `docs/TEST_DB.md`.

**Objetivo**: `supabase start` (Docker Desktop) con las mismas migraciones, `auth-config`, buckets (`store-media`,
`store-private`, `store-apps`), seed de la Tienda Demo y cuentas e2e. Los scripts (`db.mjs`, `e2e-*`, `qa-*`,
`seed-demo-store.mjs`, codegen) eligen destino por variable (`KSHOP_DB_TARGET=local|remote`, por defecto **local** para
`pnpm dev`, `e2e:*`, `qa:*`, `test:rls`, `db:graphql-schema`; **remote** explícito para `db:migrate`, `db:auth-config`
y `klaushop:*`). `.env.local` gana un bloque `LOCAL_*`; `.env.example` y `docs/AGENT_SETUP.md` lo documentan. El MCP de
Supabase sigue apuntando al proyecto Kshop (nunca a otro).
**Validación**: con Docker arriba, `pnpm dev` + `pnpm demo:seed` + `pnpm test:rls` + `pnpm e2e:api` en verde contra local y
**0 peticiones** a `siyiupetrjyzkumhdupy` en esos comandos (logs de Supabase); `db:migrate` sigue aplicando en remoto;
`pnpm codegen` sin diff entre el esquema local y el remoto. Las demás fases de R11 se desarrollan y testean en local;
en producción solo `db:migrate`, una pasada de `test:rls` por migración y las mediciones.

### Fase 1: Bug de `/admin/login` y `/admin/set-password` (G1)
**Objetivo**: las rutas públicas del admin se deciden por segmento (T1); el formulario carga e hidrata al abrir la URL
directamente; el `<form>` no envía credenciales por la URL si aún no hidrató.
**Validación**: `next build && next start` (puerto ≠ 3100) → login real y `set-password` desde un enlace de invitación
real funcionan; Playwright comprueba que el formulario **responde**, no solo que aparece.

### Fase 2: Sesión estable y red de seguridad (G4 + G6)
**Objetivo**: clientes memorizados por `user.id` (T2); timeout y reintento único en `@kshop/data` (T3); lote
reintentado entero (T4); mensajes correctos con «Reintentar» en ficha de producto, pedido, KPIs de Inicio y listas;
una recomprobación de fondo nunca pasa de «listo» a «error»; sin retraso de 250 ms en la primera carga.
**Validación**: `graphql-batch.test.ts` ampliado (reintento único, aborto no reintenta); simular 57014/500 con un
fetch falso → cada vista muestra error con «Reintentar»; cambiar de pestaña y renovar el token no relanza lecturas
(contador de peticiones en `qa:admin-perf`).

### Fase 3: Arranque plano y campana barata (G5 + G7)
**Objetivo**: migración con `admin_bootstrap` (+ tests de aislamiento); `/api/v1/me?storeId=` (T5); `AdminShell`
monta la vista a la vez que el marco (T6); `ProductEditor` carga estructura y producto en paralelo; campana sin
`pathname` y con contador ligero; `realtime.ts` expone la tabla (T10); `apps/admin-app` con un solo `me()` y arranque
plano.
**Validación**: `test:rls` (nuevos tests del bootstrap); `qa:admin-perf` muestra 1 llamada de arranque y 0 pg_graphql
antes de montar; `e2e:billing` (entitlements por el bootstrap) y `qa:apps` (Kshop Admin) en verde.

### Fase 4: Guardián de la API y dominio propio (G8 + G12)
**Objetivo**: `getClaims` + `api_guard` (T7, T8; requiere D3); proxy y `stores.ts` sin esperar la RPC de dominio
cuando no hay dominios vivos, con timeout y `null` si falla (T9).
**Validación**: `e2e:api`, `e2e:orders`, `e2e:pro` (dominio propio) en verde; mediana de GET de `/api/v1` medida
antes/después (`qa:admin-perf`); una tienda sin dominio no llama a la RPC (log del proxy).

### Fase 5: Medición intermedia y lecturas calientes a RPC (G10, condicional)
**Objetivo**: repetir `qa:admin-perf` y el conteo de 57014. Si alguna vista sigue por encima de 2 s por el peaje de
pg_graphql, pasar a RPC `jsonb` (security invoker, mismo RLS) **solo** esas lecturas, empezando por la ficha de
producto y la lista de pedidos (T11). Si no, cerrar la fase con la medición.
**Validación**: `test:rls`; resultado idéntico entre la consulta GraphQL y la RPC en la Demo; medición después.

### Fase 6: Operación de la base (G9 + G11, con D2 = solo promociones)
**Objetivo**: promociones cada 5 minutos **ampliando su ventana** de 3 minutos en `refresh_promotion_boundaries` para no
perder inicios ni finales; el dispatcher de WhatsApp **sigue cada minuto** (D2); tareas desfasadas (no en el mismo
segundo); purga diaria de `cron.job_run_details` (> 7 días). Helpers `tests.*` instalados una vez en un esquema sin
exponer y sin permisos para anon/authenticated (sin DDL por test): con D1 los tests corren en local, pero la pasada de
`test:rls` en producción tras cada migración sigue existiendo.
**Validación**: `test:rls` completo sin subir `graphql.seq_schema_version` más de una vez; `e2e:discounts` y
`e2e:notifications` en verde (promociones que empiezan y acaban dentro de la ventana nueva).

### Fase 6b: RLS del personal (G13, D5)
**Objetivo**: en las políticas de `product_variants`, `variant_prices` y demás hijas, la condición del personal («es
mi tienda») va antes que la pública; helper `private.my_admin_store_ids()` sin correlación (subplan hash, como R10);
`ROWS` realista solo en `my_store_ids`; revisar las 32 políticas con `has_store_role`/`store_is_public` por fila.
**Validación**: `EXPLAIN (analyze, buffers)` antes/después como staff y como anon en las lecturas anidadas del admin y
de la tienda (objetivo ~5–7× menos en las del personal, anon sin empeorar); `test:rls` completo; el costo sigue sin
salir en ninguna lectura pública.

### Fase 6c: Reducir lo que ve pg_graphql (G14, D5)
> **Descartada** (medida: −6/−19 %, ver Aprendizajes) y **superada**: pg_graphql ya no existe en producción.

**Objetivo**: sacar de `public` las tablas internas que la app no lee por GraphQL (inventario: 46 de 72 colecciones
usadas; las 34 llamadas `.from()` se migran a RPC o al esquema nuevo), y quitar `extensions` del `search_path` de los
roles de la API (139 funciones que pg_graphql recorre). Medir la reconstrucción (`{__typename}` en conexión fría,
bloques y ms) antes/después.
**Validación**: reconstrucción en frío medida −30 % o más; `db:graphql-schema && codegen` con el diff esperado;
`typecheck`, `test`, `test:rls`, `e2e:*` afectados en verde (en local). **El cambio de `search_path` es configuración
de Supabase**: se aplica en producción solo tras avisar a Roberto con la medición local delante; si rompe algo (p. ej.
`pgcrypto`/`unaccent` sin calificar) se revierte.

### Fase 7: Validación final y memoria
**Objetivo**: sistema medido de punta a punta.
**Validación**:
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (local) en verde; `pnpm test:rls` ≥ 598 (670).
- [x] `pnpm qa:admin-perf` «después»: mediana < 2 s, p95 < 4 s, 0 vistas con error; capturas en `.titan/qa/r11-rendimiento-admin/` (`perf-prod-sin-graphql.json`).
- [ ] 24 h de logs fuera de horas de trabajo: 0 × 57014. **Pendiente** (desde el 2026-10-29, con uso normal y sin `e2e`/`qa` en producción).
- [x] Criterios de éxito cumplidos salvo los logs; memoria actualizada (`project/2026-10-28-diagnostico-rendimiento.md`, `project/lecturas-tienda-r9.md`, `MEMORY.md`), aprendizajes en este PRP.

---

## Decisiones de Roberto (cerradas el 2026-10-28)

| # | Decisión | Respuesta | Efecto en el plan |
|---|----------|-----------|-------------------|
| D1 | Separar dev/test de producción | ~~**Docker local** (`supabase start`), **dentro de R11**~~ → **2º proyecto Supabase Free «KShop Test»** (el disco C: se llenó) | Fase 0b retirada; dev, e2e, qa y `test:rls` van al proyecto de prueba por defecto |
| D2 | ¿Promociones y avisos hasta 2–5 min tarde? | **Solo promociones** | Fase 6: promociones cada 5 min con ventana ampliada; WhatsApp sigue cada minuto |
| D3 | `getClaims` (baneado en Auth conserva acceso ≤ 1 h) | **Sí** | Fase 4 tal cual (superadmin y cuenta siguen con `getUser`) |
| D4 | Cuándo pagar Supabase Pro + Small / Vercel Pro | **Medir tras R11** | Fuera de R11; la Fase 7 deja los números para decidir |
| D5 | G13 (RLS del personal) y G14 (esquema de pg_graphql) | **Ambos dentro de R11** | Fases 6b (hecha) y 6c (descartada, superada) |
| D6 | ¿Todo fuera de pg_graphql? (2026-10-28) | **Sí, y quitar la extensión** | Admin (`admin_*`) y tienda (`sf_*`) por funciones SQL; `drop extension pg_graphql` en producción |

WhatsApp queda en «Simulado» mientras dure R11 (decisión de Roberto, 2026-10-28).

---|----------|---------------------------|----------|
| D1 | **Separar dev/test de producción (G3)**: 2º proyecto Supabase Free (la organización tiene 1 de 2 posibles) o `supabase start` (Docker local) para `pnpm dev`, `e2e`, `qa`, `test:rls`, codegen e imports | 2º proyecto Free: medio día; migraciones, `db:auth-config`, `demo:seed`, buckets y `.env` aparte; el MCP sigue limitado a un proyecto. Quita la mayor parte de las ráfagas y los vaciados de caché (C1, C5). Sería un PRP propio | Fase 6 (G9 sobra si se hace) |
| D2 | **Cron (G11)**: ¿pueden las promociones programadas y los avisos de WhatsApp llegar hasta 2–5 min tarde? | Sí mientras no haya tiendas reales con promociones a hora fija; WhatsApp parado mientras el modo no sea «Real» | Fase 6 |
| D3 | **`getClaims` (G8)**: un usuario expulsado de Auth conserva el acceso hasta que caduque su token (≤ 1 h); la pertenencia a la tienda (`store_members`) se sigue comprobando en cada llamada | Aceptable: quitar a alguien del equipo es inmediato (store_members); el baneo en Auth es excepcional | Fase 4 |
| D4 | **Pagar**: Supabase Pro + Small (~$30/mes) **antes de que klau tenga clientes reales** (copias diarias, sin pausa, ~4× CPU); Vercel Pro ($20/plaza) antes de vender tiendas | Sí a ambos cuando klau entre; no sube de Small sin datos que lo pidan. Al pasar a Pro hay que elegir Micro/Small explícitamente (sigue en Nano si no) | Fuera de este PRP |
| D5 | **G14** (sacar tablas internas de `public`, quitar `extensions` del `search_path`; cambio de configuración de Supabase) y **G13** (reordenar RLS del personal) | Más adelante, solo si tras R11 las reconstrucciones siguen dominando o entran más tiendas | Fuera de este PRP |

---

## 🧠 Aprendizajes (Self-Annealing)

> Crece durante la implementación. Hasta ahora, los del diagnóstico:

### 2026-10-28: La primera consulta pg_graphql de cada conexión y rol reconstruye el esquema
- **Error**: 57014 en el admin con consultas que en caliente cuestan 15–40 ms; `graphql.seq_schema_version` no se movía.
- **Fix**: no es DDL, es CPU: la reconstrucción cuesta ~37 000 bloques y ~200 ms (2–8 s con la Nano estrangulada) por conexión y rol. Sacar el arranque y las lecturas críticas de pg_graphql (REST/RPC) y agrupar el resto.
- **Aplicar en**: cualquier lectura nueva del admin: antes de añadir una query pg_graphql en una ruta caliente, preguntarse si cabe en el lote o en una RPC.

### 2026-10-28: `pathname` del servidor ≠ `pathname` del navegador bajo el rewrite por host
- **Error**: `PUBLIC_PATHS.includes(pathname)` nunca coincide en el servidor (`/s/{slug}/admin/login`), React deja la rama congelada sin error.
- **Fix**: decidir por segmento de layout (`useSelectedLayoutSegment`) o `endsWith`.
- **Aplicar en**: cualquier comparación de ruta en componentes bajo `/s/[storeSlug]`.

### 2026-10-28: Cualquier DDL, aunque se deshaga, invalida la caché de pg_graphql de todas las conexiones
- **Error**: `test:rls` crea tablas temporales y funciones por fichero (~190 subidas del contador por ejecución); `db:graphql-schema` también.
- **Fix**: helpers de test instalados una vez (G9) o tests fuera de producción (G3).
- **Aplicar en**: scripts que creen objetos temporales contra el proyecto de producción.

### 2026-10-28: La línea base «antes» mal medida (Fase 0)
- **Error**: el primer sondeo daba vistas de «0 ms»: la espera de 2 s empezaba antes de que `goto` terminase y la
  vista no había lanzado aún sus lecturas; además contaba como fallos los `ERR_ABORTED` de la vista anterior.
- **Fix**: la ventana de calma empieza al cargar el documento, se sigue esperando mientras haya «Cargando…» en
  pantalla y se ignoran los abortos por navegación. Línea base buena: `perf-prod-antes.json` (mediana 4,4 s, p95
  20,9 s, Inicio 33,8 s: más de 30 s sin ninguna petición en curso en la primera carga).
- **Aplicar en**: cualquier medición de una SPA: «sin peticiones durante N s» no significa «cargada».

### 2026-10-28: Desviaciones del plan, decididas al mapear el código
- **T1** (segmento de layout) → se usa el helper que ya existía (`useStorePathname` en `lib/navigation.tsx`, que quita
  `/s/{slug}`) en `AdminShell` y en todas las navegaciones del admin: corrige el login y además el desajuste de
  hidratación de todo el panel.
- **T6** (montar la vista mientras carga el marco) no es viable sin rehacer las páginas: todas leen `useAdmin()`, que
  necesita el estado del arranque. Con el arranque en una sola llamada REST el beneficio restante es pequeño.
- **G9** (tests sin DDL) descartado: dejaría `tests.create_user` y compañía instalados para siempre en producción; con
  D1 (Docker) `test:rls` solo pasa por producción una vez por migración.
- **T9** a medias: `fetchStoreCustomDomain` con límite de 3 s y `null` si falla (la tienda ya no da 500). Saltar la RPC
  del proxy cuando no hay dominios necesitaría una variable nueva en Vercel: ~~pendiente de Roberto~~ hecho
  (`KSHOP_CUSTOM_DOMAIN_REDIRECT=off`, ver abajo).
- **Campana**: `admin_bootstrap` trae `toConfirm`; con cada señal Realtime de pedidos se lee
  `admin_to_confirm` (un `count`), no `admin_home_summary` entero; ya no depende del `pathname`.
- **Heredoc + Node**: las secuencias \s y \b dentro de plantillas JS escritas en un heredoc acabaron como
  «s» y un carácter de control (backspace) en el código. Para editar código con expresiones regulares, usar Edit.

### 2026-10-28: Resultados en local (Fase 0b–6b)
- **Docker**: `supabase start` aplica las 59 migraciones; `test:rls` 644/644 en local y en producción. La Tienda Demo
  local se copió de producción (264 productos, 777 variantes, 168 pedidos; script en el scratchpad de la sesión,
  clientes no copiados). La semilla fallaba en una base vacía (USD sin activar): `seed-demo-store.mjs` lo activa.
- **Puertos**: el 3000 y el 3001 los ocupan otros proyectos de Roberto; en local se usó
  `NEXT_PUBLIC_PLATFORM_DOMAIN=kshop.localhost:3003` y `next dev --port 3003`.
- **`qa:admin-perf` en local (después)**: mediana 0,96 s, p95 2,8 s, 0 errores; 119 peticiones (antes 168) y 26 de
  pg_graphql (antes 66). Casi todas las vistas: `/me` (arranque completo) + un lote. No comparable en valor absoluto
  con la Nano; sí en número de peticiones y en la cadena de arranque.
- **Fase 1**: `/admin/login` abierto directo carga, responde, no pone credenciales en la URL y entra al panel;
  `/admin/set-password` sin sesión dice «El enlace no es válido» y con la sesión del enlace muestra el formulario.
- **G14 medido y descartado**: reconstrucción en frío de `{ __typename }` (mediana de 5 conexiones nuevas, local):
  anon 113 → 106 ms (−6 %), authenticated 132 → 107 ms (−19 %) quitando `extensions` del `search_path`. No llega al
  −30 % exigido y tocaría la configuración de Supabase en producción. Las 73 tablas de `public` ya tienen políticas y
  permisos recortados (ninguna interna expuesta). No se aplica.
- **Disco**: las imágenes de Supabase llenaron C: (0 bytes). Se borró la caché de build de Docker (23,7 GB), las
  imágenes viejas de Supabase y el grupo `backend-api` (con permiso de Roberto); el `ext4.vhdx` de Docker (98,6 GB) no
  encoge solo: compactarlo es manual y con permisos de administrador.

### 2026-10-28: Fase 5 (lecturas diarias a RPC)
- **Medición en producción tras el deploy** (`perf-prod-despues*.json`): mediana 4,4 s → 1,8–2,0 s; quedaban vistas de
  3–16 s por lotes de pg_graphql (Batch, CheckoutSettings, NotificationSettings, CatalogStructure).
- **Causa medida** (`graphql.resolve` como el dueño, conexión caliente frente a fría, sin DDL): las consultas cuestan
  11–47 ms; la primera de cada conexión cuesta 226–296 ms (reconstrucción del esquema). PostgREST cierra las
  conexiones ociosas, así que casi cada vista paga el peaje, multiplicado cuando la Nano está estrangulada.
- **Hecho**: `admin_orders`, `admin_order`, `admin_checkout_settings`, `admin_notification_log` (security invoker,
  `jsonb` con la forma exacta del resultado de pg_graphql; cursores = desplazamiento). Cliente `createAdminReads` en
  `@kshop/data` (límite de 12 s + un reintento) y `reads` en la sesión del admin. Los ajustes de pedidos se comparten
  60 s entre componentes (el detalle los leía dos veces). Inicio, Pedidos, detalle de pedido, Métodos de pago,
  Entregas y el registro de avisos quedan **sin ninguna petición a pg_graphql**.
- **Validación**: `scripts/compare-admin-reads.mjs` 14/14 idénticos con los 168 pedidos de la Demo (incluye filtro de
  estados, búsqueda y segunda página); `test:rls` 654/654 en prueba y en producción (test 15 nuevo); en el navegador,
  pestañas, búsqueda por número y nombre y «Ver más» hasta 142 de 142 sin repetidos.
- **Error**: medir con una tabla temporal (`create temp table`) es DDL y sube `graphql.seq_schema_version`: invalida la
  caché de pg_graphql de todas las conexiones. Medir con CTE `materialized` y `clock_timestamp()`.
- **Error**: el volcado del esquema desde el proyecto de prueba reordena cientos de líneas (otros OID):
  `db:graphql-schema` va siempre a producción.
- ~~Pendiente: Catálogo, Descuentos y Apariencia siguen en pg_graphql~~ → hecho, ver abajo.

### 2026-10-28: Todo el admin fuera de pg_graphql (decisión de Roberto)
- `20261108100500_admin_reads_all.sql`: `admin_customers`, `admin_catalog_structure`, `admin_products`,
  `admin_variant_search`, `admin_product`, `admin_promotions`, `admin_vouchers`, `admin_discount_targets`,
  `admin_content`, `admin_notification_settings`; `admin_orders` rehecha con búsqueda «número O nombre O teléfono»
  para Ctrl K. Comparador 35/35 idénticos con la Demo (incluye la paginación por `id` de `adminSearchProducts`: pg_graphql
  pagina una función por clave primaria, no por su `order by`). Test 16 (7 checks); RLS 661/661 en prueba y producción.
- La sesión del admin ya no crea cliente `graphql`; `asResult()` da `{ data, error }` como urql para no tocar el manejo
  de errores de cada pantalla. En el navegador (web local con datos de producción): 37 vistas, 0 peticiones a
  pg_graphql, 0 fallos; Ctrl K (pedido 1168 y productos), búsqueda de «Nuevo pedido» con variantes.
- **Error**: `select *` sobre `product_media` falla como `authenticated` (permiso por columna, `source_url` oculto).
  Se corrigió en el archivo de la migración (recién aplicada, sin uso) y se reaplicó solo esa función en los dos
  proyectos.
- El aviso de Next en desarrollo «Could not validate that a segment… instant navigation» sale en todas las vistas desde
  antes de R11: no es de este cambio.
- **Producción tras el deploy** (`perf-prod-todo-rpc.json`): mediana 4,4 s (antes de R11) → 2,0 (R11) → 2,3 (fase 5) →
  **1,45 s**; 0 peticiones a pg_graphql, 0 errores; 31 de 37 vistas por debajo de 2 s. Pico de 18,8 s en themes/home:
  en ese momento `/api/v1/me` tardó 11,6 s y las RPC 4–7 s, es decir, la Nano estrangulada (el día tuvo varias pasadas
  de `test:rls`, comparaciones y mediciones), no una lectura lenta.

### 2026-10-28: Tienda pública fuera de pg_graphql y extensión quitada (Roberto: «quitaría el graphql»)
- **T9**: `KSHOP_CUSTOM_DOMAIN_REDIRECT=off` en Vercel (la puso Roberto, guiado: Claude no tiene acceso a Vercel). Quitarla
  antes del primer dominio propio activo (`AGENTS.md`).
- **Arranque del admin guardado** (web y app): el último `/me` por usuario y tienda, 24 h, en localStorage
  (`kshop.admin.*`, se borra al cerrar sesión); el panel se pinta al instante y `/me` lo reemplaza.
- **Equipo**: `store_team` (miembros con su email en una consulta) en vez de listar todas las cuentas de Auth.
- **Pantallas de 1–2 s que no eran pg_graphql**: las RPC de Finanzas, Inicio, ventas de hoy, almacenes cuestan 1–34 ms
  calientes (368 ms la primera de Finanzas por conexión); el resto es Vercel en frío y la Nano. Sin cambio de código.
- **Tienda**: 16 funciones `sf_<operación>(p_vars jsonb)` con la forma exacta de cada documento de
  `storefront-queries.ts`/`queries.ts` (36/36 con `scripts/compare-storefront-reads.mjs`, como anon); `createGraphqlClient`
  manda cada operación a su función, así que `storefront-reads.ts` (precios, promociones, stock) no cambió. Órdenes y
  filtros dinámicos con lista cerrada (`private.sf_order_key`). Páginas de producción (pg_graphql) y local (RPC) con el
  mismo texto y el mismo sitemap (271 URLs); producción fallaba en `/products?page=3&sort=price-desc` y local no.
- **pg_graphql quitado de producción** tras ver 0 llamadas a `/graphql/v1` después del deploy y ninguna APK publicada.
  Se conserva en el proyecto de prueba (comparadores, `db:graphql-schema`). Tests 02–04 rehechos sin `graphql.resolve`.
- **Medición final en producción** (`perf-prod-sin-graphql.json`): admin mediana **1,05 s**, p95 2,2 s, máx. 8,0 s,
  0 errores (al empezar: 4,4 s, 20,9 s y 33,8 s); tienda 1,2–1,9 s por página.
- **Errores**: el cuerpo de una sola petición a la Management API con toda la Demo da 413 (copiar por tablas y en
  trozos); pasar a una función de tipo fila una fila con una columna de más (`rn`) no es ese tipo (pasar la fila
  entera: `select p as prod, row_number()…`).

---

## Gotchas

- [ ] Abortar en el cliente **no** cancela la consulta en Postgres: no reintentar tras un aborto propio, y el timeout debe ser mayor que el `statement_timeout` (8 s) para no duplicar carga.
- [ ] **No** alargar `cacheLife("minutes")` de `stores`, `entitlements` ni `storefront/data`: la suspensión diaria desde la BD y los banners programados dependen de ese minuto.
- [ ] `getClaims` requiere claves asimétricas (el proyecto ya firma ES256); comprobar la versión de supabase-js y que el JWKS se cachea en el proceso (Vercel: una vez por instancia).
- [ ] `admin_bootstrap` y `api_guard` viven en `public` (PostgREST solo expone `public`): `revoke` de anon (y de authenticated en `api_guard`). *(pg_graphql ya no existe en producción; `db:graphql-schema && codegen` solo si cambia un documento GraphQL.)*
- [ ] Medir siempre con rondas alternadas antes/después: la Nano queda estrangulada varios minutos tras tests, imports o builds (R9/R10).
- [ ] `pnpm dev` puede servir código viejo tras cambios en `packages/*` (memoria): reiniciar antes de dar por «imposible» un fallo de E2E.
- [ ] `test:rls` y `e2e:*` crean carga y DDL en producción: correrlos en serie, con WhatsApp en «Simulado», y nunca mientras Roberto usa el admin (G2).
- [ ] El `<form>` de login sin hidratar envía por GET: la corrección de la Fase 1 debe comprobar que no se filtran credenciales en la URL.
- [ ] Kshop Admin (`apps/admin-app`) comparte `packages/admin`: todo cambio del arranque se prueba también con `qa:apps` (Vite 5174).

## Anti-Patrones

- NO poner pings para «mantener caliente» pg_graphql: gastan CPU y calientan una sola conexión.
- NO subir el `statement_timeout`: solo alarga la cola.
- NO desactivar los disparadores de pg_graphql ni tocar su caché.
- NO partir un lote fallido en N peticiones en paralelo.
- NO reintentar sin límite ni sin espera aleatoria; nunca más de un reintento por lectura.
- NO lógica en Server Actions ni `next/*` en `packages/*`; el arranque va por `/api/v1` con Bearer (apps móviles).
- NO exponer el precio de costo en `admin_bootstrap` ni en ninguna RPC nueva de lectura.
- NO crear abstracciones nuevas (p. ej. un «data layer» genérico) para esto: se corrigen las piezas que existen.

---

## Pendiente tras R11 (2026-10-28)

| Qué | Quién | Cuándo |
|-----|-------|--------|
| Fase 7: 24 h de logs de Supabase (57014) y de `/api/v1` (500 pasajeros vistos tras el primer deploy) | Claude | Desde el 2026-10-29, con uso normal |
| Revisar juntos admin y tienda (Demo y klau) y dar feedback menor | Roberto + Claude | Próxima sesión |
| Revisar el panel del superadmin → **PRP R12** (`prp-r12-superadmin-v3.md`, preguntas respondidas 2026-10-28) | Roberto + Claude | En curso |
| Volver WhatsApp a «Real» (sigue en «Simulado» por decisión de Roberto) | Roberto | Cuando lo decida |
| Borrar `KSHOP_CUSTOM_DOMAIN_REDIRECT` en Vercel y redesplegar | Roberto (guiado) | Antes del primer dominio propio activo |
| ~~Compactar el `ext4.vhdx` de Docker (91,9 GB)~~ **Hecho por Roberto (2026-10-28)** | Roberto | — |
| D4: pagar Supabase Pro + Small | Roberto | Si con uso normal siguen picos de varios segundos (Nano sin créditos) o cuando entren clientes reales de klau |

---

*PRP aprobado el 2026-10-28. Orden de ejecución: 0 → 0b → 1 → 2 → 3 → 4 → 5 → 6 → 6b → 6c → 7.*
