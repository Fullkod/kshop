# KSH0022 — Costo en Catálogo › Productos (2026-11-13)

Pedido de Leo: revisar y corregir los costos a diario sin abrir cada producto. Aprobado por Roberto tal cual:

- Columna «Costo» tras «Stock», solo dueño/admin (`seesCosts`), con «Margen N%» debajo; en el teléfono se llega
  deslizando la tabla. Una variante: se edita en la celda y se guarda al salir del campo o con Enter. Varias: rango o
  «Sin costo» / «N sin costo» y «Editar» abre un diálogo con todas (`packages/admin/src/catalog/ProductCosts.tsx`).
- Lectura: `admin_products` trae por variante `name`, `price`, `sortOrder` y `variantCosts` (security invoker: la RLS
  de `variant_costs` lo deja en null para el personal). Documento `AdminProductsQuery` actualizado.
- Escritura: `PUT /api/v1/stores/{id}/catalog/costs` (`requireCatalogAccess(..., "admin")`) → `public.set_variant_costs`
  (service_role, todo o nada, solo variantes de esa tienda, null borra). Cae en `catalog` de `SECTION_FREE_WRITES`.
- Migración `20261108102900_product_list_costs`; test `26_product_list_costs.test.sql`.
- Los productos publicados de otra tienda se leen en `admin_products` (son públicos), pero sin costos.
- En producción 2026-11-13: web `a92c9b8` y Kshop Admin 1.0.32 publicado (borradas 1.0.30 y 1.0.31).
