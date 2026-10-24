> Sembrado el 2026-10-24 desde `_materiales/kshop/03-modelo-de-datos.md`. Las referencias "ver 0X" apuntan a las
> entradas hermanas de `project/` (ver índice en `MEMORY.md`). Desde ahora la memoria viva es esta.

# Modelo de datos (borrador v0 — 2026-10-24)

Convenciones: Postgres (Supabase). Todas las tablas de tienda llevan `store_id` (FK a `stores`,
indexado, primero en índices compuestos). Slugs/SKU/números de orden únicos **por tienda**
(`unique (store_id, slug)`). Dinero en `numeric(12,2)` + código de moneda ISO-like
(`CUP`, `USD`, `EUR`…; el MLC ya no existe). `metadata jsonb` (público) y `private_metadata jsonb` donde aporte.

## 1. Plataforma (solo superadmin)
| Tabla | Campos clave |
|-------|--------------|
| `stores` | id, slug (subdominio), name, status (`active`/`suspended`/`archived`), base_currency, order_prefix, whatsapp_phone, logo, theme jsonb, settings jsonb, created_by |
| `store_domains` | store_id, domain, type (`subdomain`/`custom`), is_primary, verified_at, vercel_status |
| `store_members` | store_id, user_id, role (`owner`/`admin`/`staff`) — staff de la tienda |
| `store_private_config` | store_id, key, value — secretos por tienda (OpenWA, etc.); sin acceso desde cliente |
| `plans`, `subscriptions`, `subscription_grants`, `platform_invoices` | ver `06-suscripciones.md` |

Superadmin: `auth.users.app_metadata.role = 'superadmin'` (no es miembro de cada tienda; RLS le da acceso global).

## 2. Clientes (una cuenta por tienda)
| Tabla | Campos clave |
|-------|--------------|
| `customers` | id, store_id, user_id (auth, email sintético — ver 04), email real, phone, first_name, last_name, accepts_marketing, note, metadata — `unique (store_id, user_id)` |
| `customer_addresses` | store_id, customer_id, nombre, teléfono, zona (FK shipping_zones), dirección, referencias, is_default |

## 3. Catálogo (modelo Saleor/dcabellos)
| Tabla | Campos clave |
|-------|--------------|
| `categories` | store_id, parent_id, name, slug, description, image, sort_order, seo_*, `path ltree` (o materialized path) para consultar subárboles |
| `collections` | store_id, name, slug, description, image, is_published, sort_order, seo_* |
| `collection_products` | collection_id, product_id, sort_order |
| `product_types` | store_id, name, slug, has_variants, is_shipping_required, weight |
| `attributes` | store_id, name, slug, input_type (`dropdown`/`multiselect`/`swatch`/`boolean`/`numeric`/`text`/`date`), unit, value_required, visible_in_storefront, filterable_in_storefront, filterable_in_dashboard, storefront_search_position |
| `attribute_values` | attribute_id, name, slug, value (p. ej. hex del swatch), file_url, sort_order |
| `product_type_attributes` | product_type_id, attribute_id, scope (`product`/`variant`), variant_selection bool, sort_order |
| `products` | store_id, product_type_id, category_id, name, slug, description jsonb (editor rico) + description_plain, status (`draft`/`published`/`archived`), published_at, featured, badge, rating, seo_*, search_vector tsvector, metadata |
| `product_attribute_values` | product_id, attribute_id, value_id (o valor libre) |
| `product_variants` | store_id, product_id, sku, name, sort_order, track_inventory, weight, is_default, metadata — `unique (store_id, sku)` |
| `variant_attribute_values` | variant_id, attribute_id, value_id (talla M, color rojo…) |
| `product_variants` (precios) | + `price` (precio de venta en moneda base), `compare_at_price` (precio tachado), **`cost_price` + `cost_currency`** (precio de costo; puede estar en otra moneda, p. ej. compra en USD y vende en CUP) |
| `variant_prices` | variant_id, currency, price, compare_at_price — **solo overrides** del precio de venta en otras monedas; si no hay fila, se calcula base × tasa + redondeo. `unique (variant_id, currency)` |
| `product_media` | store_id, product_id, url/key, alt, type (`image`/`video`), sort_order |
| `variant_media` | variant_id, media_id |
| `warehouses` | store_id, name, address, phone, is_default, is_pickup_point, is_active — se crea uno por defecto por tienda |
| `warehouse_shipping_zones` | warehouse_id, shipping_zone_id — qué almacén sirve qué zona (como Saleor) |
| `stocks` | variant_id, warehouse_id, quantity, quantity_allocated, low_stock_threshold |
| `stock_movements` | store_id, variant_id, warehouse_id, type (`adjustment`/`sale`/`cancel`/`refund`/`transfer_in`/`transfer_out`/`purchase`), quantity, order_id, note, user_id, created_at — historial/auditoría del stock |
| `product_translations` *(fase 2)* | product_id, language_code, name, description, seo_* |

