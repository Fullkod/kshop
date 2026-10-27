# 03 · Portada (home_sections)

Prototipo: `referencias/TiendaPortada.dc.html`. Cada sección lleva una etiqueta negra con su `type`; en producción no se muestra
(en el prototipo se quita con `?labels=0`). El orden es libre, lo decide el admin; el que aparece aquí es el recomendado para una tienda nueva.
Esquemas Zod de los tipos nuevos: `codigo/packages-core-src-storefront-content.additions.ts`.

Convenciones: **P** = margen lateral `clamp(16px,4.4cqw,56px)`; **S** = separación superior `clamp(44px,5.6cqw,72px)`.

### SectionHeader (común)
`flex items-end justify-between gap-4 px-P`. A la izquierda, columna gap 6: eyebrow (12px 700 uppercase tracking .1em `text-primary`) + H2. A la derecha,
«Ver todo» + `arrow-right` 16 (600 14px); en web, además, flechas de carrusel de 40×40 `rounded-full border`. El eyebrow es **nuevo** y opcional:
añadir `eyebrow` a `sectionBase`.

---
| # | type | Web (1280) | Móvil / APK (390) |
|---|---|---|---|
| 0 | `announcement_bar` **nuevo** | Banda ink de 1 línea: icono + texto + «·» + texto 2 + enlace secondary | Solo icono + texto |
| 1 | `hero_slider` | Bloque partido: texto sobre acento + foto | Texto arriba y foto debajo, ancho completo |
| 2 | `benefits` **nuevo** | 4 tarjetas en fila | Rejilla 2×2 |
| 3 | `category_grid` | 6 columnas, foto cuadrada + nombre + nº | 3 columnas |
| 4 | `product_carousel` | 4 tarjetas visibles + flechas | Scroll lateral, unos 2,3 visibles, sin «Añadir» (solo +) |
| 5 | `banner_mosaic` **nuevo** | 2 piezas iguales (foto/ink + bloque secondary) | Apiladas |
| 6 | `offer_countdown` **nuevo** | Caja sale-soft: texto + contador a la izquierda y 3 tarjetas | Texto, contador y 2 tarjetas |
| 7 | `featured_product` **nuevo** | Foto 1:1 + miniaturas a la izquierda y compra a la derecha | Apilado |
| 8 | `collection_cards` **nuevo** | 3 tarjetas 4/5 sobre ink | Scroll lateral, 240 px |
| 9 | `brand_strip` | Rejilla de cajas de 72 px | 3 columnas |
| 10 | `testimonials` **nuevo** | Banda surface, 3 tarjetas | Scroll lateral, 280 px |
| 11 | `rich_text` | Centrado, máx. 680 | Igual |
| — | `banner` (simple) | Igual que la pieza A del mosaico a ancho completo, `aspect 21/7` | `16/9` |

### 1 · hero_slider (rediseño)
- Contenedor: `mx-P mt-[clamp(12px,2cqw,24px)] rounded-sf-lg overflow-hidden flex flex-wrap bg-primary text-primary-foreground`.
- **Panel de texto** `flex: 1 1 380px`, padding `clamp(24px,4.4cqw,56px)`, `justify-between gap-8 relative overflow-hidden`:
  - Círculo decorativo de 260×260 `bg-secondary rounded-full` en `right:-90 bottom:-110`, opacidad .95.
  - Eyebrow en píldora `bg-secondary text-secondary-foreground` («Nuevo»: viene de un campo nuevo del banner, `eyebrow`).
  - H1 (`banner.title`), subtítulo `clamp(15px,1.4cqw,18px)` opacidad .9 máx. 440 (`banner.subtitle`).
  - Botones: `inverse` alto 50 con `ctaLabel` + flecha, y `outline` sobre acento (`border-[1.5px] border-[color-mix(accent-fg_40%,transparent)]`) «Pedir por WhatsApp» (opcional, ajuste de la sección).
  - Controles: `01 / 03` (mono 12px), 3 barras de progreso de 3px (activa al 100 %, resto al 30 %) y, en web, flechas de 42 (anterior outline, siguiente relleno `accent-fg`).
- **Foto** `flex: 1.25 1 420px`, `min-height: clamp(300px,40cqw,540px)`, `<picture>` con `imageMobileUrl` (sin cambios).
  Tarjeta flotante opcional abajo a la izquierda (20/20): mini producto enlazado (`bg-background rounded-sf shadow-sf-lg`), con miniatura de 48, nombre, precio y botón de añadir de 34.
  Necesita el campo nuevo `banner.productId?`.
- Autoplay: el mismo `HeroSlider` (scroll-snap). Cada diapositiva es el bloque entero.
- Si un banner antiguo no tiene título, se muestra solo la foto a todo el ancho con `rounded-sf-lg`.

### 2 · benefits
`grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-[clamp(8px,1.4cqw,16px)] px-P pt-[clamp(16px,2.4cqw,28px)]`.
Tarjeta: `flex items-center gap-3 p-[clamp(12px,1.4cqw,18px)] rounded-sf bg-surface border`. Círculo de 42 `bg-accent-soft text-primary` (icono 20),
título 600 14px/1.25 y texto 12.5px muted.
Valores por defecto: Envío a domicilio · Paga al recibir · Pide por WhatsApp · Cambios en 7 días.

### 3 · category_grid
`grid-cols-[repeat(auto-fit,minmax(max(96px,12cqw),1fr))] gap-[clamp(10px,1.6cqw,20px)]`. Cada categoría: foto `aspect-square rounded-sf-lg`
(placeholder `secondary-soft` rayado), nombre 600 14px centrado y «48 productos» 12px muted.

