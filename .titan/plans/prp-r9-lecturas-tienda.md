# PRP: R9 · Lecturas de la tienda sin recorrer el catálogo

> **Estado**: HECHO (2026-10-27), pendiente de la revisión de Roberto. Roberto eligió la opción B («optimizar el
> código, no subir la instancia») y pidió arreglar la causa. Se implementó y él revisa al final, como R8.
> **Sigue a**: `prp-r8-superadmin-y-realtime.md` (build de Vercel con `57014`). Memoria: `project/pendiente-realtime.md`.

## Diagnóstico (medido el 2026-10-27, Tienda Demo: 264 productos, 777 variantes)

| Lectura | En la base (anon, caliente) | Ida y vuelta desde aquí |
|---------|-----------------------------|-------------------------|
| `storefront_features` | 10–13 ms | 400–600 ms |
| Secciones del inicio | 1 ms | 250 ms |
| `storefront_search_products` (sin filtro) | 17 ms (277 ms la primera vez por conexión) | 280 ms |
| `storefront_product_counts` | **177 ms**, 6 142 bloques | 370 ms |
| 8 fichas completas (variantes, promociones, precios) | 1–20 ms | 280 ms |

- `pg_stat_statements`: las dos sentencias de pg_graphql suman **5 050 s de los 5 900 s** de CPU registrados
  (11 350 llamadas, media 377 y 627 ms, máximo 7,6 s). En reposo cada una tarda 1–20 ms: la media alta es la cola que se
  forma cuando llegan decenas a la vez sobre la CPU compartida de la instancia Nano.
- **Causa real**: no hay una consulta lenta; hay demasiadas y mal repartidas.
  1. La portada en frío encadena **4 tandas** (secciones+shell → slugs+fichas del hero → conteos → productos de cada
     sección): ~10 consultas en serie, cada una con su ida y vuelta.
  2. Cada carrusel llama a `storefront_search_products`, que calcula **todos** los ids del catálogo (con la RLS por fila)
     y pg_graphql lo ejecuta **dos veces** (`totalCount` + filas) para quedarse con 8. Escala con el catálogo: con los
     miles de productos de klauShop serían cientos de ms por carrusel.
  3. `storefront_product_counts` cuenta **todas** las categorías (subconsulta por categoría) y **todas** las colecciones
     (reglas evaluadas producto a producto) aunque el inicio enseñe 4 cuadros.
  4. Cada pedido que agota una variante hace `revalidateTag(…, {expire: 0})` sobre toda la tienda: el siguiente
     visitante paga la portada en frío entera. Los avisos y QA crean pedidos seguidos → la tienda vive en frío.
  5. El build de Vercel lanzaba 7 workers × 2 páginas: con (1)–(3) eran 100+ consultas simultáneas → `57014`.

## Decisiones técnicas
| # | Decisión | Por qué |
|---|----------|---------|
| T1 | Los carruseles de «todo», categoría, marca y oferta leen `productsCollection` con filtro, orden y `first` (índices, sin `totalCount`); las colecciones siguen con la función de búsqueda pero sin `totalCount` | pg_graphql empuja filtro/orden/límite al SQL; la función no admite límite |
| T2 | La subcategoría se resuelve con las categorías del shell (ya cacheado) | Evita el `ltree` por fila de la función |
| T3 | `storefront_product_counts(p_store_id, p_category_ids, p_collection_ids)`: solo lo que se muestra, categorías en una pasada | Listas como texto separado por comas (pg_graphql 1.6 no expone arrays) |
| T4 | La portada queda en **2 tandas**: [secciones, shell] → [slugs, fichas del hero, conteos, productos de cada sección, destacado por id] en un solo `Promise.all` | Menos idas y vueltas |
| T5 | Un pedido que agota stock hace `revalidateTag(tag, "max")` (sirve lo cacheado y refresca en segundo plano) en vez de `{expire: 0}`; las ediciones del admin siguen expirando al momento | El checkout vuelve a validar stock en SQL; el comerciante sí espera ver su cambio al instante |
| T6 | Los relacionados de la ficha usan el mismo carrusel por categoría | Misma función de búsqueda, mismo coste |

## Fases
### 1. Base de datos — conteos solo de lo mostrado
- Migración `20261106100400_storefront_product_counts_for.sql` (firma nueva, una pasada por categorías).
- Tests en `11_home_v2_isolation` adaptados; `pnpm test:rls`; `pnpm db:graphql-schema && pnpm codegen`.

### 2. `@kshop/data` — carruseles por índice y portada en 2 tandas
- `StorefrontCarouselQuery` (`productsCollection`), `StorefrontCollectionCarouselQuery` (función sin `totalCount`),
  `StorefrontProductByIdQuery` (fragmento compartido con la ficha), `StorefrontProductCountsQuery` con ids.
- `fetchCarousel(gql, storeId, source, sort, limit, shell)`, `fetchProductById`, `fetchHome` reorganizado.

### 3. `apps/web` — cachés y refresco
- `getCarousel` cacheado; portada de respaldo y relacionados de la ficha lo usan.
- `refreshCatalog(storeId)` («max») en el checkout y en confirmar/cancelar pedidos.

### 4. Verificación
- Antes/después: consultas de pg_graphql por portada en frío (delta de `calls` en `pg_stat_statements`) y tiempo.
- `pnpm typecheck`, `lint`, `test`, `test:rls`; `qa:orders` (WhatsApp en «Simulado») y la portada en 1280/390.

## Resultado (2026-10-27)
- Portada en frío de la Demo, rondas alternadas antes/después (4 cada una) con la Nano estrangulada tras los tests:
  pared mediana **4,2 s → 1,7 s** (mínimos 2,5 s → 1,6 s), base de datos **4,3 s → 2,1 s por portada**, 8 → 7 consultas en
  2 tandas en vez de 4. Por consulta (tiempo de Supabase): carrusel «todo» 612 → 394 ms, «oferta» 416 → 204 ms,
  conteos 418 → 335 ms con la instancia estrangulada; en reposo cada una queda en 1–20 ms.
- **Estrangulamiento de la Nano**: con la base ociosa, tras una tanda de tests + benchmarks las mismas consultas tardan
  5× (Home 250 ms → 1,3 s). Es la CPU compartida agotando su margen; de ahí los `57014` del build. Medir siempre con
  rondas alternadas.
- RLS 598/598; typecheck, lint y tests en verde; evidencia en `.titan/qa/rediseno-v2/R9/` (portada 1280/390 con 12
  secciones, sin errores; barra lateral del admin con la tienda arriba y la tarjeta abajo fijas y solo el menú
  desplazándose, pedido de Roberto en esta pasada).
- Barra lateral (admin y superadmin): `SIDEBAR_NAV_CLASS` (`components/admin-content.ts`): el `nav` es el único que
  desplaza (`min-h-0 flex-1 overflow-y-auto`, scrollbar fina), el `aside` pasa a `overflow-hidden`.

## Lo que queda (no en esta pasada)
- `product_is_public`/`variant_is_public` por fila en la RLS de variantes, precios y valores: 3 tablas por fila.
- `storefront_product_facets` recorre el catálogo una vez por atributo filtrable.
- `hasModule` (`store_entitlements`) en cada llamada a la API: 7 322 llamadas, 13 ms; cacheable por tienda.
- `storefront_features` (10–13 ms) va en cada shell; podría ir en el `stores` cacheado.
