# PRP POS: punto de venta sin conexión en Kshop Admin

> **Estado**: APROBADO por Roberto (2026-10-30): P1–P4, P6 y P7 según la recomendación; P5 cambia (ver tabla). **Fases 1 y 2 en producción; fases 3, 4, 5 y 6 hechas en local, en commits sin subir (su migración sí está en producción), sin probar en un Android real (2026-10-31); falta la 7**
> **Fecha**: 2026-10-30
> **Proyecto**: Kshop · **Tarea relacionada**: KSH0002 (Tasknic, «pagar una orden con diferentes monedas»)
> **Primer caso real**: tienda `minimercado` (`project/tienda-minimercado.md`), abierta al público en físico.

---

## Objetivo

Que cualquier tienda pueda vender en su mostrador desde Kshop Admin, con o sin internet: la caja busca en un catálogo
guardado en el teléfono, cobra en una o varias monedas con la tasa que acuerde con el cliente, y la venta queda segura en
el dispositivo hasta subirse sola como un pedido más. El control de inventario (entradas, conteos, descuadres) queda para
una segunda etapa con su propio PRP.

## Por qué

| Problema | Solución |
|----------|----------|
| En Cuba la conexión y la luz se caen a menudo, y hoy Kshop Admin sin internet ni pasa de «No se pudo conectar» | La app arranca sin red, vende y sube después; ninguna venta depende de la conexión |
| Las tiendas con local físico apuntan aparte lo que venden en mostrador, así que sus ventas, su caja y su stock no coinciden con Kshop | Cada venta de mostrador entra como pedido con su canal, en Pedidos, Ventas de hoy y Finanzas |
| «Nuevo pedido» pide cliente y teléfono y abre el panel web: es lento para una cola de mostrador | Pantalla de caja: buscar, añadir, cobrar, en pocos toques y sin datos del cliente |
| Un cliente paga «50 USD y el resto en CUP» y hoy se registra todo en la moneda del pedido (KSH0002) | Cobro mixto: tasa de elTOQUE como sugerencia, ajustable en cada cobro, y la app dice cuánto falta en la otra moneda |

**Valor de negocio**: abre a Kshop el comercio con local físico, no solo el que vende por WhatsApp, y da una razón diaria
para usar la app. El cobro mixto también mejora los pedidos normales.

## Qué

### Criterios de éxito

- [ ] Con el teléfono en modo avión y la app cerrada, un cajero con sesión previa abre Kshop Admin, entra en la caja y
      completa una venta.
- [ ] Una venta guardada sobrevive a matar la app y a reiniciar el teléfono, y se sube una sola vez aunque la subida se
      corte o se repita (`pnpm e2e:pos`, incluida la repetición de la misma venta).
- [ ] Cobrar 50 USD a 320 de un total de 20 000 CUP dice «faltan 4 000 CUP». Pedidos, Ventas de hoy y Finanzas muestran
      +50 USD y +4 000 CUP tal como se cobraron, y el «Equivalente» usa la tasa acordada, no la del día.
- [ ] El mismo cobro mixto funciona en un pedido normal (web y Kshop Admin), no solo en la caja.
- [ ] Una venta subida días después cuenta en el día en que se hizo y no envía ningún WhatsApp.
- [ ] Ninguna venta se pierde por un rechazo: si la subida falla (tienda suspendida, sin módulo, sin sesión) queda
      retenida en el teléfono con el motivo a la vista, y no se puede cerrar sesión sin confirmarlo.
- [ ] El módulo `pos` se comprueba en las tres capas, respeta las secciones de R12 y el costo nunca llega al teléfono.
- [ ] Aislamiento: el personal de la tienda A no lee ni sube ventas de B (`pnpm test:rls`).
- [ ] `typecheck`, `lint`, `test`, `build`, `e2e:pos` y `qa:pos` en verde, y prueba en un Android real en modo avión.

### Comportamiento esperado (happy path)

1. Con internet, la app descarga el catálogo de venta de la tienda y las tasas. Indica su antigüedad («Catálogo de hoy»).
2. Sin internet, el cajero abre **Caja**, busca por nombre o SKU (un lector de códigos actúa como teclado) y añade
   productos. El total sale en la moneda de la tienda.
