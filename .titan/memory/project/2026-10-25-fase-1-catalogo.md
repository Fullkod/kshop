# Fase 1 — catálogo (en curso, 2026-10-25)

PRP con progreso y pendientes exactos: `.titan/plans/prp-fase-1-catalogo.md` (sección «Progreso»).
Estado al cerrar la sesión: 1.1–1.6 hechas, Excel hecho en API; falta la pantalla de importar/exportar,
las partes Pro del editor (stock por almacén, precios por moneda) y la validación final.

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
  (`use-catalog.ts`, componentes). Imágenes: `apps/web/src/lib/images.ts` (WebP 1600/480 en el navegador).
- Pruebas: `pnpm test:rls` (122), `pnpm e2e:catalog` (30, tiendas temporales), `pnpm e2e:excel` (18, Tienda Demo).

## Datos que hay en la Tienda Demo
Atributos Talla/Color/Material, tipos Ropa y Accesorios, categorías Mujer › Vestidos, Mujer › Blusas,
Complementos, marca Kaya, colección Novedades, tasa USD = 300 CUP, «Vestido Ñandú» (6 variantes con imágenes)
y las blusas «Blusa Excel NN …» de las pruebas de Excel.

## Para Roberto
- La protección de contraseñas filtradas (HaveIBeenPwned) de Supabase Auth requiere el plan Pro de Supabase.
