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

## Pendiente (medido, no hecho)
- RLS por fila de variantes/precios/valores (`product_is_public`, `variant_is_public`): 3 tablas por fila.
- `storefront_product_facets` recorre el catálogo una vez por atributo filtrable.
- `hasModule` → `store_entitlements` en cada llamada a la API (7 322 llamadas, 13 ms); cacheable por tienda.
- `storefront_features` (10–13 ms) en cada shell.
- Subir la instancia cuando entren tiendas reales (klauShop): la Nano se estrangula con cualquier ráfaga.