Notas:
- **Precio de costo y precio de venta** en cada variante (decisión 2026-10-24). En la UI, un producto sin
  variantes muestra ambos campos directamente en la ficha; con variantes, se pueden poner a todas a la vez
  y ajustar por variante. El costo es privado: no se expone en la lectura pública (columna fuera de la
  vista pública / RLS por columnas), solo staff.
- Producto sin variantes = producto con **una variante por defecto** (como Saleor). Simplifica carrito/orden: siempre se compra una variante.
- Filtros facetados (talla, color, precio) → función SQL sobre `variant_attribute_values` + índices, expuesta vía pg_graphql o RPC.
- Precio "desde" en listados: columna desnormalizada `products.min_price` por moneda (o vista materializada) para listados rápidos.

## 4. Monedas (decisión del dueño)
| Tabla | Campos clave |
|-------|--------------|
| `store_currencies` | store_id, currency, enabled, is_base, rate_to_base, rounding (p. ej. a 5 o 10 CUP), display_format, updated_by, updated_at |
| `currency_rate_history` | store_id, currency, rate, set_by, set_at |

- La tienda tiene una **moneda base**; el admin activa otras y fija la tasa a mano.
- Precio en una moneda = `variant_prices` explícito si existe (override, como dcabellos) **o** base × tasa + redondeo.
- El cliente elige moneda en la tienda; carrito y orden guardan la moneda y la **tasa usada** (snapshot).
- Métodos de pago por moneda (efectivo CUP, transferencia, Zelle…) → `payment_methods` (store_id, name, currencies[], instructions, enabled).

## 5. Carrito (checkout)
| Tabla | Campos clave |
|-------|--------------|
| `carts` | store_id, token (invitado), customer_id null, currency, shipping_zone_id, note, email/phone, last_change, status (`active`/`converted`/`abandoned`) |
| `cart_lines` | cart_id, variant_id, quantity, metadata |

Invitado por token en cookie; al loguearse se fusiona. Precios se recalculan siempre en servidor (nunca confiar en el cliente).

## 6. Órdenes
| Tabla | Campos clave |
|-------|--------------|
| `orders` | store_id, number (secuencial **por tienda**, mostrado `KS-1042` con `stores.order_prefix`), customer_id null, status (ciclo klauShop), payment_status (`unpaid`/`partially_paid`/`paid`/`refunded`), channel (`whatsapp`/`admin`/`web`), currency, exchange_rate, subtotal, shipping, discount, total, customer snapshot jsonb (nombre, teléfono, zona, dirección), customer_note, created_at |
| `order_lines` | order_id, variant_id null, snapshot: product_name, variant_name, sku, attributes jsonb, quantity, unit_list_price, unit_price, discount, currency, **unit_cost + cost_currency** (para margen en Finanzas) |
| `inventory_reservations` | store_id, order_id, variant_id, warehouse_id, quantity, status (`active`/`consumed`/`released`), expires_at |
| `order_events` | order_id, type (`created`, `status_changed`, `payment_recorded`, `note_added`, `whatsapp_sent`…), payload jsonb, user_id, created_at |
| `payments` | order_id, method_id, amount, currency, reference, evidence_url (foto comprobante, como dcabellos), recorded_by, status |
| `refunds` | order_id, amount, reason, recorded_by |
| `fulfillments` *(fase 2)* | order_id, status, tracking, lines |

Transiciones de estado en un solo módulo (como `orderStatus.tsx`); `paid` consume reservas y descuenta `stocks`;
`cancel` libera reservas. Todo en transacción con `for update`.

