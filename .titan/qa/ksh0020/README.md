# KSH0020 — QA de venta por peso (2026-11-13)

Base de prueba, `next dev` en 3210 y Kshop Admin en 5174, WhatsApp en `dry_run`.

- `qa:pos` 35/35, `qa:orders` 14/14, `qa:pos-offline` 36/36 (no usan productos por peso).
- Prueba con un producto marcado «lb» un momento (Blusa Excel 01 1I8Z, devuelto a «unidad»), a 390 px:
  caja web con 1,5 → línea `1.50 lb`, 1210 × 1,5 = 1815 CUP (`pos-lb-ticket.png`); pedido «1,5 lb × 1210 CUP / lb»
  (`order-lb-mobile.png`); Finanzas › Margen por producto «1,5 lb» (`finance-margin-lb.png`); Inventario con
  «4 lb» y «+ 3 productos por peso o medida» (`finance-inventory-mobile.png`); la pestaña Cierres abre con la ganancia
  (`pos-lb-closings.png`). La venta se canceló y el stock volvió a 4.
