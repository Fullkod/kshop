# PRP-4: Avisos y descuentos en Kshop

> **Estado**: EN CURSO — 4.1–4.3 (descuentos) hechas: commits 23ce834, a782cba, 4fa371d, e6d3b2d; faltan 4.4–4.6 (avisos y validación). APROBADO (2026-10-25) — Roberto: D20 sí; OpenWA = la misma instancia de klauShop con otra sesión y otro número; D6 sí (uso al crear la orden); D10 sí (descuento manual libre); D18 cambiada (ver D18); D19 sí. Resto de D tal cual.
> **Fecha**: 2026-10-25
> **Proyecto**: Kshop
> **Fase**: 4 (ver `arranque-y-fases.md`). Código de partida: commit `98a564c` (Fase 3 cerrada)

---

## Objetivo

Que cada tienda pueda **vender con descuentos** (promociones automáticas con precio tachado y cupones en el
carrito), calculados en el servidor por una sola función y guardados como snapshot en la orden; y que la
plataforma **avise por WhatsApp** (un solo número OpenWA, solo salida) a los contactos de la tienda y al
cliente cuando se crea o cambia un pedido, con plantillas por tienda y un log de envíos. Todo debe funcionar
y probarse **sin instancia de OpenWA** (modo simulado) y quedar listo para conectarla sin tocar código.

## Por Qué

| Problema | Solución |
|----------|----------|
| `orders.discount_total` existe desde la Fase 3 pero siempre vale 0; la única «oferta» es el `compare_at_price` fijo de la variante | Promociones automáticas por producto/variante/categoría/colección/marca con fechas, y cupones con código, límites y mínimos (modelo §8, decisión 10: descuentos en el MVP) |
| El precio se calcula en dos sitios (TypeScript en `server/orders/cart.ts` y SQL en `private.variant_price_in`): añadir descuentos en ambos los haría divergir | Un **motor de precios único en SQL** que usan carrito, checkout y «Nuevo pedido» del admin |
| El dueño se entera de un pedido solo si el cliente le escribe; el cliente no sabe cuándo se confirmó, pagó o envió | Avisos automáticos por el WhatsApp de la plataforma: orden nueva → contactos de la tienda; cambios de estado → cliente (decisiones 14 y 15) |
| La recuperación de contraseña depende de que el staff mande el código a mano por `wa.me` (Fase 3, D5) | Con OpenWA activo el código llega solo; sin él sigue la alternativa actual |
| Aún no hay instancia de OpenWA | Modo `off` / `dry_run` / `live` de plataforma: en `dry_run` el mensaje se renderiza y queda en el log como «simulado», así se prueba todo hoy |

**Valor de negocio**: los cupones y las ofertas son lo que «engancha» del plan Base (decisión 16) y lo que
klauShop necesita para migrar (Fase 8); los avisos por WhatsApp son el primer módulo de pago (Pro/suelto) que
justifica cobrar suscripciones en la Fase 5.

## Qué

