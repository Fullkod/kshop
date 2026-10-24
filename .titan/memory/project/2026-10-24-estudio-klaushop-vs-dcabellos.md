> Sembrado el 2026-10-24 desde `_materiales/kshop/02-estudio-klaushop-vs-dcabellos.md`. Las referencias "ver 0X" apuntan a las
> entradas hermanas de `project/` (ver índice en `MEMORY.md`). Desde ahora la memoria viva es esta.

# Estudio: klauShop vs dcabellos (2026-10-24)

Hecho leyendo código y esquema de ambos repos (no se ejecutó ninguno).

| | klauShop | dcabellos |
|---|---|---|
| Stack | Next 14 + React 18 + Supabase (pg_graphql/urql + Drizzle), Vercel | Django 4.2 + Python 3.8, templates server-side, Celery |
| Estado | Producción, rediseño 2.0 (oct 2026) | Último commit feb 2024 (rama `develop`) |
| Tamaño | ~47k líneas TS, 14 tablas | ~11k líneas Python, ~40 modelos |
| Multi-tienda | No: `siteConfig` fijo, admin global (`app_metadata.isAdmin`) | No: enum fijo `mipyme` con 2 negocios, `SITE_ID = 1` |

## Lo bueno de dcabellos (modelo heredado de Saleor) — se adopta
- `ProductType` → define qué atributos tiene el producto y cuáles generan variantes.
- `Attribute` / `AttributeValue` con `input_type`, visible/filtrable en tienda y dashboard, orden.
- `ProductVariant` con SKU único, precio override, `quantity` + `quantity_allocated`, peso, imágenes propias.
- Precios por moneda (CUP, USD, MLC y "efectivo") en producto y variante + flags de disponibilidad por moneda.
  (Nota 2026-10-24: el MLC ya no existe; se adopta la idea, no esas monedas.)
- `OrderEvent` (historial), `CanceledOrder` (motivo), `EvidencePayment` (foto del comprobante).
- `metadata` / `private_meta` JSON en casi todo; SEO y traducciones por modelo; `SortableModel`.

## Lo que NO se adopta de dcabellos
- Precios como columnas por moneda (`price_usd_amount`, `price_mlc_amount`…): se pasa a tabla de precios por moneda.
- `Category`/`Collection` no existen (los sitemaps los importan pero no hay modelo): se diseñan nuevos.
- B2B específico (`Client` con REEUP/NIT/banco/contratos, `Commercial`), y `password_clear`
  (contraseñas en texto plano — nunca).
- Tablas de países/regiones/ciudades de geonames: sobra para el MVP (zonas de envío por tienda bastan).

## Lo bueno de klauShop — se reutiliza (código y flujos)
- Checkout por WhatsApp, reserva blanda de inventario al crear la orden, stock real al marcar pagada.
- Ciclo de estados `pending_confirmation → pending_payment → paid → processing → shipped → delivered` (+ `cancelled`),
  transiciones centralizadas, endpoints `mark-paid` / `cancel` / `mark-refunded`.
- Avisos automáticos por WhatsApp (OpenWA, trigger → pg_net) — pasar a config por tienda.
- UI rediseño 2.0: Shell/AdminShell, AdminTable, StatusPill, AuthCard, carrito lateral, `formatCUP` (→ `formatMoney`).
- Subida de imágenes con recorte/compresión en cliente (límite 4.5 MB de Vercel).
- Zonas de envío, direcciones, wishlist, PWA.

## Lo que klauShop no tiene y hace falta
- Stock por variante (hoy: un stock por producto; color/talla/material son arrays JSON).
- Atributos configurables, categorías en árbol, multimoneda, historial de orden, pagos registrados.
- Todo lo multi-tenant (ver `04-tenancy-dominios-auth.md`).
