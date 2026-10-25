# Fase 4 — Avisos y descuentos (hecha; falta probar con la instancia OpenWA real)

PRP: `.titan/plans/prp-fase-4-avisos-y-descuentos.md` (decisión 24; aprendizajes ahí). Commits 23ce834, a782cba,
4fa371d, e6d3b2d.

## Descuentos (hecho)
- **BD** (`supabase/migrations/20261029100000…100400`): `promotions`, `promotion_targets`, `variant_promotions`
  (materializada, la lee la tienda), `vouchers` (código en mayúsculas, único por tienda), `voucher_targets`,
  `voucher_usages` (uno por orden, `released_at` al cancelar), `order_discounts` (promotion/voucher/manual,
  `voucher_scope`); columnas `order_lines.unit_list_price/discount_amount/promotion_id/promotion_name`,
  `orders.voucher_code`, `carts.voucher_code`, `products.on_sale`. Anon y clientes nunca leen cupones.
- **Motor único en SQL** (`20261029100300_pricing_engine.sql`): `private.best_promotion` (la que deja el precio
  más bajo; categoría incluye subcategorías; colección = manual o reglas), `private.variant_sale_price`,
  `private.voucher_evaluate` (motivo en español), `public.price_lines` (carrito), `checkout_create_order`
  (promociones + cupón con `for update` + descuento manual solo canal admin), `order_set_shipping` (cupón de
  envío al fijar el costo), `order_cancel` (libera el uso). `refresh_product_summary` recalcula
  `variant_promotions`, `min_price/max_price` efectivos y `on_sale`. **pg_cron** `kshop-promotion-boundaries`
  cada minuto para las que empiezan/terminan; guardar una promoción llama `public.refresh_promotions` e
  invalida la caché del catálogo.
- **API**: `promotions[/id]`, `vouchers[/id]` (admin+, módulo `discounts`; un cupón usado se desactiva en vez de
  borrarse), `cart/voucher` (PUT, límite por IP). Error `voucher_invalid` → 422.
- **Web**: admin `/admin/discounts` (Promociones, Cupones con usos; `features/discounts/`); tienda: etiqueta
  «-N %», precio tachado, cupón en carrito y checkout (`VoucherForm` sin `<form>`, vive dentro del checkout),
  desglose en `/order/{token}` y en el detalle del admin; «Nuevo pedido» con cupón y descuento manual.
- **Tienda Demo**: promoción «Rebajas de vestidos» (-20 % en Vestidos) y cupón `BIENVENIDA10` (10 %, mínimo
  2 000 CUP, 1 por cliente) en `pnpm demo:seed`.
- Pruebas: `pnpm test:rls` 343/343 (suite 05), `pnpm e2e:discounts` 32/32 (incluye carrera por el último uso),
  `pnpm qa:discounts` 9/9 (capturas en `.titan/qa/fase-4/`).

## Avisos WhatsApp (hecho, en `dry_run`)
- **BD** (`20261030100000…100400`): `pg_net` (schema extensions) + `pg_cron`; `private.platform_config` (modo
  off/dry_run/live, URL, sesión, límites) y la API key en **Vault** (`openwa_api_key`); `store_notification_contacts`,
  `whatsapp_templates` (`store_id` null = texto de Kshop, fila de tienda = override), `notification_log` (outbox,
  único por pedido+evento+teléfono), `orders.notify_customer`.
- **Motor** (`20261030100200_notifications_engine.sql`): trigger **diferido** en `order_events` → avisos al commit
  (tienda: pedido nuevo, pagos; cliente: recibido, pendiente de pago, pagado, preparación, enviado, entregado,
  cancelado, costo de entrega). Requiere módulo `whatsapp_notifications`. Cabecera `*Tienda*` y pie fijo «Aviso
  automático… Consultas: contactos». Enlace del cliente: con cuenta → `/account/orders/{id}`, si no → `/order/{token}`.
  `dispatch_notifications` (pg_cron `kshop-whatsapp-dispatch`, cada minuto) solo envía en `live`, concilia
  `net._http_response`, reintenta 3 veces. Nunca rompe un pedido.
- **API**: `notification-contacts`, `whatsapp-templates` (+`preview`), `notifications/{id}/retry`,
  `customer/orders/{id}`, `platform/whatsapp` (+`test`, superadmin; la key nunca vuelve). Código de recuperación por
  WhatsApp cuando el modo es `live` (todas las tiendas).
- **Web**: admin `/admin/whatsapp-notifications` (Contactos, Mensajes con vista previa, Historial con «Reintentar» y
  «Abrir en WhatsApp»), avisos en la ficha del pedido, `/superadmin/whatsapp`, casilla en el checkout,
  `/account/orders/{id}`. Tienda Demo: contacto `+5350000000`.
- Pruebas: suite 06 (370/370 en total), `pnpm e2e:notifications` 29/29, `pnpm qa:notifications` 8/8.

## Pendiente
- Conectar la instancia OpenWA (misma de klauShop, otra sesión y otro número) en Superadmin › WhatsApp y enviar
  una prueba real. Hasta entonces todo queda «Simulado».
