# PRP-3: Clientes y compra en Kshop

> **Estado**: APROBADO (2026-10-25, Roberto). D1–D18 tal cual, con estos ajustes:
> - D1/D4: se entra con teléfono + contraseña; **el teléfono no se verifica** (no hay forma de confirmarlo aún).
> - D5: sin OpenWA → el staff ve el código de recuperación en «Clientes» y lo manda por `wa.me`; el emisor
>   OpenWA se conecta en la Fase 4.
> - D19: **«Nuevo pedido» desde el admin (canal `admin`) SÍ entra en esta fase** (Fase 5 del blueprint).
> **Fecha**: 2026-10-25
> **Proyecto**: Kshop
> **Fase**: 3 (ver `arranque-y-fases.md`). Código de partida: commit `12c412b` (Fase 2 cerrada salvo Lighthouse en Vercel)

---

## Objetivo

Que un cliente pueda comprar de verdad en cualquier tienda Kshop: carrito, checkout con entrega y método de
pago, pedido que se cierra por WhatsApp con la tienda y stock reservado; con cuenta opcional **por tienda**
(email sintético, recuperación por WhatsApp), y que el staff gestione desde el admin entregas, métodos de
pago, pedidos (estados, pagos, reembolsos) y clientes, con aislamiento total entre tiendas probado con tests.

## Por Qué

| Problema | Solución |
|----------|----------|
| La tienda pública de la Fase 2 es una vitrina: «Pedir por WhatsApp» manda un texto suelto, sin pedido, sin stock reservado, sin registro | Carrito + checkout que crean una **orden real** (snapshot de precios, costo, tasa, entrega) y abren WhatsApp con el resumen (decisiones 3 y 14) |
| Dos clientes pueden comprar la última unidad a la vez | Reserva blanda en una transacción con `for update` sobre `stocks` (`quantity_allocated`, ya existe desde la Fase 1) |
| Cada tienda entrega distinto (municipios, recogida, «a convenir») | Zonas y métodos de entrega por tienda (decisión 13); «a convenir» deja el costo para después, como klauShop |
| En Cuba se paga en efectivo, transferencia, Zelle…, en CUP/USD/EUR | Métodos de pago por tienda y moneda, pagos registrados a mano por el staff con referencia y foto del comprobante opcional |
| Una persona compra en varias tiendas Kshop y no debe haber cuenta compartida | Una cuenta por tienda con **email sintético** y `app_metadata.store_id`; la RLS exige que el `store_id` del JWT coincida (decisiones 6 y 11) |
| El correo de recuperación de Supabase iría al email sintético | Recuperación propia por **WhatsApp** (código de un solo uso), email como alternativa más adelante (decisión 11) |
| El dueño hoy lleva los pedidos en el chat | Admin «Pedidos» con el ciclo de estados de klauShop, acciones rápidas, historial de eventos y «ventas de hoy» |

**Valor de negocio**: es la fase que convierte Kshop en una tienda que vende; sin ella no se puede migrar
klauShop (Fase 8) ni cobrar suscripciones con sentido (Fase 5). Los avisos automáticos por WhatsApp y los
descuentos llegan en la Fase 4 sobre esta base.

## Qué

