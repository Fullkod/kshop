# 06 · Plan de migración

Sigue el flujo de Kshop: un PRP en `.titan/plans/prp-rediseno-v2.md` (plantilla `prp-base.md`) → Roberto aprueba → `tf-bucle-agentico`.
Una fase por PR o commit. Sin push ni deploy sin permiso. Commits en inglés. Evidencia de QA en `.titan/qa/rediseno-v2/` (capturas de 1280 y 390).
Al acabar, añadir una entrada de memoria `project/2026-10-xx-rediseno-v2.md` y enlazarla en `MEMORY.md`.

## Fase R0 · Tokens y tema (base de todo)
1. Sustituir `packages/core/src/storefront/theme.ts` por `codigo/packages-core-src-storefront-theme.ts`.
   - Cambio de API: `THEME_RADII[x]` ahora es un objeto `{sm,md,lg,btn}`, no un string. Buscar todos los usos (`grep THEME_RADII`).
   - `Theme` gana `buttonShape`, `elevation`, `headingCase` e `isDark`. Exportar `readableOn` y `THEME_COLOR_FIELDS` desde `@kshop/core`.
2. Sustituir `packages/storefront/src/theme-style.ts` por `codigo/packages-storefront-src-theme-style.ts`.
3. Sustituir `packages/ui/src/styles.css` y `packages/storefront/src/styles.css` por los de `codigo/`.
4. Buscar y reemplazar en `packages/storefront`: `rounded-[var(--sf-radius)]` → `rounded-sf-btn` en botones, inputs y chips, `rounded-sf` en tarjetas y fotos, y `rounded-sf-lg` en banners.
   Revisar caso por caso con la tabla de `01-TOKENS.md` §5.
5. Tests: ampliar `storefront.test.ts`.
   - `resolveTheme` de un tema v1 da los campos nuevos del preset.
   - `isDark` es true para el preset dark y para un fondo propio oscuro.
   - `themeContrastIssues` comprueba 6 parejas.
   - `readableOn("#FF7A93") === "#111111"`.
6. **Aceptación:** las tiendas existentes se ven igual de color (el único cambio visible son los radios por pieza). `pnpm test` y lint en verde.

## Fase R1 · Átomos (`packages/ui/src/components.tsx`)
Button (variantes `secondary`, `whatsapp`, `whatsappOutline`, `inverse` y tamaño `icon`), Badge (`sale`, `secondary`, `warning`), Input con estado de foco y error, Tabs/Segmented y Chip.
Dependencia: `lucide-react` (pedir permiso para añadirla) o SVG a mano en un `icons.tsx`.
**Aceptación:** una página interna de muestras (opcional, `/admin/_ui`, solo en desarrollo) se parece a §02 de `Tienda Biblioteca`.

## Fase R2 · Tienda: cabecera, pie y navegación móvil
`StoreHeader.tsx` (ver 02, con el arreglo del solape), `StoreFooter.tsx`, nuevo `BottomTabBar.tsx` (en `(front)/layout.tsx`, oculto en ≥ 720 y en la ficha),
nuevo `AnnouncementBar.tsx`.
- Favoritos: decidir en el PRP si v1 es `localStorage` (recomendado) o BD.
- La APK de tienda usa el mismo layout. Comprobar `safe-area-inset-bottom` en Capacitor.
**Aceptación:**
- A 1280, 1180, 1000, 720 y 390 nada se monta.
- La barra inferior es fija en la app.
- El buscador y las pantallas de sin conexión y versión nueva siguen funcionando.

## Fase R3 · ProductCard, listados y carrito
- `ProductCard.tsx`: `grid`/`row`/`compact`, favorito, % de descuento, añadir rápido (selector de variante si hace falta), puntos de color y WhatsApp.
- `ProductCardData` en `packages/data` gana `discountPercent`, `swatches` y `variantCount`. Ajustar la consulta de pg_graphql y el codegen.
- Nuevo `CartDrawer.tsx` (panel lateral en web, hoja inferior en móvil), con `CartView` usando los mismos bloques. Barra de envío gratis solo si existe un umbral.
**Aceptación:** e2e `e2e-orders.mjs` y `e2e-discounts.mjs` en verde, con añadir rápido incluido. Lighthouse del listado con CLS 0.

## Fase R4 · Ficha de producto
`ProductView.tsx` según 02: galería (vertical en web y horizontal en móvil), caja de precio con equivalencia de moneda, variantes, stock,
CTA + WhatsApp, beneficios, acordeón, relacionados y barra de compra fija en móvil.

## Fase R5 · Portada
1. `content.ts`: los 7 tipos nuevos (`codigo/packages-core-src-storefront-content.additions.ts`), más `eyebrow` en `sectionBase`, y `eyebrow` y `productId` en el banner.
2. Migración SQL si `home_sections.type` tiene un check o enum. Test de aislamiento entre tiendas igual que el resto (`tf-supabase`).
3. `HomeSections.tsx`: rediseñar los 6 actuales y añadir los 7 nuevos (ver 03). `Countdown.tsx` como componente cliente.
4. `SectionsEditor.tsx`: formularios de los tipos nuevos, y que una tienda nueva arranque con las secciones por defecto.
5. Invalidar la caché de la portada como ahora (Cache Components).
**Aceptación:** la Tienda Demo con las 13 secciones se ve como `TiendaPortada.dc.html` en 1280 y 390 con los 6 presets. Hacer capturas de cada preset.

## Fase R6 · Admin
`AdminShell.tsx`: barra lateral agrupada, topbar y `group` en el registro. Rediseñar Inicio (`page.tsx` + `SalesTodayCard`) y `ThemeEditor.tsx`,
con presets visuales, 12 colores, letra y forma, y vista previa real Web/Móvil. Layout < 720 para `apps/admin-app`: pestañas, «Más» y tarjetas de pedido en `OrderList.tsx`.
**Aceptación:** `qa-apps.mjs`, `qa-orders.mjs` y `qa-pro.mjs` en verde. Los módulos bloqueados se ven con PRO. El empleado ve solo lo suyo, como en la Fase 7.

## Fase R7 · Landing
`(platform)/page.tsx` según 05. Los precios se leen de los planes.

## Orden y dependencias
R0 → R1 → (R2, R3 en paralelo) → R4 → R5 → R6 → R7. R6 puede ir justo después de R1 si interesa antes.

## Riesgos
- `THEME_RADII` cambia de forma: es el único cambio de API que rompe algo. Está cubierto en R0.4.
- Dos fuentes más por tema no: se siguen cargando solo las del tema (next/font).
- `cqw` necesita que `.sf-root` sea contenedor. Si un componente de tienda se usa fuera (el admin, en la vista previa), envolverlo en un `div.sf-root`.
- La APK: probar la barra inferior y el CartDrawer con el teclado abierto.