3. Pulsa **Cobrar**, elige moneda y escribe lo recibido. Si es otra moneda, ve «1 USD = 320 CUP» con la última sugerencia
   de elTOQUE, puede ajustarla, y la pantalla le dice cuánto falta y en qué moneda, o el vuelto si sobra.
4. Al confirmar, la venta se guarda en el teléfono **antes** de cerrarse la pantalla. La caja queda libre para la siguiente.
5. Cuando vuelve la red, la cola sube las ventas en orden, poco a poco. Cada una pasa a ser un pedido `pos` entregado y
   pagado, con su número, y descuenta el stock según P2.
6. La caja muestra el resumen del día por moneda, y las ventas pendientes, subidas y retenidas. Una venta en cola se puede
   anular; una ya subida se cancela desde su pedido.

**Fuera de esta etapa:** inventario (entradas, conteos, mermas, ajustes sin conexión), descuentos y cupones en caja, venta
por peso (ver P6), impresora y recibo, cámara como lector, turnos de caja, ventas a un cliente registrado y POS en el
panel web.

---

## Preguntas para Roberto

Si respondes «sí a todo», se implementa la recomendación de cada una.

| # | Pregunta | Recomendación y por qué |
|---|----------|-------------------------|
| P1 | «Módulo para todas las tiendas»: ¿incluido sin coste en Base y Pro, o de pago suelto? | **Incluido en ambos.** Es lo que dices literalmente. Se puede ocultar por tienda (R12) y pasar a de pago más adelante |
| P2 | Hasta que llegue el inventario, ¿la venta descuenta stock? | **Sí, al subir, sin bloquear nunca.** Si no, la tienda online seguiría vendiendo lo que ya salió. Si no alcanza, descuenta lo que haya y deja anotado el faltante para la etapa 2. La alternativa de no tocar stock es más simple, pero el stock quedaría falso |
| P3 | ¿Cobrar en otra moneda exige el módulo Multimoneda (Pro)? | **No.** La venta sigue en una sola moneda; Multimoneda sigue siendo vender y mostrar precios en varias. Aplica también a KSH0002. Contra: quita un motivo para pasar a Pro |
| P4 | ¿Quién puede vender y ajustar la tasa? | **Todo el personal**, como pide KSH0002 («el que está cobrando»). Cada tasa queda guardada y a la vista del dueño |
| P5 | ¿Cómo se busca en la caja? | **Decisión de Roberto:** por nombre con coincidencias por trozos, ordenadas: primero los trozos consecutivos de la frase y luego los fraccionados. También por SKU (el código de barras como SKU, sin columna nueva; un lector USB o Bluetooth ya funciona). La cámara, con el inventario |
| P6 | Un minimercado puede vender por libras. ¿Hace falta ya? | **No por ahora**, salvo que el cliente lo necesite de entrada: `order_lines.quantity` es entero y cambiarlo toca pedidos, stock y Finanzas. Conviene preguntarle al minimercado |
| P7 | Sin conexión, ¿hasta cuándo se puede vender sin que el servidor confirme acceso? Y, ¿dónde va «Caja» en la barra? | **7 días**, ampliables (protege de cuentas dadas de baja). **Inicio · Caja · Pedidos · Productos · Más**, con Ventas accesible desde Inicio y Más, porque seis pestañas no caben bien |

---

## Contexto

### Lo que hay hoy (leído en el código, 2026-10-30)