### Criterios de Éxito
- [ ] `pnpm db:migrate` aplica las migraciones de clientes, entregas, pagos, carritos y órdenes sin errores; advisors sin avisos nuevos.
- [ ] `pnpm test:rls` en verde con la suite nueva `04_orders_isolation`: un cliente de A no lee ni escribe órdenes, carritos, direcciones ni pagos de nadie más; **un JWT de cliente de A no sirve en B** aunque se copie (store_id del JWT ≠ fila); el staff de B no ve nada de A; anon no ve clientes ni órdenes; el costo (`unit_cost`) nunca llega a un cliente.
- [ ] Concurrencia: dos checkouts simultáneos por la última unidad → uno crea la orden y el otro recibe «Solo quedan 0…» (test SQL con dos sesiones o script E2E en paralelo); `stocks.quantity_allocated` nunca supera `quantity`.
- [ ] Happy path completo en `demo.kshop.localhost:3000` (390 px y escritorio): invitado añade 2 variantes al carrito → checkout (zona, mensajería, efectivo CUP) → orden `DEMO-1001` creada, stock reservado, WhatsApp abierto con el resumen → en el admin: confirmar → registrar pago → marcar pagada (stock descontado, `stock_movements` tipo `sale`) → preparar → enviar → entregar. Y la variante «a convenir»: no deja confirmar ni marcar pagada sin fijar el costo de envío. Cancelar libera la reserva (o repone el stock si estaba pagada y registra el reembolso).
- [ ] Cuentas: registrarse en la tienda A con el teléfono X y en la tienda B con el mismo teléfono crea **dos usuarios distintos** con contraseñas independientes; iniciar sesión en B con la contraseña de A falla; la recuperación por código de WhatsApp cambia la contraseña solo en esa tienda; el carrito de invitado se fusiona al iniciar sesión; «Mis pedidos» muestra solo los suyos.
- [ ] Tests de API (`pnpm e2e:orders`): 401/403/404/422 con mensajes en español, idempotencia del checkout (reintento con la misma clave no duplica la orden), transiciones inválidas rechazadas (409), módulo `shipping` desactivado → checkout sin zonas.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm build` pasan; la tienda pública sigue cacheada (añadir al carrito no rompe el prerender); capturas en `.titan/qa/fase-3/`.

### Comportamiento Esperado (Happy Path)

1. **Ficha**: el botón principal pasa a ser **«Añadir al carrito»** (con la variante elegida y cantidad,
   respetando el disponible); «Pedir por WhatsApp» queda como acción secundaria o desaparece (ver D17). El
   icono del carrito en la cabecera muestra el número de unidades.
2. **Carrito** (hoja lateral + página `/cart`): líneas con imagen, variante, precio, cantidad editable,
   subtotal en la moneda elegida; avisos si una línea se quedó sin stock o cambió de precio. Los precios se
   recalculan siempre en el servidor.
3. **Checkout** `/checkout` (una sola página, pensada para móvil): nombre y teléfono (precargados si tiene
   cuenta), zona → métodos activos de esa zona (mensajería con precio, recogida en un punto, «a convenir»),
   dirección y referencias si es entrega, método de pago (filtrado por moneda) con sus instrucciones, nota.
   Resumen: subtotal + envío (o «a convenir») = total. Casilla opcional «Crear cuenta con este teléfono» (ver D2).
4. **Confirmar pedido**: el servidor revalida stock y precios, crea la orden en una transacción (número
   `DEMO-1001`, snapshot de líneas, costo, tasa, entrega, cliente), reserva el stock y devuelve el texto
   del pedido. El navegador abre `wa.me/<whatsapp de la tienda>?text=<resumen>`; la página de confirmación
   `/order/{token}` muestra el estado, el resumen, las instrucciones de pago y el botón «Abrir WhatsApp» por
   si el navegador bloqueó la apertura.
5. **Cuenta del cliente** (opcional): `/account/register`, `/account/login`, `/account/recover` (código de 6
   dígitos por WhatsApp → nueva contraseña), `/account` (datos, direcciones, «Mis pedidos» con su estado).
6. **Admin › Pedidos**: lista con pestañas (Pendientes, Pagadas, En preparación, Enviadas, Entregadas,
   Canceladas), búsqueda por número/nombre/teléfono, aviso de pendientes viejos (> 48 h, como klauShop) y
   acciones rápidas (Confirmar, Marcar pagada, Pagada y entregada, Preparar, Enviar, Entregar). **Detalle**:
   líneas con margen (solo staff), datos de entrega, fijar costo de envío, registrar pagos (método, monto,
   moneda, referencia, foto del comprobante), cancelar (con motivo; reembolso si estaba pagada), notas
   internas, historial de eventos y botón «Escribir al cliente por WhatsApp» (`wa.me` con el texto del estado).
7. **Admin › Entregas**: zonas (municipios), métodos por zona (tipo, precio, gratis desde X, días), puntos de
   recogida. **Admin › Ajustes › Métodos de pago**: nombre, monedas, instrucciones, activo.
   **Admin › Clientes**: lista, ficha con pedidos y direcciones, bloquear/desbloquear.
   **Ventas de hoy**: total del día por moneda y número de pedidos (módulo `sales_today`, ver D16).

---

## Contexto

### Referencias
- `.titan/memory/project/modelo-de-datos.md` §2 (clientes), §4 (monedas, `payment_methods`), §5 (carrito), §6 (órdenes, reservas, eventos, pagos, reembolsos), §11 (entregas), §12 (WhatsApp por tienda).
- `.titan/memory/project/tenancy-dominios-auth.md` — email sintético `c_{hash}@customers.kshop.fullkod.com`, `app_metadata = { store_id, kind: 'customer' }`, login por `/api/v1/auth/login`, mailer de Supabase desactivado para clientes.
- `.titan/memory/project/decisiones.md` — 3 (flujo klauShop con estructura grande), 6/11 (cuenta por tienda, sin OAuth, recuperación WhatsApp), 13 (entregas), 14/15 (WhatsApp de tienda y de plataforma solo salida), 16 (`orders` core, `shipping` y `sales_today` en Base), 18 (costo y venta).
- `.titan/memory/project/app-movil.md` — todo por `/api/v1` con Bearer; la app de tienda (Fase 7) reusará carrito, checkout y cuenta.
- `.titan/plans/prp-fase-1-catalogo.md` y `prp-fase-2-tienda-publica.md` — patrones de API, RLS, caché y Aprendizajes.
- Código actual (commit `12c412b`):
  - `supabase/migrations/20261025100000_catalog_schema.sql` — `stocks.quantity_allocated` (comentado «Phase 3»), `stock_movements` (`sale`, `cancel`, `refund`), `warehouses.is_pickup_point`, `private.refresh_variant_stock` (`stock_available = Σ(quantity − allocated)`), `variant_costs`.
  - `supabase/migrations/20261024120000_platform_schema.sql` — `stores.order_prefix`, `stores.whatsapp_phone`, `private.store_private_config`; helpers `private.has_store_role`, `private.store_has_module`, `private.store_is_public`.
  - `supabase/migrations/20261024120200_seed_modules_and_plans.sql` — `orders` (core), `shipping` y `sales_today` en Base.
  - `supabase/auth-config.json` — `disable_signup: true` (los clientes se crean con la API de admin desde el servidor).
  - `apps/web/src/server/{auth,http}.ts` — `getUserFromBearer`, `requireStoreRole`, `requireModule`, `apiHandler`, `HttpError`.
  - `apps/web/src/lib/session.tsx` — sesión del staff en `localStorage` por origen (ver Gotchas: chocaría con la del cliente).
  - `apps/web/src/features/{orders,shipping,sales-today}/module.ts` — registrados con `availableInPhase: 3`.
  - `apps/web/src/features/storefront/components/whatsapp.ts` — `wa.me` de la ficha (Fase 2, D13).
  - `packages/core/src/catalog/pricing.ts` — `convertFromBase`, `formatMoney` (precio por moneda con overrides y redondeo).
- klauShop (**solo lectura**): `src/features/orders/utils/{orderStatus.tsx,paymentStatus.ts,inventory.ts,whatsapp.ts,pricing.ts}`, `src/app/api/checkout/whatsapp/route.ts` (idempotencia, reservas), `src/app/api/admin/orders/[orderId]/{change-status,mark-paid,cancel,mark-refunded,update-shipping}`, `OrderQuickActions.tsx`, `OrdersDataTable.tsx`, `drizzle/0014`/`0019` (OpenWA por `pg_net`, envío «a convenir»).
- Skills: `tf-supabase`, `supabase`, `supabase-postgres-best-practices`, `tf-playwright-cli`.

### Decisiones técnicas propuestas (Roberto confirma o cambia)

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D1 | **Identificador de la cuenta** | **Teléfono** (normalizado a E.164, Cuba `+53` por defecto) + contraseña. Es lo que todo cliente cubano tiene y el canal de recuperación es WhatsApp. Email real opcional en el perfil. Email sintético `c_{sha256(store_id + ':' + phone)[0..24]}@customers.kshop.fullkod.com` | Email real como identificador (como el diseño original de `tenancy-dominios-auth.md`); o permitir ambos (más casos y más UI) |
| D2 | **Compra sin cuenta** | **Sí, invitado por defecto** (como klauShop): nombre + teléfono bastan. Casilla «crear cuenta» en el checkout. Si el teléfono ya tiene cuenta, la orden se le asocia solo si inicia sesión (no por coincidencia de teléfono) | Cuenta obligatoria para comprar (más fricción, más datos) |
| D3 | **Alta y login de clientes** | Endpoints `/api/v1/stores/{storeId}/customer-auth/{register,login,recover/start,recover/verify,logout}` con Zod y límite de intentos. Alta = `auth.admin.createUser` con email sintético, `email_confirm: true`, `app_metadata { store_id, kind: 'customer' }` + fila `customers`. Login = resolver email sintético → `signInWithPassword` → devolver sesión (access + refresh). La tienda debe estar activa | Auth propio con JWT firmados (descartado en `tenancy-dominios-auth.md`) |
| D4 | **Verificación del teléfono** | No al registrarse (menos fricción, igual que klauShop). Solo se verifica al recuperar contraseña (el código prueba la posesión del WhatsApp) | Verificar por código al registrarse (requiere OpenWA operativo ya en el alta) |
| D5 | **Recuperación por WhatsApp** | Código de 6 dígitos, guardado con hash en `private.customer_otps` (10 min, 5 intentos, máx. 3 envíos/hora por teléfono y por IP). Envío por el **WhatsApp de la plataforma (OpenWA)** con un emisor mínimo en el servidor (`server/whatsapp/send.ts`, credenciales en env), registrado en `notification_log`. Las plantillas por evento y los avisos de pedidos siguen en la Fase 4 | Sin OpenWA aún: el staff ve el código en «Clientes» y lo manda él por `wa.me` (funciona sin infraestructura, pero no es autoservicio) |
| D6 | **Sesión del cliente en la web** | Cliente Supabase aparte con `storageKey` propio (`kshop-customer`) para no pisar la sesión del staff en el mismo origen; las páginas públicas siguen sin leer cookies (caché intacta); carrito, cuenta y checkout son componentes cliente que llaman a la API con Bearer | Cookies httpOnly con `@supabase/ssr` (rompe la caché de páginas y no sirve en la app) |
| D7 | **RLS de clientes** | Helper `private.my_customer_id(store_id)` = `customers.id` donde `user_id = auth.uid()` **y** `store_id = (auth.jwt()->'app_metadata'->>'store_id')::uuid`. Clientes solo **leen** lo suyo (perfil, direcciones, órdenes, líneas sin costo, pagos); toda escritura por API con `service_role` o función SQL | Dejar al cliente escribir su perfil/direcciones por pg_graphql (más superficie; las mutaciones van por API por regla de la app) |
| D8 | **Carrito** | En BD (`carts`, `cart_lines`) vía `/api/v1/stores/{id}/cart` con un **token de invitado** (`localStorage`) o la sesión del cliente; fusión al iniciar sesión; el servidor siempre recalcula precios y disponibilidad. Sirve igual en la app y permite ver carritos abandonados después | Carrito solo en `localStorage` con lógica en `@kshop/core` y validación en el checkout (menos peticiones, pero no se sincroniza entre dispositivos ni deja rastro) |
| D9 | **Checkout transaccional** | `POST /api/v1/stores/{id}/checkout` (Zod) → función SQL `public.checkout_create_order(...)` (`security definer`, `execute` solo `service_role`): `for update` sobre `stocks` de las variantes (orden estable por id para evitar deadlocks), comprueba disponible, toma número de la tienda, inserta orden + líneas con snapshot + reservas (`quantity_allocated += n`) + evento `created`, marca el carrito `converted`. **Clave de idempotencia** (`unique (store_id, idempotency_key)`) para reintentos | Lógica en TypeScript con varias llamadas (sin transacción real con la API de Supabase) |
| D10 | **Reserva y almacén** | Reserva al crear la orden en el almacén por defecto (con un solo almacén activo en Base). `paid` consume (`quantity -= n`, `allocated -= n`, `stock_movements` `sale`); `cancelled` libera (`allocated -= n`) o, si estaba pagada, repone (`refund`). **Sin caducidad automática** en el MVP: aviso de pendientes > 48 h como klauShop; auto-cancelar tras N h queda como opción por tienda más adelante | Caducidad automática con `pg_cron` (puede cancelar pedidos que la tienda está cerrando por WhatsApp) |
| D11 | **Estados** | Ciclo de klauShop: `pending_confirmation → pending_payment → paid → processing → shipped → delivered`, `cancelled` desde cualquiera antes de `shipped`; `pending_confirmation → paid` directo permitido. Una sola fuente: tabla de transiciones en `@kshop/core` (UI) y la misma comprobación en `public.order_transition(...)` (SQL, `for update` sobre la orden). Confirmar o marcar pagada exige costo de envío definido (`to_agree` → fijarlo antes). `payment_status` aparte: `unpaid`, `partially_paid`, `paid`, `refunded` | Estados configurables por tienda (más flexible, mucho más complejo) |
| D12 | **Pagos** | `payment_methods` por tienda (nombre, monedas, instrucciones, orden, activo). Pagos **manuales** registrados por el staff (`payments`: método, monto, moneda, referencia, foto opcional en `stores/{id}/payments/…`); `payment_status` se calcula por suma en la moneda de la orden. «Marcar pagada» crea el pago por el resto si no hay. Reembolsos en `refunds` al cancelar una orden pagada | Solo un flag «pagada» sin tabla de pagos (no sirve para Finanzas en la Fase 6) |
| D13 | **Entregas** | `shipping_zones` + `shipping_methods` (`delivery`/`pickup`/`to_agree`, precio en moneda base, `free_over_subtotal`, días) por tienda; los puntos de recogida son `warehouses` con `is_pickup_point` (ya existe, sin tabla nueva). Con el módulo `shipping` apagado, el checkout no pide zona y la entrega queda «a convenir» | Tabla `pickup_points` separada (como el borrador del modelo) |
| D14 | **Monedas en la orden** | La orden se crea en la moneda elegida por el cliente (si `multi_currency` y la moneda está activa; si no, la base) con `exchange_rate` congelada; líneas con `unit_price` en esa moneda y `unit_cost` + `cost_currency` para el margen. Envío convertido con la misma tasa | Órdenes siempre en moneda base y solo mostrar la conversión |
| D15 | **Número de orden** | Contador por tienda (`store_order_counters`, `update … returning` dentro de la transacción), empezando en 1001; se muestra `{order_prefix}-{number}`. Página pública del pedido por **token aleatorio** (`/order/{public_token}`), no por número | `sequence` por tienda (no se pueden crear dinámicamente sin DDL); UUID visible (feo para WhatsApp) |
| D16 | **«Ventas de hoy»** | Incluido en esta fase: tarjeta en la portada del admin (pedidos y totales del día por moneda, zona horaria `America/Havana`), detrás del módulo `sales_today` | Dejarlo para la Fase 6 junto a Finanzas |
| D17 | **WhatsApp en esta fase** | Cliente → tienda por `wa.me` al crear la orden (resumen sin datos sensibles + enlace a `/order/{token}`). Staff → cliente con botón `wa.me` en el detalle (texto según estado). **Avisos automáticos** (orden nueva a contactos, cambios de estado al cliente) en la Fase 4. En la ficha se quita «Pedir por WhatsApp» (el carrito lo sustituye) | Mantener ambos botones en la ficha |
| D18 | **Caché de la tienda** | Cada reserva cambia `stock_available`: la función de checkout devuelve las variantes que **pasan a agotadas** (o vuelven a tener stock al cancelar) y solo entonces se invalida `store:{id}:catalog`. La disponibilidad exacta la decide siempre el servidor en carrito y checkout | Invalidar en cada orden (vacía la caché de la tienda con cada venta) |
| D19 | **Alcance del admin** | Pedidos, Entregas, Métodos de pago, Clientes (ver, bloquear, ver pedidos) y Ventas de hoy. **Fuera**: crear pedidos a mano desde el admin (canal `admin`), editar líneas de una orden, fulfillments parciales, impresión de etiquetas | Incluir ya «Nuevo pedido» desde el admin (klauShop lo tiene; añade una pantalla grande) |

### Arquitectura Propuesta

```
supabase/
├── migrations/
│   ├── 20261027xxxxxx_customers_shipping_payments.sql  customers, customer_addresses, shipping_zones, shipping_methods,
│   │                                                    payment_methods, private.customer_otps, notification_log; RLS + helper
│   ├── 20261027xxxxxx_carts_orders.sql                  carts, cart_lines, store_order_counters, orders, order_lines,
│   │                                                    inventory_reservations, order_events, payments, refunds; RLS
│   └── 20261027xxxxxx_order_functions.sql               cart_merge, checkout_create_order, order_transition, order_set_shipping,
│                                                        order_record_payment, order_cancel (for update, solo service_role)
└── tests/04_orders_isolation.test.sql                   cliente A vs B, JWT con store_id cruzado, staff B, anon, sin costo,
                                                         transiciones inválidas, stock nunca negativo

