# PRP: Venta por peso y medida (KSH0015)

> **Estado**: EN PRODUCCIÓN 2026-11-07 (migración, web `0cc534c` y Kshop Admin 1.0.25). Lo pendiente está en KSH0020
> **Fecha**: 2026-11-07
> **Proyecto**: Kshop · Tasknic KSH0015

---

## Objetivo

Que una tienda venda productos por libra, kilo, litro, metro u otra unidad, con cantidades decimales (1,5 lb; 0,750 kg;
2,25 m): el precio es «por unidad de medida», y la cantidad decimal funciona igual en el carrito, el checkout, los
pedidos, la caja (también sin conexión) y el stock.

## Por qué

| Problema | Solución |
|----------|----------|
| Un minimercado (p. ej. `minimercado`) vende arroz, frijoles, queso o jamón al peso, y hoy Kshop solo admite cantidades enteras de 1 a 999. | Cada producto dice cómo se vende («unidad», «libra», «kilo»…). La cantidad pasa a ser decimal en todo el sistema. |
| Hoy se crean productos falsos («Arroz 1 lb», «Arroz ½ lb») y el stock no cuadra con lo que hay en el saco. | Un solo producto «Arroz» a 120 CUP/lb, con su stock en libras. |
| La caja tiene que cobrar 1,37 lb de queso tal como lo marca la pesa. | El teclado de la caja acepta decimales y calcula el importe y, con «Por importe», la cantidad a partir del importe. |

**Valor de negocio**: abre Kshop a bodegas, carnicerías, ferreterías (metro) y tiendas de telas, el grueso del comercio
de barrio en Cuba; cuadra el stock de lo que se vende suelto.

## Decisiones de Roberto (2026-11-07)

| # | Decisión |
|---|----------|
| D1 | **Todas las unidades** habituales (peso, volumen, longitud), no solo libra. |
| D2 | **Cualquier decimal** en la cantidad (lo que marque la pesa). Precisión en P2. |
| D3 | **Tienda online también**, no solo la caja. |
| D4 | **Los sacos (conversión de compra: «1 saco = 100 lb») van después**, en otro PRP. Este no la impide. |

## Respuestas de Roberto (2026-11-07)

- **P1 — Dónde vive la unidad:** en el **producto** («Se vende por» en el editor, igual para todas sus variantes).
  «Arroz suelto (lb)» y «Arroz paquete 5 lb (u)» son dos productos.
- **P2 — Precisión:** **2 decimales** (`numeric(12,2)`): 0,01 lb ≈ 4,5 g, 0,01 kg = 10 g. Más decimales se redondean al
  guardar. El importe de la línea se redondea a 2 decimales (`round(precio × cantidad, 2)`).
- **P3 — Lista de unidades:** la propuesta vale, fija en el código: unidad (u), libra (lb), onza (oz), kilogramo (kg),
  gramo (g), litro (L), mililitro (ml), galón (gal), metro (m), centímetro (cm), yarda (yd), pie (ft), metro cuadrado
  (m²). La **unidad** sigue siendo entera. Caja, docena, paquete… son «unidad» con otro nombre (fuera de este PRP).
- **P4 — Tienda online:** **paso** por producto (por defecto 0,5 para lb/kg/L/m, 100 para g/ml, 1 para la unidad) en el
  «− +» de la ficha y el carrito, **mínimo** igual al paso, y se puede escribir la cantidad a mano. En la caja no hay
  paso: vale lo que marque la pesa.
- **P5 — Por importe:** sí, **solo en la caja**: «Por importe» («dame 100 CUP de queso») calcula la cantidad = importe ÷
  precio redondeada a 2 decimales, y la línea cobra el importe exacto (precio de la línea ajustado como en KSH0011).
- **P6 — Lo pesado de verdad:** no se edita la cantidad de un pedido ya hecho; el personal cambia el **precio** de la
  línea (KSH0011) con una nota. Editar la cantidad (y ajustar el stock) queda para después.