| Pieza | Estado y consecuencia |
|-------|-----------------------|
| `apps/admin-app/src/App.tsx` | El JS va dentro del APK, pero `StoreGate` espera `api.me()` y muestra error sin red: **hay que arreglar el arranque** |
| `readCachedAdminState` (`packages/admin/src/admin-context.ts`) | Caduca a las 24 h y `signOut` borra el prefijo `kshop.admin.`: ni la caja ni su cola pueden depender de él |
| `apps/store-app/src/cache.ts`, `useOnline` en su `native.ts` | Patrón de caché y de estado de red que se puede imitar; el `localStorage` no sirve para dinero (el propio `native.ts` del admin avisa de que el WebView lo puede borrar) |
| `checkout_create_order` | Exige nombre y teléfono, recalcula el precio y falla sin stock: **no sirve para una venta ya cobrada** |
| `import_legacy_order` (`20261107100100`) | **El mejor precedente**: inserta un pedido histórico con su fecha y sus precios, sin avisos |
| `order_event_notify` | Trigger sobre `order_events`: los eventos no internos `created` y `payment_recorded` envían WhatsApp. Los de la venta deben ser `is_internal` y `notify_customer = false` |
| `orders.customer_phone` | `not null` con formato obligatorio; se usa en 11 archivos TS y 11 migraciones. Un cliente de mostrador no tiene teléfono |
| `order_record_payment` | **Siempre guarda la moneda del pedido**, y la API no acepta otra |
| `refresh_order_payment` | **Suma `amount` sin mirar la moneda**: 50 USD sobre un pedido en CUP contarían como 50 CUP |
| `order_cancel` | Devuelve `paid_total` en la moneda del pedido, lo que descuadraría la caja por moneda con cobro mixto. No cancela pedidos `delivered`, y ese sería el estado de una venta de mostrador |
| `finance_*` (`20261101100400`) | Ya prevé pagos en otra moneda, pero los valora con `rate_at` (la tasa de la tienda), no con la acordada |
| `getMarketRates` (`server/currency-rates.ts`) | elTOQUE ya está (una consulta al día, en caché), siempre como sugerencia; sirve para KSH0002 |
| `stocks` | `check (quantity >= 0)`: el stock no puede quedar negativo, así que el faltante hay que anotarlo aparte |
| `order_channel` | `web`, `app`, `admin`; falta `pos` |
| Secciones (R12) | Toda ruta de escritura nueva debe estar en `SECTION_WRITES` o `SECTION_FREE_WRITES` (hay un test) |
| Nano con CPU a créditos | Descarga y subida deben ser por lotes pequeños y en serie |

### Decisiones técnicas propuestas

| # | Decisión | Motivo |
|---|----------|--------|
| D1 | KSH0002 se hace **primero y aparte**, en pedidos normales; la caja lo reutiliza | Da valor por sí solo, y es el cambio de mayor riesgo porque toca el dinero de los pedidos existentes |
| D2 | La venta se hace **en una sola moneda (la base de la tienda)**; solo los cobros pueden ser en otras | Mantiene el modelo actual: moneda de pedido + cobros |
| D3 | Función nueva `pos_record_sale`, sin pasar por el checkout | **La venta ya ocurrió y el dinero ya se cobró**: el servidor registra, no decide. Acepta el precio del dispositivo y anota lo que no cuadre (precio distinto, sin stock, producto borrado) |
| D4 | Pedido `channel = 'pos'`, `status = 'delivered'`, `created_at` = hora de venta | Pedidos, Ventas de hoy y Finanzas ya lo cuentan sin cambios, y en el día correcto |
| D5 | `customer_phone` pasa a admitir null **solo** en `pos`, con nombre «Mostrador» | Un teléfono de relleno recibiría WhatsApp reales. Hay que revisar los 11 lectores |
| D6 | El id de la venta (UUID) lo genera el teléfono; `idempotency_key = 'pos:<uuid>'` | La restricción única ya existe; repetir una subida devuelve el mismo pedido |
| D7 | Cola: **un archivo JSON por venta** con `@capacitor/filesystem` en el directorio privado. Catálogo: IndexedDB, que se puede volver a descargar | Lo que cuesta dinero va donde el WebView no lo borra, sin motor SQL en el teléfono. `@capacitor-community/sqlite` queda como opción si el inventario pide consultas en el dispositivo (interfaz `PosQueue` para poder cambiarlo). En navegador (dev y QA), IndexedDB. A validar en la fase 3 |
| D8 | Catálogo por `GET /api/v1/stores/{id}/pos/catalog` paginado, con función `security definer` solo para `service_role`, sin costo | Como las demás lecturas del catálogo en las apps; pasa por `requireModule` y usa `private.variant_sale_price` para el precio con promoción |
| D9 | Subida por `POST /api/v1/stores/{id}/pos/sales` en lotes de hasta 20 y en serie; una transacción por venta y resultado por venta | Un fallo no frena las demás y no se dispara la CPU. Las escrituras no se reintentan solas (`resilient-fetch`), pero la cola sí puede gracias a D6 |
| D10 | Un rechazo (403, sin sesión) **retiene** la venta en el teléfono, no la borra | No se abre ningún hueco en el control de módulos ni de suspensión, y el dinero registrado no se pierde. Al resolverlo, sube sola |
| D11 | Hora del dispositivo con control: si es futura (más de 10 min) se usa la de subida y se anota | Un teléfono con la hora mal no debe mover ventas de día |
| D12 | Anular una venta en cola la sube igualmente, ya cancelada | El dueño ve el rastro; no hay ventas que desaparecen sin dejar huella |
| D13 | Código en `packages/admin/src/pos/`, sin imports de `next/*`; el almacenamiento se inyecta por `AdminConfig`, como `takePhoto` | Regla del proyecto; permite llevarlo a la web en el futuro y hacer QA en Vite |