packages/core/src/orders/                                Zod (checkout, carrito, cliente, pago), máquina de estados + etiquetas,
                                                         totales, teléfono E.164, texto de WhatsApp del pedido
packages/data/src/{order-queries,customer-queries}.ts    lecturas GraphQL (staff y cliente) + cliente de la API de carrito/checkout/cuenta

apps/web/src/
├── app/s/[storeSlug]/(front)/{cart,checkout,order/[token],account/…}/   páginas cliente (shell estático + componentes cliente)
├── features/cart/ · features/checkout/ · features/customer-account/      carrito (hoja + página), checkout, cuenta
├── features/orders/      module.ts + admin Pedidos (lista, detalle, acciones, pagos)
├── features/shipping/    module.ts + admin Entregas
├── features/customers/   admin Clientes            · features/sales-today/  tarjeta de ventas del día
├── server/customers/     email sintético, alta/login, OTP, límite de intentos
├── server/whatsapp/      emisor mínimo OpenWA (D5)
└── app/api/v1/stores/[storeId]/{customer-auth,cart,checkout,orders,shipping,payment-methods,customers}/…
```

### Modelo de Datos

```sql
create type public.order_status   as enum ('pending_confirmation','pending_payment','paid','processing','shipped','delivered','cancelled');
create type public.payment_status as enum ('unpaid','partially_paid','paid','refunded');
create type public.order_channel  as enum ('web','app','admin');
create type public.shipping_type  as enum ('delivery','pickup','to_agree');
create type public.cart_status    as enum ('active','converted','abandoned');
create type public.reservation_status as enum ('active','consumed','released');

