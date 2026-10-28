# Lecturas de la tienda pública: por qué se hundía la base (R9, 2026-10-27)

Roberto preguntó por qué la instancia de Supabase «tiene ese problema» y eligió optimizar el código (opción B) en vez
de subir la instancia. Diagnóstico y decisiones en `.titan/plans/prp-r9-lecturas-tienda.md`.

## Lo que se midió (Tienda Demo, 264 productos)
- En reposo cada consulta de la tienda cuesta **1–20 ms en la base**; `storefront_product_counts` 177 ms. No había una
  consulta lenta: había demasiadas, en serie, y con recorridos completos del catálogo.
- `pg_stat_statements`: las dos sentencias de pg_graphql suman el 85 % de la CPU registrada (media 377 y 627 ms,
  máximo 7,6 s) porque llegan a la vez durante builds, QA y pedidos seguidos y se encolan en la CPU compartida de la
  **Nano**. Tras una tanda de tests o un build la instancia queda **estrangulada** varios minutos: las mismas consultas
  tardan 5× (Home de 250 ms pasó a 1,3 s) con la base ociosa. Medir siempre alternando antes/después.
- Portada en frío: antes 4 tandas en serie (~10 consultas; cada carrusel ejecutaba `storefront_search_products` dos
  veces por el `totalCount`); después 2 tandas y 7 consultas. Alternando rondas: pared 4,2 s → 1,7 s, base de datos
  4,3 s → 2,1 s por portada (con la Nano estrangulada; en reposo es mucho menos).

## Decisiones
- Carruseles de «todo», categoría, marca y oferta: `productsCollection` con filtro/orden/`first` (índices); solo las
  colecciones usan la función de búsqueda, sin `totalCount`. La subcategoría sale de las categorías del shell cacheado.
- `storefront_product_counts(p_store_id, p_category_ids, p_collection_ids)`: solo los cuadros que se muestran.
- Un pedido que agota o repone stock hace `revalidateTag(tag, "max")` (sirve lo cacheado, refresca detrás); las
  ediciones del admin siguen expirando al momento (`invalidateCatalog`).
- `getCarousel` cacheado en `apps/web` para relacionados de la ficha y portada de respaldo.

## Deuda resuelta en R10 (2026-10-27, `prp-r10-deuda-lecturas.md`)
- RLS de `products` y sus 8 tablas hijas: ya no llaman una función por fila; usan `product_id in (select
  private.public_product_ids())` (y `public_variant_ids`, `public_store_ids`), subconsultas sin correlación que
  Postgres convierte en un subplan hash construido **una vez por consulta** (también una vez por colección anidada
  de pg_graphql, no por producto). 777 variantes de la Demo como anon: 16–101 ms y 3 968 bloques → **3,9 ms y
  919 bloques**. Coste nuevo: una pasada por los productos publicados de toda la plataforma por consulta (hoy 255
  ids); si algún día son cientos de miles, repensar (p. ej. ids por tienda). Mismas reglas de visibilidad; 598 tests.
- `storefront_product_facets`: calcula los ids una vez y solo vuelve a buscar para un atributo con valor
  seleccionado, para el precio si hay filtro de precio y para las marcas si hay filtro de marca. Sin filtros:
  **267 ms y 23 563 bloques → 36 ms y 3 205 bloques**.
- `hasModule` (API): `getStoreModules` con `"use cache"` por tienda (`entitlements:{storeId}`, `cacheLife("minutes")`);
  `expireStoreCaches` la expira en cada cambio de plan, add-on, grant o estado. Cambios hechos **por SQL directo**
  (o el job diario) tardan hasta ≈ 1 min en verse en la API, como el `stores` cacheado; la BD sigue comprobando
  `private.store_has_module` en las escrituras críticas. Los `e2e:*` deben conceder módulos por la API del superadmin
  (así lo hace ya `e2e-catalog.mjs`), no por `set_store_module_grant` a mano.
- `storefront_features`: medida en 2,7 ms (no 10–13) y va en el shell cacheado; se deja.

## Admin: 57014 en todo el panel (2026-10-28)
- Roberto vio 57014 en muchas lecturas del admin de `klau` (Apariencia, ficha de producto). Medido: dentro de la base las
  mismas consultas van en 15–40 ms en caliente, pero la **primera consulta pg_graphql de cada conexión** reconstruye el
  esquema (hasta 2,4 s en la Nano), y PostgREST reparte las peticiones entre conexiones. Una pantalla lanzaba 2–6
  lecturas separadas: con la Nano estrangulada (créditos de CPU agotados tras tests + import + benchmarks) llegaron a
  17 s y 5 de 6 cayeron por 57014. El contador de esquema de pg_graphql (`graphql.seq_schema_version`) no se movía:
  no es DDL, es CPU.
- **Fix en código**: `packages/data/src/graphql-batch.ts` (`batch: true` en la sesión del admin y Kshop Admin): las
  consultas que una pantalla lanza en el mismo momento (ventana de 8 ms) salen como UNA operación GraphQL (alias,
  variables y fragmentos con prefijo `b{i}_`) y la respuesta se reparte; errores GraphQL → se reenvían una a una;
  idénticas → una vez. Probado con las 6 lecturas reales: resultado idéntico 6/6; una fusionada 1,3–3 s frente a
  2,6–6,9 s separadas (Nano estrangulada).
- La causa de fondo sigue siendo la instancia: el proyecto **no tiene add-on de cómputo** (Nano). Roberto decide subir.

## Build de Vercel sin lecturas de tienda (2026-10-28, `8bc17e7`)
- El deploy falló en `/s/[storeSlug]/brand/[slug]`: con la Nano estrangulada, las lecturas anon del build (shell,
  productos, portada de cada tienda × cada ruta × hasta 20 slugs) pasaban de 8 s (57014). Ahora `listStoreSlugs()`
  devuelve `[]` durante `next build` y el slug comodín `_` se responde sin consultar: **ninguna página de tienda se
  prerenderiza**; se renderiza en su primera visita y queda en caché. Build local: 139 páginas en 9 s.
- Coste: la primera visita a cada página tras un deploy paga la lectura en frío (medido con la Nano estrangulada:
  portada de klau 500 a los 14,5 s la primera vez, 5,6 s la segunda). Se arregla con la instancia, no con el build.

## Pendiente
- Subir la instancia cuando entren tiendas reales (klauShop): la Nano se estrangula con cualquier ráfaga.
  **Matizado el 2026-10-28** (`2026-10-28-diagnostico-rendimiento.md`): la causa dominante es el peaje de esquema de
  pg_graphql por conexión más las ráfagas del propio desarrollo; subir la instancia se recomienda por copias de
  seguridad y uso real, no como arreglo. Plan de código en `prp-r11-rendimiento-admin.md`.