## Qué

### Comportamiento esperado

**El dueño (Admin › Catálogo › producto)**
1. En el producto elige «Se vende por: Libra». El precio de cada variante se lee «120 CUP / lb» y el stock «35,5 lb».
2. Ajustar stock, transferir entre almacenes y el Excel (columna nueva «Unidad»; «Stock» con decimales) aceptan decimales.
3. Un producto que ya tiene ventas puede cambiar de unidad, con aviso: los pedidos viejos guardan la unidad con la que se vendieron.

**El cliente (tienda online y app de tienda)**
1. La tarjeta y la ficha muestran «120 CUP / lb». El selector de cantidad va de 0,5 en 0,5 lb (P4) o se escribe a mano.
2. El carrito, el checkout, la página del pedido y el mensaje de WhatsApp dicen «1,5 lb × 120 CUP = 180 CUP».
3. Si no hay bastante stock («Solo quedan 1,25 lb»), el mismo aviso que hoy, con la unidad.

**El cajero (caja web y Kshop Admin, también sin conexión)**
1. Toca «Queso gouda»: entra con la cantidad 1 del paso del producto y se abre el teclado de la cantidad (con coma decimal).
2. Escribe 1,37 (o «Por importe» 100 CUP, P5) y ve «1,37 lb × 650 = 890,50 CUP».
3. Sin conexión la venta se guarda igual en el teléfono y sube después; el stock del teléfono baja 1,37 lb.

**El dueño después**
- Pedidos, «Mostrador», detalle del pedido, cierre de caja y Finanzas muestran la cantidad con su unidad.
  Los totales «unidades vendidas» cuentan 1 por línea de un producto por medida (no suman libras con unidades), y el
  informe por producto da la cantidad en su unidad («42,5 lb»).

### Criterios de éxito
- [ ] Un producto «por libra» se vende con 1,5 lb en la tienda online, en la caja web y en Kshop Admin sin conexión, y en los tres el pedido guarda `quantity = 1.50`, `unit = 'lb'` y `line_total = round(precio × 1,5, 2)`.
- [ ] El stock baja exactamente la cantidad vendida (35,50 → 34,00) y vuelve al cancelar o anular; la reserva y la transferencia entre almacenes funcionan con decimales.
- [ ] Un producto «por unidad» sigue rechazando 1,5 en la API, en la BD y en la UI; los pedidos, carritos y ventas existentes no cambian (mismas cantidades, mismos totales).
- [ ] Un Kshop Admin y una app de tienda ya instalados (sin actualizar) siguen vendiendo productos por unidad contra el servidor nuevo.
- [ ] Cupones con «mínimo de productos», Finanzas e informes de stock dan cifras con sentido con productos por medida (una línea pesada cuenta como 1 producto).
- [ ] `pnpm test:rls`, los comparadores `admin_*`/`sf_*`, `typecheck`, `lint`, `test` y `build` pasan; e2e y QA en navegador con capturas en `.titan/qa/venta-por-peso/`.
- [ ] Ayuda: guía «Quiero vender por peso o medida» y las guías de caja, producto y stock actualizadas, con sus capturas y el PDF.

---

## Contexto

### Lo que hay hoy (investigado 2026-11-07)
- **Cantidades enteras en todas partes.** BD: `stocks.quantity`, `quantity_allocated`, `low_stock_threshold`,
  `stock_movements.quantity`, `inventory_reservations.quantity`, `cart_lines.quantity` y `order_lines.quantity`
  (`int`, 1–999), `product_variants.stock_available` (`int`, desnormalizado por trigger). Funciones con
  `(l ->> 'quantity')::int`: checkout y reservas (`20261029100300_pricing_engine.sql`, `20261101100100_warehouse_engine.sql`,
  `20261030100300_checkout_notify_customer.sql`), cupones (`min_quantity`, en `20261031100100_entitlements_engine.sql`),
  transferencias (1–99 999), caja (`pos_record_sale`, `pos_catalog` en `20261108101300_pos_module.sql` y
  `20261108101900_pos_price_change.sql`), Finanzas (`returns table (... quantity int)` en `20261101100400_finance_engine.sql`,
  `20261101100500_finance_rate_periods.sql`) y lectores Pro (`20261101100200_pro_readers.sql`).
