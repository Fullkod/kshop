# Fase 4 — Avisos y descuentos (en curso: 4.1–4.3 descuentos hechas, faltan avisos 4.4–4.6)

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

## Falta
- 4.4–4.5: avisos por WhatsApp (OpenWA en `dry_run`), contactos, plantillas, historial, superadmin,
  recuperación por WhatsApp, enlace del aviso (cuenta → `/account/orders/{id}`, invitado → `/order/{token}`).
- 4.6 validación final.