### Arquitectura propuesta

```
packages/core/src/pos/           Zod de venta y cobro; cálculo en centavos (lo aplicado, lo que falta, vuelto)
packages/admin/src/pos/          PosScreen, Cart, Checkout, DaySummary, QueueStatus
                                 use-pos-catalog, pos-queue, pos-sync
packages/data/src/api.ts         api.pos(storeId).catalog() / .uploadSales()
apps/admin-app/src/native.ts     queue en Filesystem, useOnline
apps/admin-app/src/App.tsx       arranque sin red, pestaña Caja
apps/web/src/features/pos/       module.ts y página informativa del panel
apps/web/src/app/api/v1/stores/[storeId]/pos/{catalog,sales}/route.ts
apps/web/src/server/pos.ts
scripts/e2e-pos.mjs, scripts/qa-pos.mjs
```

### Modelo de datos (borrador)

```sql
-- Fase 1 (KSH0002). rate_to_order: unidades de la moneda del pedido por 1 de la moneda del cobro.
-- Se guarda «lo aplicado» para que el saldo nunca dependa de recalcular tasas.
alter table public.payments
  add column applied_amount numeric(12, 2),     -- backfill = amount; luego not null
  add column rate_to_order numeric(18, 6) not null default 1 check (rate_to_order > 0),
  add column change_amount numeric(12, 2) check (change_amount is null or change_amount > 0),
  add column change_currency public.currency_code;
alter table public.refunds add column applied_amount numeric(12, 2);  -- backfill = amount

-- refresh_order_payment suma applied_amount. order_cancel devuelve por moneda, lo que entró menos el vuelto.
-- Finanzas y Ventas de hoy: caja por moneda tal como se cobró (restando vuelto); equivalente con la tasa guardada.

-- Fase 2. El valor del enum va en su propia migración: no se puede usar en la transacción que lo crea.
alter type public.order_channel add value 'pos';

alter table public.orders alter column customer_phone drop not null,
  add constraint orders_phone_required check (customer_phone is not null or channel = 'pos');

create table public.pos_sales (              -- lo propio de la caja, sin ensanchar orders
  order_id uuid primary key,
  store_id uuid not null,
  device_id uuid not null,
  local_number text not null,                -- número de recibo antes de subir
  sold_at timestamptz not null,
  uploaded_at timestamptz not null default now(),
  cashier_id uuid references auth.users (id) on delete set null,
  -- [{type: 'stock_shortfall' | 'price_mismatch' | 'unknown_variant' | 'clock_skew', ...}]
  flags jsonb not null default '[]',
  foreign key (store_id, order_id) references public.orders (store_id, id) on delete cascade
);
create index pos_sales_store_idx on public.pos_sales (store_id, sold_at desc);
create index pos_sales_cashier_idx on public.pos_sales (cashier_id);
alter table public.pos_sales enable row level security;  -- lectura: personal de la tienda; escritura: solo la función

-- Módulo: public.modules ('pos', depends_on {orders,catalog}) + plan_modules según P1;
-- MODULE_CODES y CONFIGURABLE_SECTIONS en @kshop/core; check de store_section_settings.
-- Reservas 'consumed' por lo descontado, para que order_cancel devuelva el stock (permitir delivered si channel = 'pos').
```

### Referencias

- `supabase/migrations/20261107100100_legacy_import_no_notices.sql`: pedido con fecha y precios dados, sin avisos.
- `supabase/migrations/20261101100100_warehouse_engine.sql`: bloqueo de stock en orden fijo, almacenes.
- `apps/web/src/features/multi-currency/`, `server/currency-rates.ts`: tasas y sugerencia de elTOQUE.
- `packages/admin/src/orders/OrderDetail.tsx` (`PaymentsCard`): donde entra el cobro mixto de los pedidos.
- `docs/APPS.md`, `.titan/memory/project/2026-10-27-fase-7-apps.md`: cómo se compila y publica el APK.
- Versiones comprobadas en npm: `@capacitor/filesystem` 8.1.5, `@capacitor/network` 8.0.1,
  `@capacitor-community/sqlite` 8.1.1, todas compatibles con Capacitor 8. Aún no probadas en un dispositivo.

