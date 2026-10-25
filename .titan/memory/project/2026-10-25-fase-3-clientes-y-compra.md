# Fase 3 — Clientes y compra (en curso: 3.1–3.5 hechas, falta 3.6 validación final)

PRP: `.titan/plans/prp-fase-3-clientes-y-compra.md` (decisión 23; aprendizajes ahí). Commits 8201e1f, 769428a,
d7cf1fb, 929a31f, 683be12.

## Dónde está cada pieza
- **BD** (`supabase/migrations/20261027100000…100600`): customers, customer_addresses, shipping_zones/methods,
  payment_methods, carts/cart_lines, store_order_counters, orders, order_lines, order_line_costs (solo admin),
  inventory_reservations, order_events (`is_internal` = notas del staff), payments, refunds; `private.customer_otps`,
  `private.auth_attempts`. Helpers RLS `private.my_customer_ids()` / `my_order_ids()` (JWT `kind=customer` + mismo
  `store_id`). Funciones (solo service_role): `checkout_create_order` (reserva en todos los almacenes activos, por
  defecto primero), `order_transition`, `order_set_shipping`, `order_record_payment`, `order_cancel`, `cart_merge`,
  `auth_rate_limit`, `customer_recovery_code_*`, `sales_today` (día de America/Havana). Tests: `supabase/tests/04_*`.
- **Core** `packages/core/src/orders/`: teléfono E.164 (Cuba por defecto), estados (misma tabla que el SQL, test lo
  compara), Zod, texto de WhatsApp del pedido.
- **API** `/api/v1/stores/{id}/`: `customer-auth/{register,login,reset}`, `customer` (+`addresses`, `orders`),
  `cart`, `checkout` (+`orders/{token}` público), `orders` (nuevo pedido admin) y `orders/{id}/{transition|shipping|
  payments|cancel|notes}`, `orders/sales-today`, `checkout-settings/{zones|methods|payment-methods}`,
  `customers/{id}` (bloquear) y `customers/{id}/recovery-code`.
- **Servidor** `apps/web/src/server/{customers,orders}/`. Email sintético `c_{sha256(store:phone)[0..24]}@customers…`.
- **Tienda**: sesión de cliente con `storageKey` `kshop-customer` (`features/customer-account/`), carrito en BD con
  token de invitado (`features/cart/`), páginas `/account/*`, `/cart`, `/checkout`, `/order/{token}` (botón WhatsApp).
  «Pedir por WhatsApp» de la ficha sustituido por «Añadir al carrito».
- **Admin**: `/admin/orders` (lista, detalle, nuevo, clientes, métodos de pago), `/admin/shipping`,
  `/admin/sales-today` + tarjeta en la portada (`features/orders/`, `features/sales-today/`).

## Pruebas
- `pnpm test:rls` 288/288 · `pnpm e2e:orders` 94/94 (incluye carrera por la última unidad) · core 54 tests.
- QA navegador (playwright-core del scratchpad, el MCP estaba ocupado): capturas en `.titan/qa/fase-3/`.

## Falta (3.6)
- Validación final: todo junto otra vez, E2E Playwright del happy path con cuenta y «a convenir» como script del repo
  (hoy los scripts de QA viven en el scratchpad), actualizar `arranque-y-fases.md` a «hecha».
- Pendientes conocidos: los comprobantes de pago van al bucket público `store-media` (ruta aleatoria); avisos
  automáticos y OpenWA en la Fase 4.
