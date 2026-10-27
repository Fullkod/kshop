# Handoff: Kshop v2 — rediseño de tienda, admin, APKs y landing

> Paquete para que **Claude Code** implemente el nuevo diseño en el monorepo `kshop`.
> Empieza por aquí, luego `06-PLAN-MIGRACION.md`. El prompt listo para pegar está en `PROMPT-CLAUDE-CODE.md`.

## Overview
Antes, la tienda era plana: una sola variable de radio, 7 colores, tarjetas sin acciones y una portada con 6 secciones casi iguales.
v2 trae:
1. **Un sistema de temas ampliado y retrocompatible**: 12 colores editables (4 nuevos), forma, sombras y mayúsculas, y tokens
   derivados calculados en `themeStyle()`.
2. **Una biblioteca de componentes** compartida por la web y la app de tienda (Capacitor). El ancho decide la disposición.
3. **13 tipos de sección de portada**: los 6 actuales rediseñados y 7 nuevos.
4. **El admin rediseñado**: barra lateral agrupada en web, pestañas inferiores en la APK Kshop Admin y un editor de Apariencia con vista previa real.
5. **La landing de la plataforma** (`kshop.fullkod.com`).

## About the Design Files
Los archivos de `referencias/` son **prototipos de diseño hechos en HTML** (archivos `.dc.html`). Muestran el aspecto y el
comportamiento esperados; **no son código de producción para copiar**. La tarea es **recrearlos en el código existente**:
- Next.js 16 y React en `apps/web`.
- Componentes en `packages/storefront`, `packages/admin` y `packages/ui`.
- Tailwind v4, `cva` y `cn`.
- Zod en `packages/core`.

Sigue los patrones del repo y las reglas de `AGENTS.md`: arquitectura multi-tenant, reglas de la app móvil, módulos y Cache Components.

Para verlos: abre `referencias/Tienda Biblioteca.dc.html` en Chrome. Necesita `support.js` en la misma carpeta (ya incluido) y conexión
a internet (Google Fonts y la librería Lucide desde unpkg). Los selectores de arriba cambian el preset y todo se repinta.

**Excepción:** la carpeta `codigo/` sí es código pensado para pegarse casi tal cual (tokens, `theme.ts`, `themeStyle`, esquemas).

## Fidelity
**Alta fidelidad (hi-fi).** Colores, tipografía, radios, sombras, espaciado y textos son los finales.
Las fotos son marcadores rayados: en producción van las imágenes reales de la tienda (WebP propios, D12).
Los textos de ejemplo (productos, testimonios) son inventados.

## Índice
| Archivo | Contenido |
|---|---|
| `01-TOKENS.md` | Sistema de temas v2: campos, presets con hex, derivados, radios, sombras, tipografía, clases Tailwind |
| `02-COMPONENTES.md` | Átomos y moléculas de la tienda (Button, Badge, Price, ProductCard, Header, BottomTabBar, ficha, carrito) con medidas exactas y web vs móvil |
| `03-PORTADA.md` | Las 13 secciones de portada: datos, layout web y móvil, medidas |
| `04-ADMIN.md` | AdminShell web, dashboard, editor de Apariencia, APK Kshop Admin |
| `05-LANDING.md` | Landing de plataforma |
| `06-PLAN-MIGRACION.md` | Fases, archivos a tocar, criterios de aceptación y QA |
| `PROMPT-CLAUDE-CODE.md` | Prompt para arrancar cada fase en Claude Code |
| `codigo/` | `theme.ts`, `theme-style.ts`, `styles.css` de ui y storefront, y añadidos de `content.ts` |
| `referencias/` | Prototipos HTML, `themes.js` (misma lógica de temas en JS), marca, capturas de la UI actual |

## Mapa prototipo → repo
| Prototipo (`referencias/`) | Archivo(s) del repo |
|---|---|
| `TiendaPortada.dc.html` | `packages/storefront/src/components/HomeSections.tsx`, `HeroSlider.tsx`, `StoreHeader.tsx`, `StoreFooter.tsx`, nuevo `BottomTabBar.tsx`, nuevo `AnnouncementBar.tsx`, `apps/web/src/app/s/[storeSlug]/(front)/layout.tsx` |
| `ProductCard.dc.html` | `packages/storefront/src/components/ProductCard.tsx` |
| `TiendaFicha.dc.html` | `packages/storefront/src/components/ProductView.tsx`, `cart/CartView.tsx`, nuevo `cart/CartDrawer.tsx` |
| `Countdown.dc.html` | nuevo `packages/storefront/src/components/Countdown.tsx` (client) |
| `Icon.dc.html` | iconos: usar `lucide-react` (ver «Assets») |
| `Tienda Biblioteca.dc.html` § Átomos | `packages/ui/src/components.tsx` (Button, Badge, Input, Select, Alert…) |
| `Admin Biblioteca.dc.html` A1 | `apps/web/src/app/s/[storeSlug]/admin/AdminShell.tsx`, `admin/page.tsx`, `packages/admin/src/SalesTodayCard.tsx` |
| `AdminSidebar.dc.html` | `AdminShell.tsx` (aside) + agrupación en `apps/web/src/features/registry` |
| `Admin Biblioteca.dc.html` A2 | `apps/web/src/features/themes/components/ThemeEditor.tsx`, `AppearancePage.tsx` |
| `Admin Biblioteca.dc.html` A3 | shell de `apps/admin-app` (mismo código con layout móvil), `packages/admin/src/orders/OrderList.tsx` |
| `Plataforma Landing.dc.html` | `apps/web/src/app/(platform)/page.tsx` |
| `themes.js` | `packages/core/src/storefront/theme.ts` + `packages/storefront/src/theme-style.ts` (ya traducidos en `codigo/`) |

## Assets
- **Marca:** `referencias/brand/*.svg`, idénticos a `apps/web/public/brand/`. No hay que copiarlos.
- **Iconos:** en los prototipos son de **Lucide** (trazo 2, `round`), igual que los SVG a mano de `StoreHeader.tsx`. En el repo
  conviene usar **`lucide-react`**, que permite tree-shaking. Si no se quiere esa dependencia, se pueden copiar los SVG a mano.
  Nombres usados: `menu search user heart shopping-bag plus minus x check chevron-down chevron-left chevron-right arrow-right
  arrow-left truck banknote message-circle refresh-ccw shield-check star(relleno) flame tag zap trophy share-2 house layout-grid
  smartphone circle-check triangle-alert receipt users package package-plus file-spreadsheet warehouse coins palette globe
  trending-up wallet credit-card lock log-out bell external-link chevrons-up-down sliders-horizontal clock`.
- **WhatsApp:** usa `message-circle` sobre el verde `--wa #1FA855`. Si se quiere el logo oficial, es un asset de marca de terceros: pedirlo aparte.
- **Fuentes:** las mismas 6 de `THEME_FONTS` (next/font), más JetBrains Mono para cifras de código.

## Reglas que no cambian
- El checkout sigue siendo **por WhatsApp**; no se añade ninguna pasarela.
- Cada «Pedir por WhatsApp» reutiliza `components/whatsapp.ts`.
- Lo que ya no está en el plan se ve con el candado **PRO** y lleva a Plan y facturación, igual que hoy.
- La apariencia no está en el plan Base: el editor sigue detrás del módulo.
- Accesibilidad: zonas táctiles de al menos 44 px en móvil, contraste AA validado por `themeContrastIssues()` y foco visible
  (`--ring`, sombra de 4 px).
- Multi-tenant: nada de esto cambia RLS. La única migración SQL posible es ampliar los tipos de `home_sections`.
