# PRP: Ventas de un cierre y búsqueda por producto

> **Estado**: COMPLETADO 2026-11-14 — en producción (web `99ba868`, Kshop Admin 1.0.33)
> **Fecha**: 2026-11-14
> **Proyecto**: Kshop · pedido de Minimercado (`minimercado`)
> **Tarea Tasknic**: por asignar (KSH00xx)

---

## Objetivo

Que el dueño revise un cierre de caja desde Kshop Admin (y la web) viendo qué llevaba cada venta, filtre las ventas
por producto sin perder el filtro al abrir un pedido y volver, consulte cierres de más de 30 días y busque un producto
en todas las ventas del mostrador a la vez.

## Por Qué

| Problema | Solución |
|----------|----------|
| «Ver sus ventas» de un cierre solo enseña fichas con el número (#1043…); para saber qué llevaba cada una hay que abrirlas una a una | Pantalla «Ventas del cierre» con los productos de cada venta |
| No hay forma de saber qué ventas llevaban un producto (p. ej. para cuadrar el aceite que falta) | Buscador de producto dentro del cierre y en todos los cierres |
| Al volver de un pedido el desplegable se cierra y la lista vuelve arriba | La búsqueda va en la dirección (`?q=`) y la lista conserva el punto |
| Solo se ven los cierres de los últimos 30 días | «Ver cierres anteriores» de 30 en 30 días |

## Decisiones (Roberto, 2026-11-14)

| # | Decisión |
|---|----------|
| D1 | Se añade «Ver cierres anteriores» (carga los 30 días anteriores cada vez). |
| D2 | Lo ve quien ya ve los cierres (empleados con caja incluidos). Costo y ganancia siguen solo para dueño/admin. |
| D3 | Se incluye en esta fase la búsqueda de un producto en todos los cierres («¿qué días se vendió aceite?»). |

Supuestos técnicos (se proponen, Roberto puede cambiarlos):
- S1. Dentro de un cierre el filtro es por texto (nombre, variante o SKU, sin acentos) y se hace en el teléfono sobre lo
  ya cargado: un día de Minimercado son decenas o pocos cientos de ventas; ninguna consulta más a la Nano.
- S2. En todos los cierres se elige un producto del catálogo (buscador que ya existe) y el servidor busca por
  `product_id` con el índice `order_lines_product_idx`; nada de `ilike` sobre el texto de todas las líneas. Un producto
  borrado del catálogo no se puede buscar así (sí dentro de un cierre, por texto).
- S3. La búsqueda en todos los cierres cubre las ventas de la caja (`pos_sales`), también las aún sin cerrar
  («Sin cerrar»), de 30 en 30 días hacia atrás. No mezcla los pedidos de la tienda online.

## Qué

### Comportamiento esperado
1. **Caja › Cierres**: igual que hoy; «Ver sus ventas (N)» abre `/admin/pos/closings/:closingId`. Al final de la
   lista, «Ver cierres anteriores» añade los 30 días anteriores (y se repite mientras haya). Arriba, «Buscar un
   producto en todos los cierres».
2. **Ventas del cierre** (`/admin/pos/closings/:closingId?q=`): cabecera con el día, el n.º de cierre y quién cerró;
   buscador «Buscar producto»; una tarjeta por venta: número, hora, quién vendió, total, método de pago, sus líneas
   («Aceite 1 L × 2», «Arroz × 2,5 lb») y «Anulada» si lo está. Tocar la tarjeta abre el pedido.
   - Con texto: solo las ventas con alguna línea que coincida, la línea resaltada y el resumen
     «12 ventas con «aceite» · 15 unidades · 4 500 CUP» (las anuladas aparte, sin sumar).
   - Atrás desde el pedido vuelve a la misma búsqueda y al mismo punto de la lista.
3. **Ganancia por producto** (dueño/admin): cada producto abre «Ventas del cierre» filtrada por él.
4. **Buscar en todos los cierres** (`/admin/pos/closings/search?product=:id`): elegir un producto; salen por día las
   ventas que lo llevan, con el cierre al que pertenecen (o «Sin cerrar»), la cantidad de ese producto en cada una y el
   total del día; «Ver días anteriores» de 30 en 30. Tocar una venta abre el pedido; tocar el cierre abre sus ventas
   filtradas por el producto. Atrás conserva el producto y lo cargado.
5. Web (Admin › Caja › Cierres) y Kshop Admin usan los mismos componentes de `packages/admin`.

### Criterios de éxito
- [ ] Desde Kshop Admin, un cierre enseña sus ventas con sus productos sin abrirlas una a una.
- [ ] Filtrar por «aceite» deja solo las ventas con aceite y el resumen cuadra con «Ganancia por producto».
- [ ] Abrir un pedido y volver deja el filtro y la posición como estaban (web y Kshop Admin).
- [ ] «Ver cierres anteriores» enseña cierres de hace más de 30 días.
- [ ] La búsqueda en todos los cierres encuentra las ventas de un producto en varios días, también las sin cerrar.
- [ ] Un empleado no ve costos ni ganancia en ninguna de estas pantallas.
- [ ] Aislamiento: un usuario de la tienda B no lee ventas, cierres ni búsquedas de A (ni pasando el id de un cierre
      o producto de A).
- [ ] Una lectura por pantalla (y una por «Ver anteriores»): medido sin errores contra la Nano.

---

## Contexto

- `packages/admin/src/pos/PosClosings.tsx` — lista actual (fichas con el número en `<details>`, `ClosingProfit`).
- `apps/admin-app/src/App.tsx` — ruta `/admin/pos/closings` (react-router); la web en `apps/web/.../admin/pos/closings`.
- `supabase/migrations/20261108102600_pos_closing_profit.sql` — `admin_pos_closings(p_store_id, p_days)` (security
  invoker), `private.closing_profit`.
- `pos_sales` (`closing_id`, `cashier_id`, `sold_at`; índices `pos_sales_closing_idx`, `pos_sales_store_idx`),
  `order_lines` (`product_name`, `variant_name`, `sku`, `quantity`, `unit`, `line_total`; índice
  `order_lines_product_idx (store_id, product_id)`), `payments`/`payment_methods` (como en `admin_orders`).
- Ayuda: guía `cash-closing` en `packages/admin/src/help/content/articles.ts`.
- PRP previo: `prp-ksh0012-cierre-de-caja.md` (KSH0012/14/17).

## Modelo de datos

Sin tablas nuevas. Migración `2026110810xxxx_closing_sales.sql` (versión libre, comprobar que nadie la usa):

```sql
-- Más cierres: p_before (día de Cuba exclusivo) para paginar hacia atrás; misma forma de respuesta.
admin_pos_closings(p_store_id uuid, p_days int default 30, p_before date default null)
  -- añade 'hasOlder' (hay cierres antes de la ventana)

-- Ventas de un cierre con sus líneas y pagos (security invoker; RLS de pos_sales/orders).
admin_pos_closing_sales(p_store_id uuid, p_closing_id uuid) returns jsonb
  -- {closing:{id,day,sequence,cashier,closedAt}, sales:[{orderId,number,soldAt,cashier,status,currency,total,
  --   payments:[name], lines:[{productId,name,variant,sku,quantity,unit,lineTotal}]}]}

-- Ventas de la caja con un producto, de p_days días antes de p_before (security invoker).
admin_pos_product_sales(p_store_id uuid, p_product_id uuid, p_days int default 30, p_before date default null)
  -- {product:{id,name}, days:[{day, sales:[{orderId,number,soldAt,cashier,status,quantity,unit,lineTotal,
  --   closingId,closingSequence}], totals}], hasOlder}
```

Numeric como texto, igual que las demás lecturas. Sin costos en estas funciones (la ganancia ya va en
`admin_pos_closings` y solo la ve dueño/admin). Sin documento GraphQL: son RPC directas como `admin_pos_closings`
(no entran en `compare-admin-reads`).

## Blueprint (fases)

1. **BD**: migración con las tres funciones (+ `grant execute` a `authenticated`); test
   `28_closing_sales.test.sql` (aislamiento A/B por id de cierre y de producto, empleado sin costos, paginación);
   aplicar en prueba → `test:rls` en prueba → producción → `test:rls` una vez en producción. `EXPLAIN` de las dos
   búsquedas en la Demo.
   → verificar: tests verdes en los dos proyectos, planes con los índices.
2. **Datos**: `reads.posClosings(store, days, before)`, `reads.posClosingSales`, `reads.posProductSales` y sus tipos en
   `packages/data/src/admin-reads.ts`; normalización de texto sin acentos en `@kshop/core` con test.
   → verificar: `pnpm typecheck`, `pnpm test`.
3. **UI**: `PosClosings` (enlace, «Ver cierres anteriores», acceso a la búsqueda), `PosClosingSales` (tarjetas,
   filtro `?q=`, resumen, restaurar el punto), enlaces desde «Ganancia por producto», `PosProductSales`; rutas en
   Kshop Admin y en la web; a 390 px con `touch:` (40 px, campos a 16 px).
   → verificar: `pnpm lint`, `pnpm typecheck`, `pnpm qa:mobile` de las vistas nuevas.
4. **Ayuda**: guía `cash-closing` (y una nueva «Buscar un producto en las ventas» si hace falta), contexto en
   `helpContextForPath` para las rutas nuevas, `pnpm help:shots`, `pnpm help:pdf`.
5. **QA**: `pnpm qa:closing-sales` (Tienda Demo, solo lectura; WhatsApp en «Simulado» no hace falta porque no crea
   nada): filtro, volver desde un pedido, anteriores, búsqueda en todos, empleado sin costos; capturas en
   `.titan/qa/cierres-ventas/`. En serie, con la web sin uso.
6. **Entrega** (con permiso de Roberto): commit, deploy de la web, versión nueva de Kshop Admin (APK) y aviso a
   Minimercado.

## Hecho (2026-11-14)

- Migración `20261108103100_closing_sales.sql`: `private.pos_sale_card`, `admin_pos_closings(p_store_id, p_days, p_before)`
  (añade `before` y `hasOlder`; las llamadas viejas con dos parámetros siguen valiendo), `admin_pos_closing_sales`,
  `admin_pos_product_sales`. Aplicada en **prueba**; test `28_closing_sales` 21/21 y suite 913/913 en prueba.
  En producción 2026-11-14: migración aplicada y `test:rls` 913/913.
- Datos: `reads.posClosings(store, days, before)`, `reads.posClosingSales`, `reads.posProductSales` y tipos
  `PosSaleCard`, `PosClosingSales`, `PosProductSales`. El filtro usa `normalizeSearch` de `@kshop/core` (ya existía).
- UI en `packages/admin/src/pos/`: `PosClosings` (enlace «Ver sus ventas (N)», «Ver cierres anteriores», «Buscar un
  producto en todos los cierres», productos de «Ganancia por producto» como enlace), `PosClosingSales`,
  `PosProductSales` y `screen-memory.ts` (estado y scroll en memoria para «atrás»). Rutas `/admin/pos/closings/:id` y
  `/admin/pos/closings/search` en Kshop Admin y en la web. En la web, `?from=` en el enlace al pedido hace que el
  «Volver» del teléfono (AdminShell) regrese al cierre; las pantallas nuevas vuelven a Caja › Cierres.
- Ayuda: guía nueva `closing-sales` y paso 4 de `cash-closing`; PDF regenerado (sin capturas: el Demo no tiene
  cierres permanentes).
- QA: `pnpm qa:closing-sales` 17/17 a 390 px (capturas en `.titan/qa/cierres-ventas/`). Para tener datos, en el
  proyecto de **prueba** se cerraron las 60 ventas abiertas de la Tienda Demo y el cierre vacío que había se movió
  40 días atrás. Falta probarlo dentro de Kshop Admin en un Android (usa los mismos componentes; el botón atrás de
  Android hace `history.back()`).

- Entrega (permiso de Roberto, 2026-11-14): push de `99ba868` (Vercel en verde), workflow «Android app» run
  43617744603 → Kshop Admin 1.0.33 subido con `app:publish admin` y publicado (borrada la 1.0.32). Publicado con la
  clave de servicio haciendo lo mismo que `setAppBuildPublished` (no hay sesión de superadmin en `.env.local`).

## Aprendizajes

- En Next, una pantalla nueva se dibuja **antes** de que cambie la dirección: leer `window.location.search` al montar
  (o en el AdminShell) da la URL anterior. Los parámetros iniciales se pasan desde la página con `useSearchParams`
  (Next o react-router); el AdminShell usa `useSearchParams` (ya está dentro de un `Suspense`).
- Para escribir la búsqueda en la dirección sin navegar: `history.replaceState(history.state, …)` (conserva el
  estado del router; `router.replace` en Next pediría la página al servidor en cada tecla).
- Por la shell de Windows, `pnpm db:query` no admite `||`, `->>` ni comillas dobles dentro del SQL: usar
  `jsonb_extract_path_text`, `jsonb_build_object` y nada de `>` (crea archivos sueltos).
