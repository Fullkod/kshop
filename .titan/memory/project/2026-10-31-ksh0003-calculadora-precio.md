# KSH0003 — calculadora de costo y precio, y teléfonos a la cubana (2026-10-31)

Tarea de Tasknic **KSH0003** (Roberto): las compras son al por mayor («una bolsa de 160 caramelos costó tanto») y la
tienda necesita saber el costo de uno y sumarle su margen comercial para fijar el precio. Opcional: se usa o no al
crear o editar el producto. En la misma sesión Roberto pidió además mostrar los teléfonos con la separación de Cuba.

## Qué se hizo
- **Calculadora** en el editor de producto (web y Kshop Admin, `packages/admin/src/catalog/PriceCalculatorDialog.tsx`):
  botón «Calcular» junto al costo de cada variante y «Calcular costo y precio para todas» en la caja «Para todas las
  variantes»; solo quien ve costos. Diálogo (R13): pagaste (importe + moneda), por cuántas unidades, margen %,
  cómo se aplica (**sobre el costo**, por defecto: 100 al 30 % → 130; o **sobre el precio**: 100 al 30 % → 142,86,
  que es el «Margen» que enseña la fila) y redondeo hacia arriba (centavo, 1, 5, 10, 50 de la moneda base). Enseña el
  costo por unidad (y su valor en la moneda base si se compró en otra) y el precio de venta con el margen resultante
  sobre el precio; «Usar» rellena costo, moneda del costo y precio de la variante (o de todas) sin guardar.
  Un botón «?» junto a «Margen comercial» explica qué es el margen y la diferencia entre las dos formas (Roberto,
  2026-10-31: «que se explique»).
- **Core** (`packages/core/src/catalog/pricing.ts`): `unitCost(lotCost, units)` (al centavo, como `variant_costs`),
  `priceFromCost(cost, margin, basis, rounding)`, `MarginBasis`; `roundPrice` compartido con `convertFromBase`.
- **Teléfonos** (`packages/core/src/orders/phone.ts`): `formatPhone` agrupa los cubanos como se escriben aquí:
  `+53 5 256 4206` (móvil), `+53 7 838 3412` (La Habana), `+53 22 62 3456` (provincias con código de dos cifras);
  otros países, el E.164 tal cual. La búsqueda global y los usos de cupones mostraban el número en crudo: ya no.
  Los placeholders pasan a `5 123 4567`. `normalizePhone` lo entiende igual.
- **QA**: `pnpm qa:price-calculator` (23 checks, capturas en `.titan/qa/ksh0003-calculadora/`); tests en core.

## Supuestos que Roberto puede corregir
- El margen por defecto es «sobre el costo» (lo que dice la tarea: «agregarle el margen»). Cambiarlo es una línea
  (`useState<MarginBasis>("cost")`).
- Los teléfonos siguen llevando `+53` delante; si prefiere verlos sin prefijo dentro de Cuba, es solo `formatPhone`.
- El «Margen» de la fila de cada variante sigue siendo sobre el precio (como antes).
