# Ventas de un cierre y búsqueda por producto (2026-11-14)

Pedido de Minimercado: al revisar el cierre del día no sabían qué pedidos llevaban un producto. Decisiones de Roberto:
«Ver cierres anteriores» sí; lo ve quien ya ve los cierres (costos solo dueño/admin); búsqueda en todos los cierres
incluida. Plan y detalle en `.titan/plans/prp-cierres-ventas-por-producto.md`.

- Pantallas: `/admin/pos/closings/:id?q=` (`PosClosingSales`) y `/admin/pos/closings/search?product=`
  (`PosProductSales`), en Kshop Admin y en la web; lecturas `admin_pos_closing_sales`, `admin_pos_product_sales` y
  `admin_pos_closings(..., p_before)` (migración `20261108103100_closing_sales`).
- «Atrás» conserva filtro, páginas y scroll con `packages/admin/src/pos/screen-memory.ts`; en la web el pedido
  abierto desde un cierre lleva `?from=` y el «Volver» del teléfono vuelve ahí.
- `pnpm qa:closing-sales` (Tienda Demo de prueba, solo lectura).
- Estado: hecho y probado en el proyecto de prueba; **falta** migrar producción (+ `test:rls`), desplegar la web y
  publicar Kshop Admin, con permiso de Roberto.