---

## Blueprint

> Solo fases. Las subtareas se generan al entrar en cada una con `tf-bucle-agentico`. Toda migración va primero a prueba y
> luego a producción. Pruebas en serie, sin nadie usando la web y con WhatsApp en «Simulado».

### Fase 1: Cobro en varias monedas en pedidos (KSH0002) — HECHA
**Objetivo**: un pedido normal se cobra en varias monedas, con tasa sugerida y ajustable, lo que falta y el vuelto; el saldo,
la cancelación, Finanzas y Ventas de hoy cuadran por moneda.
**Validación**: el ejemplo de 50 USD + CUP de los criterios de éxito en `e2e:orders` y `e2e:pro`; los pedidos existentes no
cambian de saldo (comparación antes y después en prueba, incluida la tienda `klaushop`); `test:rls`; comparador de
`admin_order`; QA en web y Kshop Admin.

### Fase 2: Módulo `pos` y servidor de la venta — HECHA
**Objetivo**: módulo, canal, secciones y teléfono opcional; `pos/catalog` y `pos/sales` con `pos_record_sale` e idempotencia.
**Validación**: `e2e:pos` por API (repetir no duplica, sin stock no falla y lo anota, sin WhatsApp, día correcto, 403 sin
módulo, sin costo en la respuesta, cancelación devuelve stock); aislamiento entre tiendas en `supabase/tests/`; test de
secciones; pantallas que leen el teléfono funcionando con null; medición del catálogo en la Tienda Demo.

### Fase 3: Arranque sin conexión y almacenamiento — HECHA (falta el Android real)
**Antes de empezar**: P5 cambió (buscar por nombre con trozos consecutivos primero y luego fraccionados; afecta a la fase 4).
**Objetivo**: Kshop Admin arranca sin red con sesión previa; catálogo y cola guardados de forma duradera, con avisos de sin
conexión en las demás pantallas.
**Validación**: en un APK de prueba y en un Android real: modo avión, abrir la app, entrar; matar la app durante una
escritura y reiniciar sin perder ni corromper ventas; el token caducado sin red no cierra la sesión. Si el archivo por venta
no aguanta, se revisa D7 antes de seguir.

### Fase 4: Pantalla de caja — HECHA (falta el Android real)
**Objetivo**: buscar, añadir y cobrar sin red, con el mismo cobro mixto de la fase 1 y guardado antes de cerrar la venta.
**Validación**: `qa:pos` con Playwright sin red (`setOffline`) a 390 px y en claro y oscuro; búsqueda fluida con 5 000
variantes; el cálculo en `@kshop/core` con tests (redondeos, vuelto, un resto de centavos).

### Fase 5: Cola de subida, retenidas y cierre del día — HECHA (falta el Android real)
**Objetivo**: subida automática al volver la red, ventas retenidas con motivo, anulación, resumen por moneda y aviso al
cerrar sesión con ventas pendientes.
**Validación**: `e2e:pos` y `qa:pos` con red intermitente, respuesta perdida tras guardar, tienda suspendida y sesión
caducada: ninguna venta se pierde ni se duplica; lo pendiente y lo subido cuadran con Finanzas.

### Fase 6: Lo que ve el dueño en la web — HECHA
**Objetivo**: filtro y etiqueta «Mostrador» en Pedidos, cobros con su tasa, faltantes y anotaciones a la vista; página del
módulo en el panel, planes y superadmin al día.
**Validación**: `qa:pos` en el panel; `qa:sections`; la pantalla de planes muestra el módulo según P1.

### Fase 7: Validación final y entrega
**Objetivo**: todo funcionando de punta a punta en la Tienda Demo y en el teléfono de Roberto; documentación y memoria al día.
**Validación**:
- [ ] `pnpm typecheck`, `lint`, `test`, `build`, `test:rls` (prueba y una vez en producción) y los comparadores
- [ ] `e2e:orders`, `e2e:pro`, `e2e:pos`, `qa:orders`, `qa:pro`, `qa:pos`, con capturas en `.titan/qa/pos/`
- [ ] APK generado en GitHub Actions **con permiso de Roberto** y probado en un Android real en modo avión
- [ ] `docs/APPS.md`, `AGENTS.md` (comandos) y memoria actualizados; KSH0002 cerrada en Tasknic al terminar
- [ ] Criterios de éxito cumplidos