- **TS:** `quantity: z...int()` en `packages/core/src/orders/schemas.ts` (`MAX_LINE_QUANTITY = 999`, carrito y pedido
  del admin), `packages/core/src/pos/index.ts` (venta de caja), `packages/core/src/catalog/schemas.ts` (stock y Excel)
  y `packages/core/src/warehouses.ts` (transferencias). UI con «− +» de enteros: `packages/storefront/src/components/ProductView.tsx`
  (`QuantityStepper`), `cart/CartView.tsx`, `packages/admin/src/pos/PosScreen.tsx` (`Math.min(q + 1, 999)`),
  `apps/web/src/features/orders/components/NewOrder.tsx`. Mensajes: `packages/core/src/orders/whatsapp.ts`.
- **Caja sin conexión:** catálogo y cola de ventas en IndexedDB (`packages/admin/src/pos/storage.ts`, `pos-sync.ts`);
  el servidor marca `stock_shortfall`/`price_mismatch` en `pos_sales.flags`.
- **Ya decimal:** dinero (`numeric(12,2)`), `platform_invoice_lines.quantity` (`numeric(12,2)`), `weight` (`numeric(10,3)`).
  `attributes.unit` es solo una etiqueta de atributo, no sirve para esto.
- **Lecturas:** todo por funciones SQL (`admin_*`, `sf_*`, R11); el numeric viaja como texto en las `sf_*` y los
  documentos GraphQL dan la forma (`stockAvailable` pasará de `Int` a `BigFloat`).

### Referencias
- `.titan/plans/prp-pos-offline.md` y `prp-ksh0012-cierre-de-caja.md` — caja, cola sin conexión, flags y cierre.
- `.titan/memory/project/2026-11-05-caja-v2.md` — teclado de la caja, «Equivale a», cambiar el precio de una línea (KSH0011).
- `.titan/memory/project/lecturas-tienda-r9.md` y `2026-10-28-diagnostico-rendimiento.md` — reglas de lecturas y de la Nano.
- `.titan/memory/reference/web-en-el-telefono.md` — objetivos de 40 px y campos de 16 px para el teclado nuevo.
- `.titan/memory/project/tienda-minimercado.md` — el primer cliente que lo usará.

### Arquitectura propuesta
No es un módulo opcional: es parte del catálogo (core) para todas las tiendas y planes, como la variante. Sin entrada
nueva en `SECTION_WRITES` salvo que aparezca una ruta de escritura nueva (no se prevé: se amplían las existentes).

```
packages/core/src/catalog/units.ts      # SALE_UNITS (código, nombre, abreviatura, decimales, paso por defecto),
                                        # quantitySchema(unit), parseQuantity("1,5"), formatQuantity(1.5, "lb") → "1,5 lb",
                                        # lineTotal(price, qty) con redondeo a 2 decimales (+ tests)
packages/core/src/{orders,pos,catalog,warehouses}  # los esquemas Zod usan quantitySchema en vez de .int()
packages/ui/                            # QuantityInput (paso, coma decimal, 16 px, «− +» de 40 px)
packages/storefront/ · packages/admin/  # ficha, carrito, checkout, pedido, caja, editor, stock, pedidos
supabase/migrations/2026110810xxxx_sale_units.sql   # columnas, tipos y funciones (ver abajo)
```

