# Fase 1 — catálogo (CERRADA, 2026-10-25)

PRP con progreso y pendientes exactos: `.titan/plans/prp-fase-1-catalogo.md` (sección «Progreso»).
Estado: cerrada (commits hasta `d6f1507`), incluidas las imágenes por URL del Excel (sharp en el servidor,
`server/catalog/remote-images.ts`, `product_media.source_url` privada) y la prueba de 1 000 filas
(`pnpm e2e:excel-load`).

## Decisiones confirmadas por Roberto (2026-10-25)
- PRP aprobado tal cual (D1–D13). Límite de productos: Base = 300 (provisional), Pro sin límite.
- Tienda de pruebas permanente: ver `tienda-demo.md`.

## Dónde está cada cosa
- BD: `supabase/migrations/20261025*.sql` — esquema (FK compuestas `(store_id, id)`, costo en `variant_costs`,
  `stock_available` y resumen del producto por trigger, guardas de módulo/límite en triggers), funciones
  `save_product`, `set_stock_quantity`, `set_store_currency`, `set_products_status`, `reorder_catalog`,
  `admin_search_products` (estado como `text`), `import_product`; `import_jobs`/`import_job_rows`, bucket
  privado `store-imports`. Tests: `supabase/tests/02_catalog_isolation.test.sql`.
- Core: `packages/core/src/catalog/` (Zod, matriz de variantes, SKU, precios/margen, layout del Excel).
- Data: `packages/data/src/catalog-queries.ts` (estructura, listado, detalle) + `api.catalog(storeId)`.
- API: `apps/web/src/app/api/v1/stores/[storeId]/catalog/` — `[resource]` genérico (registro en
  `server/catalog/resources.ts`), `products`, `stock`, `currencies`, `reorder`, `excel/{template,export}`,
  `imports` y `imports/[jobId]/run`. Errores de Postgres → `server/db-errors.ts`.
- Admin: `apps/web/src/app/s/[storeSlug]/admin/catalog/` + `apps/web/src/features/catalog/`
  (`use-catalog.ts`, componentes). Editor: precios por moneda (`multi_currency`) y stock por almacén
  (`multi_warehouse`, vía `PUT stock` al guardar). Excel: `admin/excel-import/` +
  `features/excel-import/components/ExcelImportPage.tsx`; cliente `api.catalog(id).excelTemplate/
  excelExport/createImport/runImport`. Imágenes: `apps/web/src/lib/images.ts` (WebP 1600/480 en el navegador).
- Pruebas: `pnpm test:rls` (123), `pnpm e2e:catalog` (30, tiendas temporales), `pnpm e2e:excel` (22, Tienda Demo),
  `pnpm e2e:excel-load` (1 000 filas, borra lo creado).

## Datos que hay en la Tienda Demo
Atributos Talla/Color/Material, tipos Ropa y Accesorios, categorías Mujer › Vestidos, Mujer › Blusas,
Complementos, marca Kaya, colección Novedades, tasa USD = 300 CUP, «Vestido Ñandú» (6 variantes con imágenes)
y las blusas «Blusa Excel NN …» de las pruebas de Excel. Desde el cierre: USD a la venta, almacén «Tienda Centro»,
9,50 USD en VESTIDO-NANDU-S-ROJO (7 uds. en Tienda Centro) y las faldas «Falda UI N …» (categoría Mujer › Faldas).

## Para Roberto
- La protección de contraseñas filtradas (HaveIBeenPwned) de Supabase Auth requiere el plan Pro de Supabase.