### 4 · product_carousel
SectionHeader («Recién llegados» / título de la sección) + carrusel de ProductCard (ver 02). Fuente, límite y orden: sin cambios.

### 5 · banner_mosaic
`grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-[clamp(12px,1.6cqw,20px)]`, cada pieza con `min-height: clamp(280px,30cqw,400px)`, `rounded-sf-lg`, padding `clamp(22px,2.8cqw,36px)`.
- **A (banner):** foto + `scrim` de abajo hacia arriba (transparente al 65 %), texto abajo: eyebrow `text-secondary`, título 800 `clamp(28px,3.2cqw,42px)` y botón `bg-background text-foreground` alto 44.
- **B (bloque):** `bg-secondary text-secondary-foreground`, `justify-between`: píldora `bg-secondary-fg text-secondary` con `tag`, título y texto 15px opacidad .85,
  botón `bg-ink text-ink-foreground`. `bigText` decorativo de 900 `clamp(150px,18cqw,240px)`, opacidad .12, abajo a la derecha.

### 6 · offer_countdown
Caja `mx-P rounded-sf-lg bg-sale-soft border border-[color-mix(sale_22%,transparent)] p-[clamp(20px,3.4cqw,44px)] flex flex-wrap gap-[clamp(24px,3cqw,44px)] items-center`.
- Texto `1 1 280px`: píldora `bg-sale text-sale-foreground` con `zap` («Oferta flash»), H2, texto muted máx. 380 y **Countdown**.
- **Countdown** (componente cliente): 4 cajas (días · horas · min · seg) de ancho `clamp(62px,6cqw,76px)`, `py-3 rounded-sf bg-background shadow-sf`.
  Cifra 800 `clamp(24px,2.4cqw,30px)` `text-sale tabular-nums` y etiqueta 10.5px 600 uppercase muted. Se actualiza cada 1 s; al llegar a 0 la sección se oculta
  (el servidor ya filtra por `endsAt`; el cliente oculta al cruzar).
- Productos `2 1 420px`: `grid-cols-[repeat(auto-fill,minmax(146px,1fr))]`, ProductCard `compact`. Hasta 3 en web y 2 en móvil.

### 7 · featured_product
`flex flex-wrap gap-[clamp(24px,4.4cqw,64px)] items-center`. Foto `1 1 340px` 1:1 `rounded-sf-lg shadow-sf` con badge («Más vendido», campo `badge`) y 3 miniaturas de 64.
Compra `1 1 340px`: eyebrow, marca, H2, valoración, precio 800 `clamp(26px,2.6cqw,32px)` + tachado + -%, descripción corta muted máx. 460, selector de color,
stepper + «Añadir al carrito» y «Pedir por WhatsApp» a ancho completo, y la línea «Recíbelo mañana en La Habana» con `truck` en `text-success`
(texto configurable en entregas). Es la misma lógica de variantes que la ficha: reutilizar las piezas de `ProductView`.

### 8 · collection_cards
SectionHeader + carrusel `auto-cols-[clamp(240px,calc((100cqw-152px)/3),420px)]`. Tarjeta `aspect-[4/5] rounded-sf-lg bg-ink text-ink-foreground p-[22px]`, con la foto de la colección
+ `scrim` (60 %). Abajo: «24 productos» 12.5px opacidad .8, nombre 800 26px y «Ver colección →» 600 14px `text-secondary`.
Necesita una imagen de portada en la colección (`collections.image_url`). Si no la tiene, sale el rayado sobre ink.

### 9 · brand_strip
Eyebrow centrado muted («Marcas que vendemos») + `grid-cols-[repeat(auto-fit,minmax(max(100px,13cqw),1fr))] gap-3`. Caja `h-[72px] rounded-sf border`
con el logo (máx. 32 px de alto) o el nombre en 700 17px título muted. Hover: `text-foreground border-foreground`.

### 10 · testimonials
Banda `mt-S bg-surface py-S`. Cabecera centrada: eyebrow «Opiniones», H2 y resumen (5 estrellas + «**4,9** de 5 · 312 opiniones»).
Carrusel `auto-cols-[clamp(280px,calc((100cqw-152px)/3),420px)]`. Tarjeta `figure p-6 rounded-sf bg-background border shadow-sf gap-[14px]`: estrellas 16,
cita 15px/1.55 entre comillas tipográficas, y pie con avatar de iniciales de 40 (`bg-accent-soft text-primary` 700) + nombre 600 14px + «Plaza · compró Vestido Ñandú» 12.5px muted.
Los datos los escribe el dueño en v1 (sin reseñas automáticas).

### 11 · rich_text
`py-[clamp(48px,6cqw,80px)] px-P`, contenedor de 680 centrado: eyebrow, H2 `text-wrap:balance`, Markdown 16px/1.65 muted y enlace opcional con flecha.

---
## Cambios en el editor de Portada (`SectionsEditor.tsx`)
- Añadir los 7 tipos al selector «Añadir sección», cada uno con su formulario (los campos del esquema).
- `announcement_bar` se pinta **fuera** del flujo, encima de la cabecera; si hay varias activas, solo se muestra la primera.
- Vista previa: el iframe de la tienda (como hoy) con un selector Web/Móvil (ver 04 › Apariencia).
- Valores por defecto al crear una tienda: hero_slider, benefits, category_grid, product_carousel (novedades), banner_mosaic y rich_text.