### Modelo de datos (propuesta)
```sql
-- Cómo se vende el producto (P1, P3, P4). 'unit' = como hoy.
alter table public.products
  add column sale_unit text not null default 'unit'
    check (sale_unit in ('unit','lb','oz','kg','g','l','ml','gal','m','cm','yd','ft','m2')),
  add column quantity_step numeric(12,2) check (quantity_step is null or quantity_step > 0);  -- null = el de la unidad

-- Cantidades decimales (P2). int → numeric(12,2) no pierde nada en los datos existentes.
alter table public.stocks
  alter column quantity type numeric(12,2), alter column quantity_allocated type numeric(12,2),
  alter column low_stock_threshold type numeric(12,2);
alter table public.stock_movements        alter column quantity type numeric(12,2);
alter table public.inventory_reservations alter column quantity type numeric(12,2);
alter table public.product_variants       alter column stock_available type numeric(12,2);
alter table public.cart_lines  alter column quantity type numeric(12,2);   -- check: > 0 and <= 99999
alter table public.order_lines alter column quantity type numeric(12,2),   -- idem
  add column unit text not null default 'unit';                            -- snapshot de la unidad vendida

-- La BD exige enteros para 'unit': trigger/check en cart_lines y order_lines contra products.sale_unit
-- (o dentro de las funciones de carrito, checkout y caja, que ya validan cada línea).
-- Todas las funciones con ::int en cantidades se redefinen con ::numeric y round(..., 2); las que devuelven
-- `quantity int` se borran y se crean de nuevo (cambia el tipo de retorno).
```

---

## Blueprint (Assembly Line)

> Solo fases. Las subtareas se generan al entrar a cada fase (mapear contexto → subtareas → ejecutar).

### Fase 1: Unidades y cantidades en `@kshop/core`
**Objetivo**: catálogo de unidades, validación por unidad, parseo con coma o punto, formato «1,5 lb» y total de línea
redondeado, usados por todos los esquemas Zod de cantidad.
**Validación**: tests de core (enteros siguen igual, «unit» rechaza 1,5, 2 decimales, redondeo del importe); `typecheck`.

### Fase 2: Base de datos (prueba → producción)
**Objetivo**: migración de columnas y tipos, unidad en producto y snapshot en línea, todas las funciones de carrito,
checkout, reservas, cancelación, transferencias, ajustes, caja (`pos_catalog`, `pos_record_sale`, anular, cierre),
cupones, Finanzas y lectores `admin_*`/`sf_*` con cantidades decimales y la unidad.
**Validación**: `db:test:migrate`, `test:rls` (con test nuevo: decimal en «unit» rechazado, aislamiento sin cambios),
comparadores admin y storefront, `db:graphql-schema && codegen`; luego producción y `test:rls` una vez allí.

### Fase 3: API y capa de datos
**Objetivo**: route handlers de carrito, checkout, pedido del admin, caja, stock, transferencias y Excel (columna
«Unidad») aceptan y devuelven decimales; `packages/data` convierte el numeric en texto a número en un solo sitio.
**Validación**: `e2e:orders`, `e2e:pos`, `e2e:catalog`, `e2e:excel` ampliados con un producto por libra (en serie, WhatsApp en «Simulado»).

### Fase 4: Admin web
**Objetivo**: «Se vende por» y paso en el editor, precio «/ lb», stock y umbral con decimales, transferencias, nuevo
pedido, detalle y lista de pedidos, cierre de caja y Finanzas con la unidad.
**Validación**: QA en navegador (escritorio y 390 px) con capturas; `qa:mobile` sin regresiones en las vistas tocadas.

### Fase 5: Caja (web y Kshop Admin, sin conexión)
**Objetivo**: teclado de cantidad decimal y «Por importe» (P5), catálogo en caché con unidad y paso, cola sin conexión
con decimales, ticket y ventas del día con la unidad; compatibilidad con APK ya instalados.
**Validación**: `qa:pos` y `qa:pos-offline` ampliados (vender 1,37 lb sin red, subir, stock exacto, anular devuelve);
venta de un APK viejo (solo enteros) aceptada por el servidor nuevo.