-- Todas: store_id not null FK stores on delete cascade, unique (store_id, id) en las padre, FK compuestas
-- (store_id, x_id), índices con store_id primero, created_at/updated_at, RLS habilitada.

customers          (id, store_id, user_id null → auth.users, phone, email, first_name, last_name, is_blocked,
                    accepts_marketing, note, last_order_at)           unique (store_id, phone), unique (store_id, user_id)
customer_addresses (id, store_id, customer_id, label, recipient, phone, shipping_zone_id null, address, reference, is_default)
shipping_zones     (id, store_id, name, description, sort_order, is_active)
shipping_methods   (id, store_id, zone_id, type, name, price numeric(12,2) /* moneda base */, free_over_subtotal null,
                    warehouse_id null /* punto de recogida */, min_days, max_days, sort_order, is_active)
payment_methods    (id, store_id, name, currencies currency_code[], instructions, sort_order, is_active)
carts              (id, store_id, token uuid unique, customer_id null, currency, status, updated_at)
cart_lines         (cart_id, store_id, variant_id, quantity)          pk (cart_id, variant_id)
store_order_counters (store_id pk, last_number int)
orders             (id, store_id, number int, public_token uuid unique, idempotency_key, customer_id null, channel,
                    status, payment_status, currency, exchange_rate, subtotal, shipping_total null /* null = a convenir */,
                    discount_total, total null, customer_snapshot jsonb, shipping_snapshot jsonb /* zona, método, dirección */,
                    payment_method_id null, customer_note, staff_note, confirmed_at, paid_at, cancelled_at, cancel_reason)
                    unique (store_id, number), unique (store_id, idempotency_key), idx (store_id, status, created_at desc)