## 7. Envíos
Ver §11 (zonas, métodos y precios por tienda).

## 8. Descuentos (MVP) — inspirado en Saleor (promotions + vouchers)
| Tabla | Campos clave |
|-------|--------------|
| `promotions` | store_id, name, type (`automatic`), reward (`percent`/`fixed`), value, starts_at, ends_at, is_active, priority |
| `promotion_targets` | promotion_id, target_type (`product`/`variant`/`category`/`collection`), target_id |
| `vouchers` | store_id, code, scope (`order`/`shipping`/`specific`), reward, value, min_subtotal, min_quantity, usage_limit, usage_per_customer, used_count, starts_at, ends_at |
| `voucher_targets` | voucher_id, target_type, target_id |
| `voucher_usages` | voucher_id, order_id, customer_id |

- Precio de catálogo con promoción automática (el "precio tachado"); voucher = código en el carrito.
- La orden guarda snapshot del descuento aplicado (línea y total) — no se recalcula después.
- Reglas de combinación para el MVP: una promoción por línea (la mejor) + un voucher por orden.

## 9. B2B — DESCARTADO (2026-10-24)
Roberto: no interesa ni en el MVP ni por ahora (fue una confusión). Hay una idea de **"gestores"**
para después del MVP, pendiente de definir. Sin `customer_groups`, `price_lists` ni empresas.

## 10. Temas y contenido de la tienda (MVP) — estilo Saleor
Referencias: apululu (`C:\Local-Disc-D\Project\DSmart_Company\src\apululu\storefront-clean`, storefront
sobre Saleor: `MenuGetBySlug`, `PageGetBySlug` con atributos para el carrusel, `ProductListByCollection`)
y klauShop (`products.featured`, `badge`, `show_in_slider`, colecciones).

| Tabla | Campos clave |
|-------|--------------|
| `store_themes` | store_id, preset, tokens jsonb (colores, fuente, radios), logo, favicon |
| `collections` (§3) | listas curadas: "Novedades", "Ofertas", "Más vendidos", "Día de las madres"… manuales (`collection_products`) o **automáticas** por regla (`rules` jsonb: categoría, etiqueta, en promoción, creados en los últimos N días) |
| `brands` | store_id, name, slug, logo, description, is_published — marca del producto (`products.brand_id`), con página propia y filtro |
| `product_tags` | store_id, product_id, tag — etiquetas libres para reglas y búsqueda; los badges (`Nuevo`, `Más vendido`) se derivan de colecciones o etiquetas |
| `home_sections` | store_id, type (`hero_slider`, `banner`, `product_carousel`, `category_grid`, `brand_strip`, `rich_text`, `image_grid`), source (collection_id / category_id / brand_id / manual), title, settings jsonb, sort_order, is_visible, starts_at, ends_at |
| `banners` | store_id, image (desktop/móvil), title, subtitle, link (producto/categoría/colección/página/URL), sort_order, starts_at, ends_at — usados por las secciones slider/banner |
| `menus` / `menu_items` | menú principal y footer como en Saleor: item → categoría, colección, marca, página o URL; árbol con `parent_id` y orden |
| `pages` | store_id, slug, title, content jsonb (editor rico), is_published, seo_* — páginas estáticas opcionales: Sobre nosotros, Envíos, Pagos, Garantías, Términos (apululu tenía estas) |

- La home se arma desde el admin ordenando secciones; cada sección tira de una colección/categoría/marca.
- Secciones y banners programables por fechas (campañas).
- Se aplica con variables CSS; los tokens también alimentan icono/splash/colores de la app móvil.
- Sin código ni CSS libre por tienda.

## 11. Entregas por tienda (MVP)
Ampliación de §7 a partir de klauShop (`shipping_zones` + "envío a convenir" de la migración 0019):

| Tabla | Campos clave |
|-------|--------------|
| `shipping_zones` | store_id, name (municipio/zona), description, is_active, sort_order |
| `shipping_methods` | store_id, zone_id, name (`Mensajería`, `Recogida en tienda`…), type (`delivery`/`pickup`/`to_agree`), price, currency (o en moneda base y se convierte), free_over_subtotal, min_days, max_days, is_active |
| `pickup_points` | store_id, name, address, hours, phone |