### Fase 6: Tienda online y app de tienda
**Objetivo**: tarjeta y ficha con «/ lb», selector con paso y entrada manual, carrito, checkout, página del pedido y
WhatsApp con la cantidad y la unidad; aviso de stock con decimales.
**Validación**: `qa:orders` ampliado con un producto por libra en la Tienda Demo (móvil y escritorio); Lighthouse/CLS de
la ficha sin empeorar.

### Fase 7: Ayuda y validación final
**Objetivo**: guía «Quiero vender por peso o medida», guías de caja, producto y stock al día, `helpContextForPath` si
hay pantalla nueva; todo el sistema funcionando de punta a punta.
**Validación**:
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pasan
- [ ] `pnpm help:shots <slugs>` revisadas (sin datos de prueba ni teléfonos reales) y `pnpm help:pdf`
- [ ] Capturas de QA en `.titan/qa/venta-por-peso/`
- [ ] Criterios de éxito cumplidos; memoria `.titan/memory/project/` con dónde está cada pieza

---

## 🧠 Aprendizajes (Self-Annealing)

> Crece con cada error encontrado durante la implementación.

- **`products` da permisos de SELECT columna a columna** (search_vector, on_sale…): una columna nueva sin
  `grant select (col) on public.products to anon, authenticated` rompe `admin_search_products` («permission denied
  for table products»). `order_lines` tenía grant de tabla: `unit` lo heredó.
- **Volcar funciones con `pg_get_functiondef` en Windows:** los cuerpos traen CRLF; escribir con `newline=""` y
  normalizar a `\n`, o Python duplica las líneas en blanco. La migración se generó parcheando los cuerpos actuales
  (script en el scratchpad de la sesión: reemplazos exactos que fallan si no encajan) — antes, comprobar que prueba y
  producción tienen el mismo código (md5 por función: solo difieren `issue_invoice` y `subscription_quote`, no tocadas).
- **Tests SQL:** `tests.eq(…, numeric, 5)` no resuelve con `anyelement` (numeric vs integer) y una sobrecarga
  `numeric` lo vuelve ambiguo para todos; se castea el literal (`5::numeric`) y los textos usan `trim_scale()`.
- **`tests.throws` no da el mensaje:** para comprobar el texto de un error, `pg_temp.error_of(sql)` en el propio test.
- **Ficheros CRLF** (p. ej. `cart.ts`): editar normalizando a `\n` y devolviendo CRLF al guardar.

## Estado (2026-11-07)

| Fase | Estado |
|------|--------|
| 1 Core | Hecha: `packages/core/src/catalog/units.ts` (+ tests), esquemas Zod con `quantityValueSchema`, Excel «Unidad» |
| 2 BD | **En producción** (2026-11-07, sin `test:rls` allí aún): `20261108102500_sale_units.sql` (23 funciones parcheadas, 3 helpers `private.quantity_ok/counted_quantity/quantity_text`), `24_sale_units.test.sql` 18/18, `test:rls` 849/849, comparadores 33/33 y 36/36, schema + codegen. Falta `test:rls` en producción |
| 3 API | Hecha: carrito por unidad (`cart.ts`), pedido público y WhatsApp con unidad, caja pasa `unit`, Excel import/export, almacenes con `unit`. Sin e2e aún |
| 4 Admin web | Hecha: «Se vende por» y paso en el editor, «Precio (CUP / lb)», stock decimal, Nuevo pedido con `QuantityInput`, traspasos, detalle del pedido. Sin QA en navegador |
| 5 Caja | Hecha en código: `PosQuantityInput` (decimales, «Por importe» con el botón de la unidad), «− +» por el paso, total por línea redondeado. Kshop Admin 1.0.25 publicado directo (Roberto); faltan `qa:pos`/`qa:pos-offline` y el APK de las apps de tienda |
| 6 Tienda | Hecha en código: «/ lb» en tarjeta y ficha, stepper con paso y cantidad a mano, carrito, checkout, página del pedido. Sin QA |
| 7 Ayuda | Guía `sell-by-weight`; faltan capturas (`help:shots`) y `help:pdf` |