**Etapa 2 (PRP aparte):** inventario de mostrador: entradas de mercancía, conteos, mermas, resolver faltantes, cámara como
lector y, si hace falta, venta por peso.

---

## Aprendizajes

> Esta sección crece durante la implementación.

### 2026-10-30: Fase 1 (KSH0002) hecha
- **Forma final:** `payments.applied_amount` (lo que salda, en la moneda del pedido), `rate_to_order numeric(18,8)` (con 6 decimales,
  «1 USD = 333 CUP» visto desde un pedido en USD pierde precisión), `change_amount`/`change_currency` (solo la moneda del pedido o la
  entregada). Un trigger pone `applied_amount = amount` a quien no lo manda (marcar pagado, importación de klauShop).
- **Cancelar con vuelto:** el primer reembolso lleva todo el saldo; si se dio vuelto en una moneda que nadie pagó, vuelve a caja como pago
  con `applied_amount = 0` y referencia «Vuelto devuelto al cancelar».
- **Producción sin cambios de saldo:** 189 pedidos, suma pagada 101 530,00 y 0 descuadres, antes y después de la migración.
- **Error:** el Historial mostraba «1,88 CUP» para un pago en USD porque formateaba con la moneda del pedido; los tests de API no lo ven.
  **Fix:** usar `payload.currency` y comprobarlo en `qa:payments`. **Aplicar en:** todo texto que muestre un pago o reembolso.
- **Tests viejos que fallan y no son de esta fase:** `e2e:orders` «sessions from before the reset» (`getClaims`, D3 de R11) y «shipping
  module disabled», y `e2e:pro` «module off on A» (caché de módulos `cacheLife("minutes")`; los tests cambian la BD por fuera).

### 2026-10-30: Fase 2 (módulo y servidor) hecha
- **Piezas:** módulo `pos` en Base y Pro, sección configurable, `orders.customer_phone` admite null solo en `channel = 'pos'`, tabla
  `pos_sales`, `pos_catalog` (paginada, sin costos), `pos_record_sale` (idempotente, con bloqueo asesor por clave) y
  `private.payment_terms`, que comparte el cálculo con `order_record_payment`. Rutas `pos/catalog` y `pos/sales`.
- **Medido en prueba:** 777 variantes de la Tienda Demo, 231 KB sin comprimir y 3,4 s en 2 páginas.
- **Producción:** migraciones y código aplicados el 2026-10-30, en ese orden: las 3 tiendas tienen el módulo, 0 ventas todavía. `test:rls` 739/740; el fallo era `09_apps_isolation`, que esperaba la versión 7 de Kshop Admin y la real ya es la 8 (arreglado y verificado en prueba).
- **Tasa sugerida:** en producción sale de la tienda, no de elTOQUE, porque `private.market_rates` está vacía (falta `ELTOQUE_API_TOKEN` en Vercel, pendiente de Roberto desde la fase 6).
- **Error:** una venta con un producto borrado rompía la función (`record "v_price" is not assigned yet`), justo lo que nunca debe fallar.
  **Fix:** asignar el record con nulos explícitos. **Aplicar en:** todo record de PL/pgSQL que se lea por una rama sin `select into`.
- **Error:** dentro de un `if` de PL/pgSQL, el primer `then` termina la condición: un `case` ahí da «syntax error at end of input».
  **Fix:** paréntesis alrededor del `case`.
- **Error:** en el proyecto de prueba, la suscripción de la Tienda Demo apuntaba a un `plan_id` que no era ni Base ni Pro, y `sync_plan_modules` le
  apagó los módulos. **Fix (solo en prueba):** apuntarla al Pro de ese proyecto. **Aplicar en:** `scripts/copy-demo-to-test.mjs` debería resolver el plan por código.
- **Falta para la fase 6:** cancelar una venta de mostrador desde la pantalla (la API ya lo permite, el botón no aparece en `delivered`) y la etiqueta «Mostrador» en la lista.
- **Sin probar:** el 403 de la API con el módulo apagado (la caché de módulos dura minutos); solo `requireModule` general y los derechos en SQL.

