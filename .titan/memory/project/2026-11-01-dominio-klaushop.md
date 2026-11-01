# Klau's Shop vive en `klaushop.fullkod.com` (corte de dominio, 2026-11-01)

Desde el 2026-11-01 el dominio público de Klau's Shop apunta a Kshop (tienda `klau`), no a la app vieja de klauShop.

## Qué se hizo
- Vercel (Roberto): `klaushop.fullkod.com` salió del proyecto `klau-shop` y entró en el proyecto `kshop` (mismo CNAME de
  Porkbun, «Valid Configuration»). Se quitó `KSHOP_CUSTOM_DOMAIN_REDIRECT=off` y se redesplegó.
- Base (Claude, con `SUPABASE_SECRET_KEY`): fila en `store_domains` para la tienda `klau`: `klaushop.fullkod.com`, `type =
  custom`, `status = verified`, `verified_at` puesto. Se insertó a mano porque `assertAllowed` (`server/custom-domains.ts`)
  rechaza a propósito cualquier `*.fullkod.com` desde el admin; para un dominio de Fullkod es el camino correcto.
- Comprobado en producción: `klaushop.fullkod.com` sirve la tienda (título «Klau's Shop», canónica y sitemap con el
  dominio); `klau.kshop.fullkod.com` → 308 al dominio; `klaushop.fullkod.com/admin` → 307 al subdominio; el admin sigue
  en `klau.kshop.fullkod.com/admin`. Tardó ~1 min por la caché de fallos del proxy.
- La app vieja sigue en reserva en `klaushop.vercel.app` (sin dominio propio).

## Qué quedó fuera (pendiente de Roberto)
- `--delta` de klauShop (pedidos y clientes desde el snapshot del 2026-10-28) y `klaushop:verify` final: **no se corrió**
  en el corte. Si Klau recibió pedidos en la app vieja después del 28, hay que importarlos.
- Reparto de stock por variante (Excel `stock_to_split`), si no está hecho.
- `www.klaushop.fullkod.com` no tiene DNS (no hace falta).
- Los enlaces `/order/{id}` de los WhatsApps antiguos de klauShop caducan (decisión de la fase 8).

**Why:** cierra la fase 8.7; el proxy y `private.store_public_url` ya usan el dominio en avisos y enlaces de pedido.
**How to apply:** para quitar el dominio, borrar la fila `custom` de `store_domains` (o apagar el módulo `custom_domain`)
y la tienda vuelve al subdominio sola; no tocar Vercel sin permiso de Roberto.

## Páginas y pie traídos de klauShop (2026-11-01, mismo día)
- Páginas publicadas en la tienda `klau` (Markdown restringido, editables en Admin › Apariencia › Páginas):
  `/page/sobre-nosotros` («Sobre nosotros») y `/page/encargos` («Encargos»: Shein, Temu y Amazon, pasos, FAQ, botones
  a WhatsApp con `wa.me`). Texto de `klauShop/src/app/(store)/{about-us,special-orders}/page.tsx`; sin iconos ni tarjetas.
- Menú del pie (Admin › Apariencia › Menús): columnas «Categorías» (las 7 raíz, tipo `category`), «Servicios» (Encargos,
  Mis pedidos `/account/orders`, Favoritos `/favorites`) e «Información» (Sobre nosotros, Descargar la app `/app`).
  Sin menú de cabecera a propósito: Kshop ya pone «Productos» y las categorías.
- Descripción del pie: «Tu tienda online de ropa y accesorios. Envíos a domicilio en Santa Clara, Placetas, Encrucijada
  y Calabazar de Sagua.»
- Escrito directo en la BD con `SUPABASE_SECRET_KEY` (igual que la API, sin `invalidateContent`): la caché del escaparate
  («minutes») lo mostró en pocos minutos. No se migran reseñas ni comentarios (decisión de la fase 8).
