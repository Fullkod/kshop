# KSH0022 — Costo en la lista de productos (2026-11-13)

Base de prueba, `next dev` en 3210, Tienda Demo a 390 px (script temporal, restaura los costos al terminar):

- Dueño: columna «Costo» (deslizando la tabla), costo y margen de un producto de una variante (`costs-list-390.png`).
- Cambiar 2,5 → 2,75 USD y Enter guarda solo el costo; margen 25 % (`costs-saved-390.png`).
- Producto con 3 variantes: «Editar» abre el diálogo, cambiar una y vaciar otra guarda ambas y deja la tercera
  (`costs-dialog-390.png`); la celda avisa «1 sin costo».
- Empleado: sin columna; `PUT catalog/costs` → 403.
- `26_product_list_costs.test.sql` 9/9, `02_catalog` 69/69, `compare-admin-reads` 33/33.