### Criterios de Éxito
- [ ] `pnpm db:migrate` aplica las migraciones de descuentos y avisos sin errores; advisors sin avisos nuevos; `pnpm db:graphql-schema && pnpm codegen` OK.
- [ ] `pnpm test:rls` en verde con las suites nuevas `05_discounts_isolation` y `06_notifications_isolation`: anon y clientes **no pueden listar cupones** (ni de su tienda); el staff de B no ve promociones, cupones, usos, contactos, plantillas ni log de A; el cliente solo ve los descuentos de **sus** órdenes; la config de OpenWA no es legible por nadie salvo `service_role`.
- [ ] Descuentos en la Tienda Demo: una promoción «-20 % en la categoría X» se ve tachada en portada, listado, ficha y carrito (CUP y USD con redondeo) en ≤ 1 min tras guardarla o tras su hora de inicio, y desaparece al terminar; el cupón `BIENVENIDA10` (10 %, mínimo 2 000 CUP, 1 uso por cliente) se aplica en el carrito, se rechaza con mensaje en español cuando no cumple, y la orden guarda **por línea** el precio de lista, el precio con promoción y **por orden** el cupón y su importe; `total = subtotal − descuento + envío` cuadra en CUP y en USD.
- [ ] Concurrencia y límites: un cupón con `usage_limit = 1` usado en dos checkouts simultáneos → una orden lo aplica y la otra recibe «Este cupón ya no está disponible»; cancelar la orden libera el uso; con el módulo `discounts` apagado no se aplica nada y los datos siguen ahí.
- [ ] Avisos en modo `dry_run`: crear un pedido genera en el log un aviso por cada contacto con `notify_new_order` y uno al cliente; confirmar/pagar/enviar/entregar/cancelar genera el aviso del cliente con la plantilla de la tienda (o la de la plataforma); nunca se duplica un aviso (mismo pedido + evento + destinatario); un fallo del envío **nunca** rompe ni frena la orden; sin el módulo `whatsapp_notifications` no se genera nada.
- [ ] Con una instancia OpenWA de prueba (cuando exista): poner URL/API key/sesión desde el superadmin y pasar a `live` hace llegar los mensajes reales sin desplegar código (si no hay instancia al cerrar la fase, este punto queda pendiente y anotado).
- [ ] `pnpm e2e:discounts` y `pnpm e2e:notifications` en verde (401/403/404/409/422 en español, módulo apagado → 403 `module_not_enabled`); `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pasan; la tienda pública sigue cacheada; capturas en `.titan/qa/fase-4/`.

### Comportamiento Esperado (Happy Path)

1. **Admin › Descuentos › Promociones**: el dueño crea «Black Friday»: 20 %, sobre la categoría «Zapatos» y
   la colección «Ofertas», del viernes 00:00 al domingo 23:59 (hora de La Habana). Ve cuántos productos
   abarca. Al guardar (o al llegar la fecha) la tienda muestra el precio tachado y la etiqueta «-20 %».
2. **Admin › Descuentos › Cupones**: crea `BIENVENIDA10`: 10 % sobre el pedido, mínimo 2 000 CUP, 100 usos en
   total, 1 por cliente, válido un mes. Otros tipos: importe fijo, envío gratis, o solo para ciertos productos.
   Ve los usos (pedido, cliente, importe).
3. **Tienda**: el cliente añade productos (ya rebajados por la promoción), en el carrito o el checkout escribe
   el cupón → «Cupón aplicado: −480 CUP» o el motivo del rechazo («El pedido mínimo es 2 000 CUP»). El resumen
   muestra subtotal, descuento, envío y total. Al confirmar, el servidor recalcula todo, bloquea el cupón y
   crea la orden con los descuentos congelados. El texto de WhatsApp al número de la tienda incluye el descuento.
4. **Aviso de orden nueva**: los contactos de la tienda con «avisar pedidos nuevos» reciben, desde el
   WhatsApp de la plataforma, `*Tienda Demo* — Pedido DEMO-1012 …` con cliente, líneas, total y enlace al
   admin; el cliente recibe «Recibimos tu pedido…», con la aclaración de que es un aviso automático y los
   teléfonos de la tienda para cualquier consulta.
5. **Cambios de estado**: el staff confirma → el cliente recibe la plantilla «pendiente de pago» con las
   instrucciones del método de pago; al pagar, enviar, entregar o cancelar, la del evento. Fijar el costo de
   un envío «a convenir» también avisa al cliente con el nuevo total.
6. **Admin › Avisos WhatsApp**: contactos de la tienda (nombre, teléfono, qué avisos recibe, si se muestra al
   cliente como contacto), plantillas por evento con variables, vista previa con un pedido real y
   restaurar la de la plataforma; **historial** de envíos (pendiente, enviado, simulado, fallido + error) con
   «Reintentar» y «Abrir en WhatsApp» (`wa.me` con el mismo texto, por si el envío automático falla). En la
   ficha del pedido se ven los avisos de ese pedido.
7. **Superadmin › WhatsApp de la plataforma**: URL de OpenWA, API key, id de sesión, modo (`off`, `dry_run`,
   `live`), límite de envíos por minuto y «Enviar mensaje de prueba». Estado de la cola (pendientes, fallidos
   de las últimas 24 h).
8. **Recuperación de contraseña**: si el WhatsApp de la plataforma está en `live`, el cliente recibe el código
   de 6 dígitos solo; si no, sigue el flujo de la Fase 3 (el staff lo ve y lo manda por `wa.me`).

---

## Contexto

### Referencias
- `.titan/memory/project/modelo-de-datos.md` §8 (descuentos: `promotions`, `promotion_targets`, `vouchers`, `voucher_targets`, `voucher_usages`; una promoción por línea + un cupón por orden) y §12 (`store_notification_contacts`, `whatsapp_templates`, `notification_log`; un WhatsApp de plataforma, solo salida, mensaje empieza con el nombre de la tienda y remite a contactos `show_to_customer`).
- `.titan/memory/project/decisiones.md` — 10 (descuentos en el MVP), 14/15 (WhatsApp de tienda y de plataforma solo salida), 16 (`discounts` en Base, `whatsapp_notifications` en Pro/suelto), 23 (Fase 3: sin OpenWA aún).
- `.titan/memory/project/modulos-y-planes.md` — comprobación en tres capas; desactivar un módulo no borra datos.
- `.titan/plans/prp-fase-3-clientes-y-compra.md` — D9 (checkout transaccional), D11 (estados), D12 (pagos), D14 (moneda y tasa congeladas), D17 (WhatsApp en la Fase 3) y sus Aprendizajes (datos solo-staff con el mismo rol `authenticated`, multi-almacén, `insert … returning`).
- Código actual (commit `98a564c`):
  - `supabase/migrations/20261024120200_seed_modules_and_plans.sql` — módulos `discounts` (Base) y `whatsapp_notifications` (Pro) ya sembrados.
  - `apps/web/src/features/{discounts,whatsapp-notifications}/module.ts` — registrados con `availableInPhase: 4`.
  - `supabase/migrations/20261027100000_orders_schema.sql` — `orders.discount_total` (siempre 0), `order_lines` (`unit_price`, `compare_at_price`, `line_total`; sin campos de descuento), `order_events`.
  - `supabase/migrations/20261027100200_order_functions.sql` — `private.convert_from_base`, `private.variant_price_in`, `order_transition`, `order_set_shipping`, `order_cancel` (recalculan `total` con `discount_total`).
  - `supabase/migrations/20261027100400_checkout_multi_warehouse.sql` — versión vigente de `checkout_create_order`.
  - `apps/web/src/server/orders/cart.ts` — precios del carrito calculados en TypeScript (duplica `variant_price_in`).
  - `supabase/migrations/20261026100100_storefront_functions.sql` — `product_matches_rules` (`onSale` = `compare_at_price > price`) y filtro `p_on_sale`; `products.min_price/max_price` desnormalizados (`private.refresh_product_summary`).
  - `apps/web/src/server/storefront/data.ts` — catálogo cacheado con `cacheLife("minutes")` y tags `store:{id}:catalog`.
  - `apps/web/src/server/customers/accounts.ts` — código de recuperación (hoy lo ve el staff).
  - `packages/core/src/orders/whatsapp.ts` — texto de WhatsApp del pedido (cliente → tienda).
  - `private.store_private_config` (por tienda) existe; **no hay** config de plataforma. Extensiones: `supabase_vault` instalada; `pg_net` y `pg_cron` disponibles, **no instaladas**.
- klauShop (**solo lectura**): `drizzle/0014_whatsapp_notifications.sql` (trigger → `pg_net` → OpenWA `POST {base}/sessions/{id}/messages/send-text` con `X-API-Key`, `send_wa` que nunca lanza, `wa_phone_to_chat_id`, trigger diferido al commit), `0015_whatsapp_admin_contacts.sql`, `0019_whatsapp_shipping_to_agree.sql`.
- Saleor (promotions + vouchers) como modelo conceptual (ver `reference/fuentes.md`).
- Skills: `tf-supabase`, `supabase`, `supabase-postgres-best-practices`, `tf-playwright-cli`.

### Decisiones técnicas propuestas (Roberto confirma o cambia)

**Descuentos**

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D1 | **Motor de precios único** | Función SQL `public.price_lines(store_id, currency, lines, voucher_code, customer_id, phone)` (`stable`, solo `service_role`) que devuelve por línea precio de lista, promoción aplicada, precio final, y por pedido subtotal, cupón, descuento y motivo de rechazo. La usan el carrito (sustituye el cálculo en TS de `cart.ts`), `checkout_create_order`, «Nuevo pedido» del admin y `order_set_shipping` | Mantener el cálculo en TS para el carrito y en SQL para la orden (dos fuentes que divergirían con los descuentos) |
| D2 | **Promociones automáticas** | `reward` `percent` o `fixed` (importe en moneda base, convertido con tasa y redondeo); objetivos: producto, variante, categoría (incluye subcategorías), colección, marca; fechas en `America/Havana`; activa/pausada. **Una promoción por línea: la que deja el precio más bajo** (empate → `priority`, luego la más reciente). Nunca baja de 0 | Promociones que se suman entre sí (más complejo de explicar al dueño) |
| D3 | **Precio tachado con promoción** | Precio de lista mostrado = `compare_at_price` si existe y es mayor, si no el precio normal; precio final = el de la promoción. La etiqueta «-20 %» se calcula sobre el precio normal | Ignorar `compare_at_price` cuando hay promoción |
| D4 | **Promociones en la tienda pública (caché)** | Precio efectivo **materializado** en `variant_promotions` (variant_id, promotion_id, promo_price base) y `products.min_price`/`on_sale` recalculados: al guardar una promoción (+ invalidar `store:{id}:catalog`) y por **`pg_cron` cada minuto** para las que empiezan o terminan (el catálogo usa `cacheLife("minutes")`, así que la tienda refleja la frontera en ≤ ~1–5 min sin webhook de revalidación). Los listados, filtros de precio, «En oferta» y colecciones automáticas `onSale` usan el precio efectivo. El carrito y el checkout recalculan siempre en vivo (D1) | Calcular la promoción en cada lectura pública (más lento y pg_graphql no puede filtrar/ordenar por ese precio) |
| D5 | **Cupones** | `scope`: `order` (sobre el subtotal ya rebajado), `specific` (solo líneas de ciertos productos/categorías/colecciones/marcas), `shipping` (envío gratis o −importe). `reward` `percent`/`fixed` (base, convertido). Condiciones: `min_subtotal` (base, convertido), `min_quantity`, fechas, `usage_limit`, `usage_per_customer`. Código **sin distinguir mayúsculas**, único por tienda. **Un cupón por pedido**, compatible con las promociones | Cupón que no se acumula con promociones (opción por cupón «no acumulable» se puede añadir luego) |
| D6 | **Uso de cupones e invitados** | Al crear la orden: `for update` sobre el cupón, comprobar límites y `voucher_usages` (por `customer_id` o, si es invitado, por **teléfono normalizado**), `used_count += 1`. Cancelar la orden **libera el uso**. El cupón no se «reserva» en el carrito: solo se valida y se muestra | Contar el uso solo al pagar (permitiría abusar del límite con pedidos sin pagar) |
| D7 | **Snapshot en la orden** | `order_lines` + `unit_list_price`, `discount_amount` (por unidad × cantidad), `promotion_id` null, `promotion_name`; tabla `order_discounts` (store_id, order_id, kind `promotion`/`voucher`/`manual`, source_id null, code, name, reward, value, amount, currency) para el desglose; `orders.discount_total` = suma de cupón (y promociones van ya en `unit_price`, ver D8); `orders.voucher_code`. Nada se recalcula después aunque cambie la promoción | Solo `discount_total` sin desglose (insuficiente para Finanzas, Fase 6) |
| D8 | **Qué cuenta como «descuento» del pedido** | `subtotal` = Σ líneas a precio con promoción; `discount_total` = cupón (pedido o envío); `total = subtotal + envío − discount_total`. El ahorro por promociones se muestra («Ahorras 1 200 CUP») a partir de las líneas | `subtotal` a precio de lista y todo el ahorro en `discount_total` (cambia el significado de `subtotal` de la Fase 3) |
| D9 | **Envío «a convenir» y cupón de envío** | El cupón `shipping` se guarda en la orden; su importe se calcula cuando `order_set_shipping` fija el costo (nunca supera el envío) | No permitir cupones de envío con «a convenir» |
| D10 | **Descuento manual en «Nuevo pedido» (admin)** | El staff puede aplicar un cupón **y** un descuento manual (importe o %) con motivo, registrado como `order_discounts.kind = manual` y en `order_events` | Solo cupones también en el admin |
| D11 | **Módulo apagado** | `private.store_has_module(store_id, 'discounts')` dentro de `price_lines` y del refresco materializado: sin módulo, ni promociones ni cupones aplican; el admin muestra «Disponible en el plan…»; los datos se conservan | Solo ocultar la UI |

**Avisos por WhatsApp**

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D12 | **Transporte** | Patrón **outbox**: los eventos de pedido (`order_created`, `order_status_changed`, `shipping_set`, `recovery_code`) insertan filas `notification_log` (`pending`, con el mensaje ya renderizado) **en la misma transacción** (trigger diferido al commit sobre `order_events`, como klauShop). Un despachador `private.dispatch_notifications()` cada minuto con **`pg_cron` + `pg_net`** toma un lote (`for update skip locked`), respeta el límite por minuto, envía a OpenWA y luego concilia la respuesta (`net._http_response`) → `sent`/`failed`; hasta 3 reintentos con espera creciente. La orden nunca espera ni falla por WhatsApp | `pg_net` directo en el trigger como klauShop (sin cola, sin límite de ritmo, el estado del envío no se sabe); o un cron de Vercel (plan Hobby solo permite crons diarios) |
| D13 | **Modo sin OpenWA** | Config de plataforma `whatsapp_mode`: `off` (no se generan avisos), `dry_run` (se generan y quedan como `simulated`, visibles en el log con su texto y «Abrir en WhatsApp»), `live`. Se arranca en `dry_run` | Esperar a tener la instancia para construir los avisos |
| D14 | **Credenciales y config de plataforma** | Tabla nueva `private.platform_config` (key, value jsonb) para modo, URL, id de sesión, límite por minuto y URL pública; la **API key de OpenWA en Supabase Vault** (`vault.secrets`), leída solo por el despachador `security definer`. Se editan desde el superadmin por `/api/v1/platform/whatsapp` (la key se escribe, nunca se devuelve) | Variables de entorno de Vercel (la BD no las ve si el envío sale de `pg_net`) |
| D15 | **Destinatarios** | `store_notification_contacts` (nombre, teléfono E.164, `notify_new_order`, `notify_status_changes`, `notify_payment_recorded`, `show_to_customer`, activo). Al activar el módulo se propone el `whatsapp_phone` de la tienda como primer contacto. Cliente: el teléfono de la orden | Avisar al dueño siempre al `whatsapp_phone` (sin poder añadir vendedores) |
| D16 | **Eventos y plantillas** | Eventos: a la tienda `order_created` (y opcional `payment_recorded`); al cliente `order_created`, `pending_payment` (con instrucciones del método de pago), `paid`, `processing`, `shipped`, `delivered`, `cancelled`, `shipping_set`. **Plantillas por defecto de la plataforma** (sembradas, en español, tono educado, sin enlaces para el cliente salvo `/order/{token}`, ver D18) y **override por tienda** (`whatsapp_templates`: store_id, event, audience, body, is_active). Variables en lista cerrada: `{{tienda}}`, `{{numero}}`, `{{cliente}}`, `{{total}}`, `{{subtotal}}`, `{{descuento}}`, `{{envio}}`, `{{lineas}}`, `{{metodo_pago}}`, `{{instrucciones_pago}}`, `{{zona}}`, `{{direccion}}`, `{{contactos}}`, `{{enlace_pedido}}`, `{{enlace_admin}}`, `{{motivo}}`. Variable desconocida → error al guardar | Plantillas fijas sin edición por tienda |
| D17 | **Render en un solo sitio** | Render en SQL (`private.render_whatsapp_template`), porque el mensaje se congela al encolarse; la vista previa del admin llama a la misma función por API. `@kshop/core` solo tiene la lista de variables y eventos (Zod) para el editor. Cabecera y pie fijos de plataforma (no editables): `*{{tienda}}* — ` al inicio y «Aviso automático, no respondas a este número. Para cualquier consulta escribe a: {{contactos}}» al final | Render en TS (habría que hacer el envío desde Next y no desde la BD) |
| D18 | **Enlace al pedido para el cliente** | **Aprobado con cambio (Roberto)**: se incluye enlace. Si la orden es de una cuenta (`customer_id`), el enlace lleva a su pedido dentro de su perfil (`/account/orders/{id}`, pide iniciar sesión); si es de invitado o la creó el admin sin cuenta, a la página pública por token `/order/{public_token}` (sin sesión) | Sin enlaces (regla de klauShop) |
| D19 | **Opt-out del cliente** | Casilla en el checkout «Recibir avisos del pedido por WhatsApp» marcada por defecto (`orders.notify_customer`); los contactos de la tienda se desactivan desde el admin | Sin opción (siempre se avisa) |
| D20 | **Módulo y recuperación** | Los avisos de pedidos exigen `whatsapp_notifications` (Pro/suelto; en la BD dentro del trigger). El **código de recuperación** se envía para **todas** las tiendas (es seguridad de la cuenta, no un aviso comercial) cuando el modo es `live` | Recuperación también solo con el módulo (las tiendas Base seguirían con el código manual) |
| D21 | **Teléfono → chatId** | Reutilizar la normalización E.164 de la Fase 3 (los teléfonos ya se guardan así) → `{dígitos}@c.us`; los contactos se validan con el mismo Zod | Portar `wa_phone_to_chat_id` de klauShop (los teléfonos ya vienen normalizados) |
| D22 | **Ritmo y anti-baneo** | Límite por minuto de plataforma (p. ej. 20) y por tienda (p. ej. 10) en el despachador; deduplicación `unique (order_id, event, recipient)`; nunca se envía a un número dos veces el mismo evento | Sin límite |

### Arquitectura Propuesta

```
supabase/
├── migrations/
│   ├── 20261029xxxxxx_discounts_schema.sql        promotions, promotion_targets, vouchers, voucher_targets, voucher_usages,
│   │                                               variant_promotions (materializada), order_discounts, columnas nuevas en
│   │                                               order_lines/orders/carts (voucher_code); RLS
│   ├── 20261029xxxxxx_pricing_engine.sql          price_lines, refresh_promotions(store), checkout_create_order y
│   │                                               order_set_shipping/order_cancel con cupones; product_matches_rules y
│   │                                               storefront_product_ids con precio efectivo; pg_cron de fronteras
│   ├── 20261029xxxxxx_notifications_schema.sql    pg_net, pg_cron, private.platform_config, store_notification_contacts,
│   │                                               whatsapp_templates (+ por defecto de plataforma), notification_log; RLS
│   └── 20261029xxxxxx_notifications_engine.sql    render_whatsapp_template, encolar (trigger diferido en order_events),
│                                                   dispatch_notifications + conciliación (pg_cron), reintento, prueba
└── tests/05_discounts_isolation.test.sql · 06_notifications_isolation.test.sql