### 2026-10-31: Fases 3, 4 y 5 (arranque sin red, caja, subida)
- **Piezas:** `apps/admin-app/src/offline.ts` (último arranque confirmado, en almacenamiento nativo), `native.ts` (`createNativePosStorage`: un JSON por venta,
  escrito aparte y renombrado; `useOnline`), `packages/admin/src/pos/` (`storage`, `PosStatus`, `PosScreen`, `pos-sync`, `PosDay`), `packages/core/src/pos/search.ts` (búsqueda de P5,
  precio vigente, `parseDecimal`, `posDaySummary`).
- **Decisiones técnicas:** sin red con el token caducado, `getSession` da sesión vacía y error reintentable: `authUnreachable` lo distingue de un cierre de sesión. Un rechazo del servidor (estado por debajo de 500) no abre con lo guardado; el silencio o un 5xx sí. Una venta subida se conserva 7 días para el resumen del día. La tasa sugerida se guarda con el catálogo.
- **Medido:** `qa:pos-offline` 36/36 con la red cortada en el navegador, incluida la respuesta perdida tras guardar (un solo pedido), el rechazo con motivo y la anulación. Búsqueda: 6 consultas sobre 5 000 variantes por debajo de 300 ms en el PC, no en un teléfono.
- **Sin probar:** archivos nativos, `@capacitor/network`, matar la app y reiniciar: el navegador usa IndexedDB. Requiere APK y un Android real (fase 7). Tampoco el tema oscuro.
- **Error:** Vite sirvió módulos viejos tras añadir un `export *` y la app quedó en blanco (`does not provide an export named`). **Fix:** reiniciar Vite. **Aplicar en:** cualquier cambio de exports con el dev de las apps corriendo.
- **Error:** el teclado español del móvil puede escribir coma: `Number("12,5")` da NaN y el formulario no calculaba. **Fix:** `parseDecimal`, también en `PaymentsCard`. **Aplicar en:** todo campo de dinero nuevo.
- **Falta para la fase 6:** etiqueta y filtro «Mostrador» en Pedidos, botón de cancelar en una venta entregada, anotaciones (`pos_sales.flags`) a la vista del dueño y página del módulo en el panel (`availableInPhase: 9` provisional).

### 2026-10-31: Fase 6 (lo que ve el dueño)
- **Piezas:** migración `20261108101500_pos_owner_view` (`admin_orders` con `p_channel`; `admin_pos_sale`, `admin_pos_overview` y `private.pos_flag_notes`, todas `security invoker`), `apps/web/src/features/pos/components/PosPage.tsx` (Admin › Caja), `CounterSaleCard` en `OrderDetail`, pestaña «Mostrador» en `OrderList`, `canCancelOrder`, `formatRate`, `posFlagText` en `core`.
- **Decisiones técnicas:** las pestañas por estado siguen incluyendo las ventas de mostrador; «Mostrador» es una pestaña más, solo con el módulo activo. `admin_pos_*` no imitan un documento GraphQL, así que no pasan por el comparador; sí por el test de aislamiento. La lista no marca qué venta tiene anotaciones: eso está en Admin › Caja, «Para revisar».
- **Medido:** `test:rls` en prueba y producción, comparador 33/33, `qa:pos` 21/21, `e2e:pos` 28/28, `qa:pos-offline` 36/36, `qa:sections` 31/31, `qa:orders` 14/14, `core` 92 tests.
- **Error:** con un `Link` de Next, `window.location` aún tiene la URL anterior cuando se monta la página de destino, y `?tab=counter` abría en Pendientes. **Fix:** la página lee `useSearchParams` y pasa `initialTab`. **Aplicar en:** todo parámetro de URL leído en un componente compartido. `?q=` de `OrderList` (búsqueda global) usa el mismo patrón y puede tener el mismo fallo: sin comprobar.
- **Error:** `getByRole("heading", { name: "Entrega" })` coincide también con «Entregado». **Fix:** `exact: true`.
- **Error:** tras cambiar `core`, Turbopack dio 500 («module factory is not available»). **Fix:** reiniciar el servidor. `qa:orders` toma el puerto de `QA_STORE_URL`, no de `QA_BASE_URL`.

