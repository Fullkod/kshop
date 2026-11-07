# KSH0015: venta por peso y medida (2026-11-07)

Pedido de Minimercado (jamón lasqueado, arroz, azúcar por libra). Plan y estado por fase:
`.titan/plans/prp-venta-por-peso.md`. Decisiones de Roberto: todas las unidades, 2 decimales, unidad en el producto,
tienda online con paso y cantidad a mano, «Por importe» solo en la caja, lo pesado de más se cobra cambiando el precio
de la línea (KSH0011), sacos después.

## Dónde está cada pieza
- **Core:** `packages/core/src/catalog/units.ts` — `SALE_UNITS`/`SALE_UNIT_INFO`, `parseQuantity` (coma o punto),
  `formatQuantity` («1,5 lb», «3»), `lineTotal` (= `round(precio × cantidad, 2)` de la BD, en centésimas enteras),
  `quantityError`, `quantityStep`, `countedQuantity` (una línea pesada cuenta 1), `quantityValueSchema` (Zod de
  cantidades en peticiones), `saleUnitFromLabel` (Excel).
- **BD:** `supabase/migrations/20261108102500_sale_units.sql` — `products.sale_unit` / `quantity_step`,
  `order_lines.unit`, todas las cantidades a `numeric(12,2)`, helpers `private.quantity_ok`, `counted_quantity`,
  `quantity_text`; checkout, caja, precios, cupones, stock, traspasos, Excel, WhatsApp y lecturas parcheados.
  Las lecturas devuelven `stockAvailable`/`quantity` como texto (BigFloat de pg_graphql) → `Number()` al usarlos.
  Test: `supabase/tests/24_sale_units.test.sql`.
- **UI:** `QuantityInput` en `@kshop/ui` (texto con `inputMode`, nunca `type="number"`); editor de producto («Se vende
  por», paso), Nuevo pedido, traspasos, `PosQuantityInput` en `PosScreen.tsx` («Por importe»), ficha/tarjeta/carrito de
  la tienda. Guía de ayuda `sell-by-weight`.
- **Compatibilidad:** apps viejas mandan enteros y sin `unit`; el servidor toma la unidad del producto.

## Estado (2026-11-07)
- **En producción:** migraciones `20261108102500` y `20261108102600` (ganancia del cierre), web `0cc534c` (Vercel
  ok), Kshop Admin 1.0.25 publicado directo (sin pasar por Superadmin, a pedido de Roberto; se borró la 1.0.24).
- Apps de tienda publicadas directo el mismo día: Minimercado 1.0.26, Klau's Shop 1.0.27, Tienda Demo 1.0.28.
- Falta (KSH0020): QA en navegador, `test:rls` en producción, `help:shots` + `help:pdf`.

## Ojo
- Publicar un APK sin el botón: `app:publish` lo sube oculto; luego `published = true` y borrar las versiones
  menores de ese `app_id` (registro y archivo de `store-apps`), lo mismo que `setAppBuildPublished`.
- `products` da SELECT por columnas: toda columna nueva necesita su `grant select (…)`.