packages/core/src/discounts/      Zod de promociones y cupones, normalizar código, etiquetas en español
packages/core/src/notifications/  eventos, audiencias y variables permitidas (Zod del editor)
packages/data/src/{discount,notification}-queries.ts   lecturas GraphQL del admin

apps/web/src/
├── features/discounts/                 module.ts + admin Promociones / Cupones (lista, editor, usos)
├── features/whatsapp-notifications/    module.ts + admin Contactos / Plantillas (vista previa) / Historial
├── features/cart · features/checkout   campo de cupón, desglose de descuentos, casilla de avisos
├── features/storefront/                precio tachado y etiqueta «-N %» con el precio efectivo
├── features/orders/                    descuentos en el detalle y en «Nuevo pedido» (+ manual), avisos del pedido
├── app/(platform)/…/whatsapp           superadmin: config OpenWA, modo, prueba, estado de la cola
└── app/api/v1/stores/[storeId]/{promotions,vouchers,cart/voucher,notification-contacts,whatsapp-templates,
    notifications}/… · app/api/v1/platform/whatsapp/…
```

### Modelo de Datos

```sql
create type public.discount_reward   as enum ('percent','fixed');
create type public.discount_target   as enum ('product','variant','category','collection','brand');
create type public.voucher_scope     as enum ('order','specific','shipping');
create type public.order_discount_kind as enum ('promotion','voucher','manual');
create type public.notification_status as enum ('pending','sending','sent','simulated','failed','skipped');

