# PRP: R10 · Deuda medida en R9 (RLS por fila, facetas, entitlements)

> **Estado**: HECHO (2026-10-27), pendiente de la revisión de Roberto. Roberto dijo «continúa» tras el primer con
> la lista de R9; las cuatro deudas son técnicas (sin decisiones de producto), así que se midieron, se implementaron
> y él revisa al final, como R8 y R9.
> **Sigue a**: `prp-r9-lecturas-tienda.md` («Lo que queda»). Memoria: `project/lecturas-tienda-r9.md`.

## Diagnóstico (medido el 2026-10-27 en la Tienda Demo, 264 productos / 777 variantes, como `anon`, EXPLAIN ANALYZE)

| Lectura | Hoy | Causa |
|---------|-----|-------|
| 777 variantes de la tienda | 16 ms caliente, 101 ms fría; **3 968 bloques** | `private.product_is_public(product_id)` por fila: función `security definer` que lee `products` y `stores` 777 veces |
| Listado de 24 productos con variantes y precios anidados | 9,2 ms | Lo mismo por cada variante y cada precio (`variant_is_public`: 3 tablas por fila) |
| `storefront_product_facets` sin filtros | **267 ms, 23 563 bloques** | Recorre el catálogo (`storefront_product_ids`, 13 ms) 6 veces: una por atributo filtrable (3) + total + precio + marcas, y lee `variant_attribute_values` con la RLS por fila |
| `store_entitlements` (cada llamada a la API con `requireModule`) | 4,8 ms, 746 bloques | 14 módulos × `store_has_module`; se repite en cada petición (7 322 llamadas en `pg_stat_statements`) |
| `storefront_features` | 2,7 ms | Va en el shell cacheado por tienda; **no compensa tocarla** |

Alternativa probada en una transacción con rollback (misma Demo, mismo `anon`):

| Lectura | Hoy | Con ids públicos en un subplan hash |
|---------|-----|-------------------------------------|
| 777 variantes | 16 ms, 3 968 bloques | **2,9 ms, 531 bloques** |
| Listado anidado de 24 productos | 9,2 ms | 7,7 ms (el hash se construye una vez por consulta, `loops=1`, no por producto) |

## Decisiones técnicas
| # | Decisión | Por qué |
|---|----------|---------|
| T1 | Las políticas de lectura de `products` y sus 8 tablas hijas pasan de una función por fila a `product_id in (select private.public_product_ids())` (o `variant_id in (select private.public_variant_ids())`, `store_id in (select private.public_store_ids())`): subconsultas **sin correlación** que Postgres convierte en un subplan hash construido **una vez por consulta** | Es el patrón de Supabase para RLS (`in (select …)`); el coste pasa de «por fila leída» a «una pasada por los productos publicados de la plataforma» (hoy 255 ids, ~1 ms). Con 10 000 productos serán unos ms por consulta, aún muy por debajo de la versión por fila en cualquier lectura de más de unas decenas de filas |
| T2 | Mismas reglas de visibilidad: producto publicado de tienda activa; staff y superadmin ven todo. Se eliminan `product_is_public` y `variant_is_public` (nadie más las usa) | Los tests de aislamiento (`02`, `03`, `11`) son la prueba |
| T3 | `storefront_product_facets` calcula los ids una sola vez; solo vuelve a buscar para un atributo **que tiene valor seleccionado** (ignorando su propio filtro), para el precio **si hay filtro de precio** y para las marcas **si hay filtro de marca** | Mismo resultado; sin filtros pasa de 6 recorridos a 1 |
| T4 | `hasModule` (API) lee los módulos activos de la tienda con `"use cache"` por tienda (`entitlements:{storeId}`, `cacheLife("minutes")`), y `expireStoreCaches` (cambio de plan, add-on, grant, estado) expira la etiqueta | La BD sigue siendo la verdad para las escrituras críticas (`private.store_has_module`); la suspensión diaria desde la BD llega en ≈ 1 min como el `stores` cacheado |
| T5 | La ruta de stock usa `requireModule` en vez de llamar a `store_entitlements` a mano | Una sola vía |
| T6 | `storefront_features` se deja como está | 2,7 ms y cacheada con el shell |

## Fases
### 1. Base de datos — `20261106100500_storefront_rls_hashed_and_facets.sql`
- `private.public_store_ids()`, `private.public_product_ids()`, `private.public_variant_ids()` (security definer,
  solo lectura, `grant execute` a anon/authenticated/service_role).
- Recrear las 9 políticas de lectura; `drop function private.product_is_public, private.variant_is_public`.
- `create or replace function public.storefront_product_facets` (misma firma; pg_graphql no cambia).
- Verificar: `pnpm test:rls`; `pnpm db:graphql-schema && pnpm codegen` (sin diff esperado).

### 2. `apps/web` — entitlements cacheados
- `server/auth.ts`: `getStoreModules(storeId)` con `"use cache"` + `entitlementsCacheTag`; `hasModule` lo usa.
- `server/billing/index.ts`: `expireStoreCaches` expira también `entitlements:{id}`.
- `api/v1/stores/[storeId]/catalog/stock/route.ts`: `requireModule(storeId, "multi_warehouse")`.

### 3. Verificación
- EXPLAIN ANALYZE antes/después (variantes, listado anidado, facetas).
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:rls`.
- `e2e:catalog` y `e2e:billing` con `pnpm dev` (WhatsApp en «Simulado» antes, «Real» después).

## Resultado (2026-10-27)
| Lectura (anon, Demo, EXPLAIN ANALYZE) | Antes | Después |
|---|---|---|
| 777 variantes de la tienda | 16 ms caliente / 101 ms fría, 3 968 bloques | **3,9 ms, 919 bloques** |
| Listado anidado de 24 productos (variantes + precios) | 9,2 ms | **6,1 ms** |
| `storefront_product_facets` sin filtros | 267 ms, 23 563 bloques | **36 ms, 3 205 bloques** |
| `store_entitlements` por llamada a la API | 4,8 ms + ida y vuelta | 0 (caché por tienda, un minuto) |

- RLS **598/598**; `typecheck`, `lint`, `test` en verde; `db:graphql-schema` + `codegen` sin diff (misma firma).
- `e2e:catalog` **47/47** y `e2e:billing` **52/52** con `pnpm dev` (WhatsApp en «Simulado» y de vuelta a «Real»).
  `e2e-catalog.mjs` ahora concede el módulo de apariencia por `PUT /platform/stores/{id}/subscription/module-grants`
  con un superadmin temporal (antes llamaba a `set_store_module_grant` por SQL y la caché nueva no se enteraba).
- Portada, listado, listado filtrado y búsqueda de la Demo responden 200 con facetas en el dev server.

## Aprendizajes
- Una subconsulta **sin correlación** en una política (`col in (select fn())`) se ejecuta una vez por consulta aunque
  esté dentro de una colección anidada de pg_graphql (`loops=1` en el plan); una correlacionada (`fn(col)` o
  `(select fn(col))`) se ejecuta por fila. Es la diferencia entre 3 968 y 531 bloques en la misma lectura.
- Con la Nano, medir siempre con rondas alternadas: la primera ejecución de una función tras los tests cuesta hasta 6×.
