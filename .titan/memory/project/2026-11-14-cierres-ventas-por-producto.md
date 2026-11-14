# Ventas de un cierre y búsqueda por producto (2026-11-14) — KSH0024

Pedido de Minimercado: al revisar el cierre del día no sabían qué pedidos llevaban un producto. Decisiones de Roberto:
«Ver cierres anteriores» sí; lo ve quien ya ve los cierres (costos solo dueño/admin); búsqueda en todos los cierres
incluida. Plan y detalle en `.titan/plans/prp-cierres-ventas-por-producto.md`.

- Pantallas: `/admin/pos/closings/:id?q=` (`PosClosingSales`) y `/admin/pos/closings/search?product=`
  (`PosProductSales`), en Kshop Admin y en la web; lecturas `admin_pos_closing_sales`, `admin_pos_product_sales` y
  `admin_pos_closings(..., p_before)` (migración `20261108103100_closing_sales`).
- «Atrás» conserva filtro, páginas y scroll con `packages/admin/src/pos/screen-memory.ts`; en la web el pedido
  abierto desde un cierre lleva `?from=` y el «Volver» del teléfono vuelve ahí.
- `pnpm qa:closing-sales` (Tienda Demo de prueba, solo lectura).
- En producción 2026-11-14: migración + `test:rls` 913/913, web `99ba868` y Kshop Admin 1.0.33 publicado (borrada
  la 1.0.32). Minimercado lo probó y funciona (Roberto, 2026-11-14).
- En la misma tarea: manuales por plan descargables en Ayuda (Kshop Admin 1.0.34) y ayuda pública en
  `kshop.fullkod.com/help` (ver `2026-11-08-guias-por-plan.md` y `2026-11-01-ksh0005-ayuda.md`).