**Pendiente conocido:** `finance_inventory` suma libras con unidades en el total «unidades» (por fila está bien);
Finanzas por producto da líneas contadas (1 por línea pesada), no las libras — el PRP pedía «42,5 lb» por producto.

---

## Gotchas

- [ ] **Orden del deploy:** migración y servidor primero, APK después. El servidor nuevo tiene que aceptar las ventas
      enteras de Kshop Admin viejos y las apps de tienda viejas; un APK viejo con un producto por libra en caché vende
      de 1 en 1 lb (aceptable, se documenta).
- [ ] **Tipos de retorno:** las funciones `returns table (... quantity int)` no admiten `create or replace` con otro
      tipo: `drop function` + `create` + volver a dar los `grant`/`revoke` (execute solo a `service_role` en las críticas).
- [ ] **`alter column type`** reescribe `stocks`, `order_lines`, `stock_movements`… y toma un lock exclusivo: en la Nano,
      fuera de horas y sin `e2e`/`qa` corriendo. Revisar antes índices y checks (`quantity between 1 and 999`) que hay que recrear.
- [ ] **GraphQL:** `Int` → `BigFloat` (texto) en `stockAvailable` y `quantity`; las `sf_*` devuelven el numeric como
      texto. Parsear en un solo sitio de `packages/data`, nunca comparar el texto (`"10.000" > "9.000"` falla).
      `numeric(12,2)` da `"3.00"`: formatear sin ceros de sobra en la UI.
- [ ] **`jsonb_object_agg(v.id, v.stock_available)` y `(p_before ->> id)::int`** (señales de stock agotado/repuesto):
      pasar a `::numeric` o fallará con «invalid input syntax for type integer: "1.500"».
- [ ] **Coma decimal:** los teclados en español dan «1,5»; `parseQuantity` acepta coma y punto, y el `input` usa
      `inputMode="decimal"` (no `type="number"`, que en iOS bloquea la coma).
- [ ] **Coma flotante en JS:** `0.1 + 0.2`; calcular cantidades en milésimas enteras y el importe con el mismo redondeo
      que la BD (`round(precio × cantidad, 2)`) o la caja marcará `price_mismatch`.
- [ ] **Totales de «unidades»** (Finanzas, cierre, cupones `min_quantity`, Inicio): una línea por medida cuenta 1, no
      sus libras; si no, «3 unidades + 42,5 lb = 45,5 unidades».
- [ ] **Excel:** columna «Unidad» opcional (vacía = la que tiene o «unidad») y stock con coma o punto; el import
      reanudable de klauShop (Fase 8) no se toca.
- [ ] **Dinero y KSH0011:** cambiar el precio de una línea por medida cambia el precio por unidad, no el importe total;
      dejarlo claro en la UI («Precio por lb»).
- [ ] **Antes de correr e2e/qa:** WhatsApp en «Simulado» y de vuelta a «Real» al terminar; nunca a la vez ni con la web en uso.
- [ ] **Migraciones nuevas** van después de `20261108102400_admin_products_no_cost.sql` (sin commitear en el árbol a 2026-11-07).

## Anti-Patrones

- NO guardar cantidades como enteros en milésimas en la BD (todo consumidor tendría que dividir y alguno se olvidará).
- NO crear un módulo opcional ni un plan para esto: es parte del catálogo.
- NO convertir unidades entre sí (lb ↔ kg) ni empezar los sacos: eso es el PRP de conversión de compra (D4).
- NO usar `float`/`real` para cantidades ni importes.
- NO cambiar los pedidos, carritos ni ventas existentes más allá del cambio de tipo.
