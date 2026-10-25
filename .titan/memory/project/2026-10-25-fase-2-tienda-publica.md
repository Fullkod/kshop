# Fase 2 — tienda pública (2026-10-25)

PRP con progreso, decisiones y aprendizajes: `.titan/plans/prp-fase-2-tienda-publica.md`.
Estado: hecha. Lighthouse en Vercel (2026-10-25): A11y/BP/SEO 100; rendimiento portada 97–98, ficha 89–93, listado
81–82 por CLS → tras el fix (altura mínima del listado) 76–90 con CLS 0; queda el LCP de la imagen (3,5–3,8 s).
`sitemap.xml` daba 404 en Vercel (route handler prerenderizado; fix con `connection()`, confirmado 200). Detalle en el PRP.

## Decisiones de Roberto (2026-10-25)
- «Pedir por WhatsApp» en la ficha ya (aún no se puede probar de punta a punta).
- Cache Components activado (`use cache` + tags por tienda, ISR en rutas con slug).
- Código y URLs en inglés: `/products`, `/category/x`, `/collection/x`, `/brand/x`, `/product/x`, `/search`,
  `/page/x`, `?page=2&sort=price-asc&price=500-2000&talla=m,l`. Solo el texto visible va en español.
- Rendimiento: «mientras más, mejor» (mínimos del PRP: 90/95/95/95).

## Dónde está cada cosa
- BD: `supabase/migrations/20261026100000_storefront_content.sql` (banners, home_sections, menus, pages) y
  `20261026100100_storefront_functions.sql` (`storefront_search_products`, `storefront_product_facets`,
  reglas de colecciones automáticas). Tests: `supabase/tests/03_storefront_isolation.test.sql`.
- Core: `packages/core/src/storefront/` (tema, contenido, filtros ⇄ URL). Data: `storefront-queries.ts`
  (públicas, anon) y `content-queries.ts` (admin).
- Web: lecturas en caché `apps/web/src/server/storefront/`; páginas `app/s/[storeSlug]/(front)/`; componentes
  `features/storefront/`; admin `/admin/themes` en `features/themes/`; API `api/v1/stores/[storeId]/content/`.
- Invalidación: escrituras del catálogo → `store:{id}:catalog`; contenido → `store:{id}:content`; tema →
  también `store:{slug}`. Todas con `revalidateTag(tag, { expire: 0 })`.

## Para recordar
- La Tienda Demo quedó sin secciones/banners (se borró el contenido de la prueba E2E): usa la portada por defecto.
- En la máquina de Roberto el puerto 3100 es de otra app; builds de prueba en 3200.