-- Todas: store_id not null FK stores on delete cascade, unique (store_id, id), FK compuestas, índices con
-- store_id primero, created_at/updated_at, RLS habilitada.

promotions        (id, store_id, name, description, reward, value numeric(12,2) /* % o importe en moneda base */,
                   starts_at, ends_at null, is_active, priority int)
promotion_targets (promotion_id, store_id, target_type, target_id)        pk (promotion_id, target_type, target_id)
variant_promotions(variant_id pk, store_id, promotion_id, promo_price numeric(12,2) /* base */, ends_at)  -- materializada
vouchers          (id, store_id, code citext, name, scope, reward, value, min_subtotal null, min_quantity null,
                   usage_limit null, usage_per_customer null, used_count int, starts_at, ends_at null, is_active)
                   unique (store_id, code)
voucher_targets   (voucher_id, store_id, target_type, target_id)
voucher_usages    (id, store_id, voucher_id, order_id, customer_id null, phone, amount, currency, released_at null)
order_discounts   (id, store_id, order_id, kind, source_id null, code null, name, reward, value, amount, currency, reason null)
-- columnas nuevas
order_lines  + unit_list_price, discount_amount, promotion_id null, promotion_name null
orders       + voucher_code null, notify_customer bool default true
carts        + voucher_code null
products     + on_sale bool (desnormalizado, precio efectivo); min_price/max_price pasan a precio efectivo