### 2026-10-31: Caja también en la web (pedido de Roberto)
- **Por qué:** quien tiene iPhone aún no tiene app; debe poder vender desde el navegador, aunque pierda lo de sin conexión.
- **Piezas:** Admin › Caja con pestañas **Vender** (`PosScreen`, la misma de Kshop Admin, con IndexedDB) y **Resumen**. `usePosPlace` dice «teléfono» o «navegador». `SidebarSignOut` avisa si quedan ventas sin subir.
- **Decisiones técnicas:** el resumen no desmonta la venta en curso. En sección gestionada el personal solo ve Resumen. Con la página abierta y sin red sigue vendiendo y sube al volver la red, con un aviso de no recargar; la web no promete abrir sin internet (no hay service worker). La barra de cobrar usa `--app-tabs-height` y `--app-sidebar-width`, que pone la web.
- **Medido:** `qa:pos` 35/35 (tamaño iPhone y escritorio, sin red, sección gestionada), `qa:pos-offline` 36/36, typecheck, lint, tests y `build` en verde. **No probado en un iPhone real** (Safari).

---

## Gotchas

- [ ] **El cambio de `refresh_order_payment` afecta a todos los pedidos**: backfill de `applied_amount` en la misma migración,
      y comprobar antes si hay pagos con moneda distinta a la del pedido (importados de klauShop incluidos).
- [ ] `alter type … add value` en su propia migración: el valor no se puede usar en la misma transacción.
- [ ] `order_event_notify` es un trigger diferido: un evento no interno enviaría WhatsApp reales al subir la cola. Ya pasó
      en la importación de klauShop.
- [ ] Una venta subida tarde cambia un día ya cerrado en Finanzas. Es correcto, pero el dueño debe poder ver que se subió
      después (`pos_sales.uploaded_at`).
- [ ] Redondeo: al cobrar el resto en otra moneda pueden quedar centavos. El último cobro debe saldar exactamente, o el
      pedido se queda en `partially_paid`.
- [ ] La suscripción al cambio de versión y el Realtime de `orders` se disparan por cada venta: comprobar que una cola larga
      no provoca una lectura por venta en los admin abiertos. `refreshCatalog` una vez por lote, no por venta.
- [ ] Dos teléfonos sin red pueden vender la misma última unidad: es el motivo por el que el stock nunca bloquea (P2).
- [ ] Desinstalar la app borra la cola: avisar en la pantalla de pendientes. Actualizar la conserva solo con la misma clave
      de firma (`docs/APPS.md`).
- [ ] `getSession` sin red con el token caducado: comprobar en la fase 3 que Supabase no borra la sesión al fallar el refresco.
- [ ] Un miembro dado de baja con ventas en cola recibe 403: quedan retenidas hasta que otro usuario de la tienda inicie
      sesión en ese teléfono; `cashier_id` conserva quién vendió.
- [ ] Las promociones del catálogo guardado llevan su fecha de fin, para no aplicar una ya vencida sin red.
- [ ] Una función de lectura sin documento GraphQL (`pos_catalog`) no tiene comparador posible; sí lleva test de aislamiento.
      `admin_order`, que cambia en la fase 1, sí pasa por el comparador y requiere `db:graphql-schema` y `codegen`.
- [ ] Medir el tamaño del catálogo guardado con imágenes: en esta etapa la caja funciona solo con texto, y las miniaturas
      se muestran solo si el WebView ya las tiene en caché.

## Anti-patrones

- NO usar `localStorage` ni `kshop.admin.*` para la cola ni para nada que no se pueda volver a descargar.
- NO reutilizar `checkout_create_order`: una venta ya cobrada no se puede rechazar por stock o precio.
- NO inventar un teléfono de relleno para el mostrador.
- NO recalcular el saldo con tasas de hoy: lo aplicado y la tasa se congelan en cada cobro.
- NO calcular dinero con decimales en coma flotante: en centavos, como `catalog/pricing.ts`.
- NO enviar el costo al teléfono ni pedir a la caja que lo conozca; el snapshot de costo lo hace el servidor al subir.
- NO subir la cola en paralelo ni en una sola petición enorme: la Nano se estrangula.
- NO borrar una venta de la cola hasta tener la confirmación del servidor.
- NO meter el inventario en esta etapa, aunque toque de cerca: va en su propio PRP.

---

*PRP aprobado el 2026-10-30.*