- Cada tienda define sus zonas y precios; el checkout solo muestra los métodos activos de la zona elegida.
- `to_agree` = el precio se confirma después (como klauShop): la orden queda en `pending_confirmation`.
- La orden guarda snapshot de zona, método y precio.

## 12. WhatsApp por tienda (MVP)
| Dónde | Qué |
|-------|-----|
| `stores.whatsapp_phone` | Número al que se cierra la compra (`wa.me/<número>?text=<resumen del pedido>`) |
| `store_notification_contacts` | store_id, name, phone, role (`owner`/`ventas`…), notify_new_order, notify_status_changes, show_to_customer — reemplaza el "admins con teléfono" de klauShop (0015/0019) |
| `whatsapp_templates` | store_id, event (`order_created`, `pending_payment`, `paid`, `shipped`…), body con variables (`{{tienda}}`, `{{numero}}`, `{{total}}`, `{{zona}}`…), is_active — con plantillas por defecto de la plataforma |
| `notification_log` | store_id, order_id, channel, to, event, status, error, sent_at — para depurar y no repetir avisos |

**Decidido (2026-10-24): un solo WhatsApp de la plataforma** (una sesión OpenWA, credenciales en config
de plataforma) envía los avisos de **todas** las tiendas. **Solo salida**: avisos de orden nueva y cambios
de estado; **nunca se reciben ni procesan respuestas**. Por eso cada mensaje:
- empieza con el nombre de la tienda (`*Klau's Shop* — Pedido KS-1042…`);
- dice que es un aviso automático y que para cualquier consulta escriba a los contactos `show_to_customer`
  de la tienda (regla de klauShop: tono educado, remitir a teléfonos, sin links de orden).

Flujo: al crear la orden se abre WhatsApp al número de la tienda con el resumen (`wa.me`, conversación
directa cliente↔tienda) y la plataforma avisa a los contactos con `notify_new_order`. Cambios de estado →
mensaje al cliente con la plantilla del evento. Trigger `orders` → pg_net → OpenWA como en klauShop.

Pendiente para pensar luego: según el plan, que una tienda conecte **su propio WhatsApp** (QR desde su panel)
→ añadir `store_whatsapp_sessions` (store_id, session_id, status, connected_phone) sin cambiar lo demás.

## 13. Importar / exportar productos por Excel (MVP, plan Base)
| Tabla | Campos clave |
|-------|--------------|
| `import_jobs` | store_id, type (`products`/`stock`/`prices`), file_key, status (`uploaded`/`validating`/`ready`/`importing`/`done`/`failed`), total_rows, created, updated, errors, mode (`create_only`/`upsert`), created_by, created_at |
| `import_job_rows` | job_id, row_number, data jsonb, action (`create`/`update`/`skip`), errors jsonb |

Flujo:
1. **Plantilla descargable** generada para la tienda (y por tipo de producto): columnas fijas (SKU, nombre,
   descripción, categoría, marca, colecciones, precio de venta, precio de costo, moneda de costo, precio
   tachado, stock por almacén, URLs de imágenes, publicado) + una columna por cada atributo del tipo
   (Talla, Color…). Una fila por variante; las filas con el mismo "producto" (nombre o código de producto) se agrupan.
2. Subida del .xlsx/.csv → **validación y vista previa**: qué se crea, qué se actualiza (match por SKU),
   errores por fila (categoría inexistente, valor de atributo nuevo, precio inválido…) con opción de crear
   categorías/marcas/valores que falten.
3. Confirmar → importación por lotes (no todo en una petición: límites de Vercel) dentro de transacciones;
   progreso visible y resumen final.
4. Imágenes: por URL en el Excel (se descargan, comprimen y suben a Storage) o subida de un .zip con los
   nombres de archivo referenciados.
5. **Exportar con el mismo formato** (ida y vuelta): bajar el catálogo, editar en Excel, volver a subir.
   Importaciones parciales de solo **stock** o solo **precios** (útil para actualizar existencias).
- Los movimientos de stock de una importación quedan en `stock_movements` (type `adjustment`, nota con el job).
- Respeta el límite de productos del plan (avisa antes de importar si se pasa).

## Fuera del MVP (previsto)
"Gestores" (por definir), gift cards, reseñas (`comments` de klauShop), wishlist (reusar), traducciones,
multi-almacén real, fulfillments parciales.