private.platform_config (key pk, value jsonb, updated_at)      -- modo, URL, sesión, límites, URL pública
-- API key de OpenWA en vault.secrets (name 'openwa_api_key')
store_notification_contacts (id, store_id, name, phone, notify_new_order, notify_status_changes,
                   notify_payment_recorded, show_to_customer, is_active, sort_order)
whatsapp_templates (id, store_id null /* null = plataforma */, event, audience ('store','customer'), body, is_active)
                   unique (store_id, event, audience) nulls not distinct
notification_log  (id, store_id, order_id null, channel 'whatsapp', audience, event, recipient, message,
                   status, attempts, next_attempt_at, request_id bigint null /* pg_net */, error, sent_at, created_at)
                   unique (order_id, event, recipient) where order_id is not null
```

RLS (patrón de las fases 0b–3: `revoke all`, conceder lo justo; escrituras por API con `service_role` o funciones):

| Tabla | anon | cliente (mismo `store_id`) | staff de la tienda / superadmin |
|-------|------|----------------------------|----------------------------------|
| `promotions`, `promotion_targets` | — (la tienda lee el precio efectivo de `variant_promotions`/`products`) | — | leer; escribir admin+ por API |
| `variant_promotions` | promociones vigentes de productos públicos | ídem | leer |
| `vouchers`, `voucher_targets`, `voucher_usages` | **—** (nunca se listan códigos) | — | leer; escribir admin+ por API |
| `order_discounts` | — | solo los de sus órdenes | leer |
| `store_notification_contacts`, `whatsapp_templates` (de tienda) | — | — | leer; escribir admin+ por API |
| `whatsapp_templates` (plataforma, `store_id` null) | — | — | leer (staff, para restaurar) |
| `notification_log` | — | — | leer (staff de la tienda); superadmin todo |
| `private.platform_config`, Vault | — | — | — (solo `service_role` / despachador) |

---

## Blueprint (Assembly Line)

> IMPORTANTE: Solo se definen FASES. Las subtareas se generan al entrar a cada fase
> siguiendo el bucle agéntico (mapear contexto → generar subtareas → ejecutar).

### Fase 1: Esquema de descuentos y tests de aislamiento
**Objetivo**: tablas de promociones, cupones, objetivos, usos, `variant_promotions`, `order_discounts` y
columnas nuevas en órdenes, líneas y carritos; RLS y grants; suite `05_discounts_isolation.test.sql`.
**Validación**: `pnpm db:migrate` sin errores; advisors limpios; `pnpm test:rls` en verde (01–05); romper una
política a propósito hace fallar un test; `pnpm db:graphql-schema && pnpm codegen` OK.

### Fase 2: Motor de precios con descuentos
**Objetivo**: `price_lines` (D1–D3, D5, D8, D11), refresco materializado de promociones + `pg_cron` de
fronteras (D4), precio efectivo en `min_price`/`on_sale`/filtros/colecciones automáticas, y
`checkout_create_order`, `order_set_shipping` y `order_cancel` con cupones, usos y snapshot (D6, D7, D9).
**Validación**: tests SQL: mejor promoción por línea, redondeo por moneda igual que la Fase 3, cupón por
pedido/específico/envío, mínimos y fechas, `usage_limit` y por cliente/teléfono, cancelar libera el uso,
módulo apagado no aplica nada, `total` cuadra; carrera por el último uso de un cupón en `pnpm e2e:discounts`.

### Fase 3: Descuentos en el admin y en la tienda
**Objetivo**: API y pantallas de Promociones y Cupones (con usos); el carrito pasa a `price_lines`; cupón y
desglose en carrito y checkout; precio tachado y «-N %» en portada, listados y ficha; descuentos en el detalle
del pedido, en el texto de WhatsApp a la tienda y en «Nuevo pedido» (cupón + manual, D10); `demo:seed` con una
promoción y un cupón; script `pnpm e2e:discounts`.
**Validación**: pasos 1–3 del happy path en el navegador (390 px y escritorio) en la Tienda Demo; E2E de API
(401/403/404/409/422, `module_not_enabled`); la tienda sigue sirviéndose desde la caché.

### Fase 4: Esquema y motor de avisos
**Objetivo**: `pg_net` + `pg_cron`, `private.platform_config` + Vault, contactos, plantillas (sembradas las de
la plataforma), `notification_log`; render (D17), encolado desde `order_events` con módulo y opt-out (D16,
D19, D20), despachador con límites, reintentos y conciliación (D12, D22), modos `off`/`dry_run`/`live` (D13);
suite `06_notifications_isolation.test.sql`.
**Validación**: tests SQL en `dry_run`: un pedido genera los avisos esperados y nunca duplicados; cada cambio
de estado su plantilla; módulo apagado u opt-out → nada; un error de render o de envío no aborta la orden;
el despachador contra un endpoint de eco (p. ej. `httpbin`/mock) marca `sent` y `failed` correctamente.

### Fase 5: Avisos en el admin, el superadmin y la recuperación
**Objetivo**: API y pantallas de Contactos, Plantillas (editor con variables, vista previa, restaurar) e
Historial (reintentar, `wa.me`); avisos en la ficha del pedido; superadmin «WhatsApp de la plataforma»
(config, modo, mensaje de prueba, estado de la cola); código de recuperación por WhatsApp en `live` con la
alternativa de la Fase 3; `demo:seed` con contactos; script `pnpm e2e:notifications`.
**Validación**: pasos 4–8 del happy path en el navegador (en `dry_run`); E2E de API (permisos, staff vs
admin, la API key nunca vuelve en una respuesta); si hay instancia OpenWA, un mensaje real de prueba llega.

### Fase 6: Validación final
**Objetivo**: sistema funcionando end-to-end.
**Validación**:
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pasan
- [ ] `pnpm test:rls`, `pnpm e2e:catalog`, `pnpm e2e:orders`, `pnpm e2e:discounts`, `pnpm e2e:notifications` en verde
- [ ] QA en navegador de compra con promoción + cupón y de los avisos (dry_run); capturas en `.titan/qa/fase-4/`
- [ ] Criterios de éxito cumplidos; memoria, `arranque-y-fases.md` y este PRP actualizados

---

## Preguntas para Roberto (respondidas 2026-10-25)

Respuestas: 1 sí · 2 misma instancia OpenWA de klauShop, otra sesión y otro número · 3 al crear · 4 sí, manual libre · 5 con enlace (cuenta → perfil; invitado/admin → página pública) · 6 sí.

1. **D20**: ¿los avisos de pedidos solo con el módulo `whatsapp_notifications` (Pro/suelto, como dice la
   decisión 16) y el código de recuperación para todas las tiendas? ¿O alguna tienda Base debería tener al
   menos el aviso de «orden nueva» al dueño?
2. **OpenWA**: ¿hay fecha o lugar previsto para la instancia (¿la misma de klauShop con otra sesión?, ¿un
   número nuevo?). Mientras no exista se trabaja en `dry_run` y el criterio de envío real queda pendiente.
3. **D6**: ¿un cupón cuenta su uso al crear la orden (propuesta, se libera al cancelar) o solo al pagarla?
4. **D10**: ¿«Nuevo pedido» del admin con descuento manual libre (importe o %), o solo cupones?
5. **D18**: ¿los avisos al cliente llevan el enlace `/order/{token}` (propuesta) o sin enlaces como klauShop?
6. **D19**: ¿casilla «Recibir avisos por WhatsApp» en el checkout (marcada por defecto) o siempre se avisa?

---

## 🧠 Aprendizajes (Self-Annealing / Neural Network)

> Esta sección CRECE con cada error encontrado durante la implementación.
> El conocimiento persiste para futuros PRPs. El mismo error NUNCA ocurre dos veces.

### 2026-10-25: Columna nueva en `products` = permission denied para anon
- **Error**: `products` tiene grants **por columna** (oculta `search_vector`); al añadir `on_sale` los tests 02/03
  fallaron con `42501 permission denied for table products`.
- **Fix**: `grant select (on_sale) on public.products to anon, authenticated` en su propia migración.
- **Aplicar en**: cualquier columna nueva de una tabla con grants por columna (`products`, `stores`, `carts`, `warehouses`).

### 2026-10-25: `record "x" is not assigned yet` en plpgsql
- **Error**: `checkout_create_order` y `price_lines` leían `v_voucher.code` cuando no había cupón (el `select into`
  nunca corrió).
- **Fix**: copiar a variables escalares dentro del `if` (`v_voucher_code`, `v_voucher_json`, `v_discount`).
- **Aplicar en**: todo `record` opcional en funciones SQL.

### 2026-10-25: Importes con 16 decimales y booleanos `t` en `format()`
- **Error**: `convert_from_base` devuelve `numeric` sin escala (1400.0000000000000000) y `format('%s', bool)` da `t`.
- **Fix**: `round(…, 2)` en `variant_sale_price`; los tests comparan con `t`/`f`.

### 2026-10-25: Falso error de hidratación en el QA con Playwright
- **Error**: «attributes didn't match … caret-color: transparent» en la ficha: lo inyecta `page.screenshot` (oculta
  el cursor) si la captura llega antes de que React hidrate.
- **Fix**: `page.screenshot({ …, caret: "initial" })` en `qa-orders` y `qa-discounts`.
- **Aplicar en**: todo script de QA con capturas y control de errores de consola.

---

## Gotchas

- [ ] `pg_net` y `pg_cron` **no están instalados** en el proyecto: la migración los crea (`pg_net` vive en el schema `net`, `pg_cron` en `cron`); los jobs de `cron` se registran con nombre para que la migración sea re-ejecutable (`cron.unschedule` antes de `cron.schedule`).
- [ ] `pg_net` es asíncrono y guarda las respuestas en `net._http_response` **solo unas horas**: conciliar en el siguiente ciclo del despachador, no depender de ellas después.
- [ ] Los avisos se encolan con un **trigger diferido** (al commit): si se encolan antes de insertar las líneas, el mensaje sale sin productos (klauShop lo resolvió así).
- [ ] Nada del envío puede lanzar dentro de la transacción de la orden: render y encolado envueltos en `exception when others` → fila `failed`/`skipped` con el error.
- [ ] Hoy el precio se calcula en dos sitios (`server/orders/cart.ts` en TS y `private.variant_price_in` en SQL): al pasar el carrito a `price_lines`, comprobar que el redondeo por moneda da exactamente lo mismo (test de la Fase 3 en `@kshop/core` vs SQL).
- [ ] `products.min_price` y el filtro «En oferta» (`compare_at_price > price`) se usan en `storefront_product_ids`, `storefront_product_facets` y `product_matches_rules`: los tres deben pasar al precio efectivo a la vez, o filtros y listados no cuadrarán.
- [ ] Con Cache Components, las fronteras de las promociones las cubre `cacheLife("minutes")` del catálogo; guardar o pausar una promoción sí debe invalidar `store:{id}:catalog` al momento.
- [ ] Fechas de promociones y cupones: se introducen y muestran en `America/Havana`; se guardan en `timestamptz`.
- [ ] Importes fijos de promociones, cupones y mínimos están en moneda base: convertir con la **tasa de la orden** y el redondeo de la moneda; un % nunca se redondea antes de aplicarse a la línea.
- [ ] El código del cupón es secreto de la tienda: ni pg_graphql ni la API pública deben permitir listarlos; validar por API con límite de intentos (reutilizar `auth_rate_limit`) para impedir adivinarlos.
- [ ] `order_set_shipping` y `order_cancel` recalculan `total` con `discount_total`: con cupón de envío el descuento cambia al fijar el costo.
- [ ] La API key de OpenWA no puede volver nunca al navegador ni quedar en `notification_log` (guardar solo URL sin cabeceras); ni en memoria ni en `.env.example`.
- [ ] Un solo número de WhatsApp para todas las tiendas: riesgo de baneo si se envía en ráfaga o a números inválidos → límite por minuto, dedupe y no reintentar errores de «número no existe».
- [ ] Mensajes: siempre empezar con el nombre de la tienda y terminar con el pie de «aviso automático» (decisión 15); escapar `*`/`_` de nombres de producto para que no rompan el formato de WhatsApp.

## Anti-Patrones

- NO calcular descuentos ni totales en el cliente ni en dos lenguajes: una sola función SQL (D1).
- NO recalcular descuentos de una orden ya creada cuando cambia la promoción o el cupón (snapshot).
- NO enviar WhatsApp desde la transacción de la orden ni hacer que la orden espere la respuesta de OpenWA.
- NO procesar respuestas de WhatsApp ni abrir un webhook de entrada (decisión 15: solo salida).
- NO guardar credenciales de OpenWA en el repo, en `.titan/memory/` ni en tablas expuestas por pg_graphql.
- NO borrar promociones, cupones, plantillas ni contactos al desactivar un módulo.
- NO crear nuevos patrones si los de las fases 0b–3 funcionan (API `/api/v1` + Zod, `requireStoreRole`, `requireModule`, tags de caché, funciones `service_role`).
- NO ignorar errores de TypeScript ni introducir `any`.

---

*PRP aprobado el 2026-10-25.*