order_lines        (id, store_id, order_id, variant_id null, product_name, variant_name, sku, attributes jsonb, image_url,
                    quantity, unit_list_price, unit_price, line_total, unit_cost null, cost_currency null)
inventory_reservations (id, store_id, order_id, variant_id, warehouse_id, quantity, status)
order_events       (id, store_id, order_id, type, payload jsonb, user_id null, created_at)
payments           (id, store_id, order_id, payment_method_id null, amount, currency, reference, evidence_path, recorded_by, created_at)
refunds            (id, store_id, order_id, amount, currency, reason, recorded_by, created_at)
notification_log   (id, store_id, order_id null, channel, recipient, event, status, error, sent_at)
private.customer_otps (id, store_id, phone, purpose, code_hash, attempts, expires_at, consumed_at, ip)

-- Existentes que se usan: stocks.quantity_allocated, stock_movements (sale/cancel/refund), warehouses.is_pickup_point,
-- stores.order_prefix, stores.whatsapp_phone, store_currencies (tasa y redondeo), variant_costs.
```

RLS (patrón de las fases 0b–2: `revoke all` y conceder lo justo; escrituras por API con `service_role` o funciones SQL):

| Tabla | anon | cliente (JWT `kind=customer`, mismo `store_id`) | staff de la tienda / superadmin |
|-------|------|------------------------------------------------|----------------------------------|
| `shipping_zones`, `shipping_methods`, `payment_methods` | activos de tiendas públicas | ídem | todo (escritura admin+ por API) |
| `customers`, `customer_addresses` | — | solo la propia fila / sus direcciones | leer todo; bloquear por API |
| `carts`, `cart_lines` | — (por API con token) | — (por API) | leer (abandonados, más adelante) |
| `orders`, `order_events` (sin `staff_note` ni eventos internos), `payments` | — | solo sus órdenes | todo; cambios solo por funciones |
| `order_lines` | — | sus líneas **sin** `unit_cost`/`cost_currency` (grant por columnas o vista) | todo |
| `inventory_reservations`, `refunds`, `notification_log`, `store_order_counters` | — | — | leer (staff); escritura solo funciones |
| `private.customer_otps` | — | — | — (solo `service_role`) |

---

## Blueprint (Assembly Line)

> IMPORTANTE: Solo se definen FASES. Las subtareas se generan al entrar a cada fase
> siguiendo el bucle agéntico (mapear contexto → generar subtareas → ejecutar).

### Fase 1: Esquema y tests de aislamiento
**Objetivo**: migraciones de clientes, entregas, métodos de pago, carritos, órdenes, reservas, eventos, pagos,
reembolsos, contador, OTP y log; helper `private.my_customer_id`; RLS y grants (costo fuera del alcance del
cliente); suite `04_orders_isolation.test.sql` con JWT simulados de cliente A, cliente A con `store_id` de B,
staff B y anon.
**Validación**: `pnpm db:migrate` sin errores; advisors limpios; `pnpm test:rls` en verde (01–04); romper a
propósito una política hace fallar un test; `pnpm db:graphql-schema && pnpm codegen` OK.

### Fase 2: Funciones transaccionales de compra y estados
**Objetivo**: `cart_merge`, `checkout_create_order` (D9, D10, D14, D15, D18), `order_transition` (D11),
`order_set_shipping`, `order_record_payment` (D12), `order_cancel` (liberar/reponer + reembolso), todas con
`for update`, eventos y `stock_movements`; `execute` solo para `service_role`.
**Validación**: tests SQL: stock nunca negativo ni `allocated > quantity`, idempotencia, transiciones
inválidas rechazadas, «a convenir» bloquea confirmar/pagar, `paid` consume y `cancel` libera/repone,
números consecutivos por tienda; carrera por la última unidad con dos conexiones.

### Fase 3: Core, data y cuentas de cliente
**Objetivo**: en `@kshop/core` los Zod, la máquina de estados con etiquetas en español, totales, teléfono
E.164 y el texto de WhatsApp del pedido; en `@kshop/data` las consultas y el cliente de la API; en el
servidor el alta/login/recuperación (D1–D5), el emisor OpenWA mínimo, el límite de intentos y la sesión
separada del cliente (D6); páginas `/account/{register,login,recover}` y `/account`.
**Validación**: Vitest de core (transiciones, totales, teléfonos, texto); E2E de API: mismo teléfono en A y B
= dos usuarios, login cruzado falla, token de A rechazado en B, recuperación por código, límites de intentos;
la sesión del staff y la del cliente conviven en el mismo subdominio.

### Fase 4: Carrito y checkout en la tienda
**Objetivo**: API de carrito (token de invitado, fusión al iniciar sesión) y de checkout; «Añadir al
carrito» en la ficha, hoja y página del carrito, `/checkout` con zona/método/dirección/pago/moneda, apertura
de WhatsApp, `/order/{token}` y «Mis pedidos»; invalidación selectiva de la caché (D18).
**Validación**: happy path pasos 1–5 en el navegador (390 px y escritorio) sobre la Tienda Demo; la portada,
listados y ficha siguen sirviéndose desde la caché; stock reservado visible en el admin del catálogo.

### Fase 5: Admin de entregas, pagos, pedidos y clientes
**Objetivo**: API y pantallas de Entregas (zonas, métodos, puntos de recogida), Métodos de pago, Pedidos
(lista con pestañas y búsqueda, acciones rápidas, detalle con envío, pagos con comprobante, cancelación,
notas, eventos, `wa.me` al cliente), **«Nuevo pedido» desde el admin** (canal `admin`, misma función de checkout:
buscar variantes, cliente existente o datos sueltos, entrega y pago), Clientes y Ventas de hoy (D16); `demo:seed` ampliado con zonas, métodos
de pago y algunos pedidos de ejemplo; script `pnpm e2e:orders`.
**Validación**: tests de API (401 sin token, 403 staff de B sobre A, 403 `module_not_enabled` en
`shipping`/`sales_today`, 409 transición inválida, 422 Zod en español); paso 6–7 del happy path en el
navegador; el staff (rol `staff`) puede gestionar pedidos pero no entregas ni métodos de pago (admin+).

### Fase 6: Validación final
**Objetivo**: sistema funcionando end-to-end.
**Validación**:
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pasan
- [ ] `pnpm test:rls` y E2E de API (fases 0b, 1, 2 y 3) en verde
- [ ] E2E Playwright del happy path completo (invitado y con cuenta, «a convenir», cancelación) con capturas en `.titan/qa/fase-3/` (móvil y escritorio)
- [ ] Criterios de éxito cumplidos; memoria (`.titan/memory/project/`), `arranque-y-fases.md` y este PRP actualizados

---

## Preguntas para Roberto (antes de aprobar)

> Respondidas el 2026-10-25: 1 teléfono (sin verificarlo), 2 sin OpenWA (alternativa), 3 sí, 4 sin caducidad,
> 5 sí, «Nuevo pedido» desde el admin entra en esta fase.

1. **D1**: ¿el cliente entra con **teléfono** (propuesta) o con email?
2. **D5**: ¿hay ya una instancia de OpenWA (URL, API key, sesión) que Kshop pueda usar para mandar los códigos de recuperación? Si no, se hace la alternativa (código visible para el staff) y el emisor se conecta en la Fase 4.
3. **D2**: ¿se permite comprar sin cuenta (propuesta: sí, como klauShop)?
4. **D10**: ¿reservas sin caducidad automática (propuesta) o auto-cancelar tras N horas?
5. **D19**: ¿«Nuevo pedido» desde el admin entra en esta fase o después?

---

## 🧠 Aprendizajes (Self-Annealing / Neural Network)

> Esta sección CRECE con cada error encontrado durante la implementación.

---

## Gotchas

- [ ] La sesión del staff vive en `localStorage` del mismo subdominio (`lib/session.tsx`): el cliente necesita su propio `storageKey`, o iniciar sesión como cliente cerraría la del admin (y al revés).
- [ ] `disable_signup: true` en Auth: el alta de clientes va por `auth.admin.createUser` con la service key, nunca desde el navegador; el mailer de Supabase nunca debe enviar a `@customers.kshop.fullkod.com`.
- [ ] El `store_id` de la ruta de la API no basta: comprobar que coincide con `app_metadata.store_id` del token del cliente (y que `kind = 'customer'`); un staff con email real no es cliente de su tienda.
- [ ] `for update` sobre varias filas de `stocks`: bloquear siempre en el mismo orden (por `variant_id`) para evitar deadlocks entre checkouts.
- [ ] `stock_available` se recalcula por trigger al tocar `stocks`: cada reserva lo cambia; no invalidar la caché pública en cada venta (D18) y no fiarse de la disponibilidad cacheada en el checkout.
- [ ] Con Cache Components, carrito, cuenta y checkout son componentes cliente dentro de `<Suspense>`; las páginas públicas no deben leer cookies ni la sesión.
- [ ] El texto de `wa.me` tiene límite práctico (~2 000 caracteres en algunos clientes): resumir líneas si el pedido es largo y siempre incluir el enlace `/order/{token}`.
- [ ] `window.open` tras un `await` lo bloquean los navegadores móviles: abrir WhatsApp con un enlace que el usuario pulsa en la confirmación (o redirigir en la misma pestaña).
- [ ] Precios y totales: redondeo por moneda (`store_currencies.rounding`) aplicado por línea y no al total, igual en core y en SQL; `numeric`, nunca `float`.
- [ ] El costo (`unit_cost`) se copia en la orden pero jamás llega al cliente: grant por columnas o vista, y test que lo compruebe por pg_graphql como cliente.
- [ ] Teléfonos cubanos: aceptar `5xxxxxxx`, `+53 5xxx xxxx`, `0053…`; normalizar antes de hashear para el email sintético (si no, la misma persona tendría dos cuentas).
- [ ] Rate limiting sin Redis: tabla en `private` con ventana por teléfono e IP; en Vercel la IP viene en `x-forwarded-for`.
- [ ] Zona horaria de «ventas de hoy» y de los avisos de 48 h: `America/Havana`, no UTC.

## Anti-Patrones

- NO confiar en precios, totales ni disponibilidad que mande el cliente: todo se recalcula en el servidor.
- NO crear órdenes ni mover stock fuera de una función SQL transaccional.
- NO poner lógica de negocio en Server Actions ni en componentes con `next/*` (la app de la Fase 7 usa la misma API).
- NO identificar al cliente por teléfono sin sesión (asociar una orden de invitado a una cuenta por coincidencia de teléfono filtra pedidos ajenos).
- NO enviar avisos automáticos a clientes en esta fase (Fase 4) ni procesar respuestas de WhatsApp (decisión 15).
- NO crear nuevos patrones si los de las fases 0b–2 funcionan (API, Zod, `requireStoreRole`, `requireModule`, tags de caché).
- NO ignorar errores de TypeScript ni introducir `any`.

---

*PRP pendiente aprobación. No se ha modificado código.*
