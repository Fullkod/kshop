# 02 · Componentes de la tienda (web y APK de tienda)

Todos viven en `packages/storefront` (o `packages/ui` para los genéricos) y solo leen variables del tema.
**Nunca** hay un hex fijo en un componente de tienda, salvo `--wa` y los colores reales de variante.
Referencia visual: `referencias/Tienda Biblioteca.dc.html` (§02 Átomos, §03 ProductCard), `TiendaPortada.dc.html` y `TiendaFicha.dc.html`.

---
## Átomos (`packages/ui/src/components.tsx`)

### Button
`inline-flex items-center justify-center gap-2 rounded-sf-btn font-semibold transition-colors focus-visible:shadow-[0_0_0_4px_var(--ring)]`
| Variante | Estilo | Hover |
|---|---|---|
| `default` | `bg-primary text-primary-foreground`, peso 700 | `bg-primary-hover` |
| `secondary` (nuevo) | `bg-secondary text-secondary-foreground` | opacidad .92 |
| `outline` | `border-[1.5px] border-border bg-background text-foreground` | `border-foreground` |
| `ghost` | `text-primary bg-transparent` | `bg-accent-soft` |
| `whatsapp` (nuevo) | `bg-whatsapp text-white` + icono `message-circle` 18 | opacidad .92 |
| `whatsappOutline` (nuevo) | `border-[1.5px] border-whatsapp text-whatsapp` | `bg-[color-mix(in_srgb,var(--wa)_8%,transparent)]` |
| `inverse` (nuevo, sobre acento) | `bg-primary-foreground text-primary` | opacidad .92 |
| `destructive` | igual que ahora | |
| disabled | `opacity-45 pointer-events-none` | |

| Tamaño | Alto / padding horizontal / letra |
|---|---|
| `sm` | 36 / 14 / 13px |
| `default` | 44 / 18 / 14px |
| `lg` | 52 / 24 / 16px (CTA de ficha 54 / 22) |
| `icon` | 44×44 |
En el admin se mantienen los tamaños, pero con radios propios (ver 04).

### Badge (tienda)
Padding `6px 8px`, `rounded-sf-sm`, 12px. Los de estado de pedido son `rounded-full` con un punto de 6px delante.
| Uso | Clases |
|---|---|
| Descuento `-20%` | `bg-sale text-sale-foreground font-bold` |
| `Nuevo`, `Más vendido` | `bg-secondary text-secondary-foreground font-semibold` (Más vendido con icono `trophy` 13) |
| `Envío gratis` | `bg-accent-soft text-primary` |
| `Agotado` | `bg-background text-foreground border border-border` |
| Entregado / Pendiente / Cancelado | `bg-success-soft text-success` / `bg-warning-soft text-warning` / `bg-destructive-soft text-destructive` |
| Píldora de eyebrow (hero, mosaico, oferta) | `rounded-full px-3 py-[7px] text-[11–12px] font-bold uppercase tracking-[.1em]` |

### Price (`components/Currency.tsx`, sin cambios de lógica)
- Normal: letra de títulos, 700, `text-foreground` (16 en tarjeta, 30/800 en ficha).
- «Desde»: 12px `text-muted-foreground` antes del precio, si `maxPrice > minPrice`.
- Rebajado: precio + tachado 12–15px `text-muted-foreground line-through` + badge `-N%`.
  El `%` = `round((compareAt − price) / compareAt × 100)` y se calcula en `ProductCardData`.
- En la ficha, debajo, va la equivalencia en otras monedas: `≈ 4,50 USD · 4,20 MLC según tasa de hoy` (13px, muted). Solo con multimoneda.

### Input / Select / Search
- Alto 46 (ficha y checkout) o 42–44 (cabecera), `rounded-sf-btn`, padding 14, letra 15px.
- Reposo: `border border-border bg-background`. Foco: `border-[1.5px] border-primary shadow-[0_0_0_4px_var(--ring)]`.
  Error: `border-[1.5px] border-destructive` + mensaje 12.5px `text-destructive`.
- Search: `bg-surface border border-border text-muted-foreground`, icono `search` 18, gap 8.
- Selector de moneda (`CurrencySelect`): alto 42 en web y 36 en móvil, padding 10/8, `border`, 600 13px, texto «CUP» + `chevron-down` 14.

### VariantPicker (`ProductView.tsx`)
- Talla: 52×46 (48×44 en la biblioteca), `rounded-sf-btn`. Seleccionada: `border-2 border-primary bg-accent-soft text-primary font-semibold`.
  Reposo: `border border-border`. Sin stock: `border-dashed text-muted-foreground line-through`, sigue siendo clicable para avisar.
- Color: alto 46, `pl-[10px] pr-[14px] gap-2`, círculo de 20 con el hex real del valor de atributo y nombre 14px. Seleccionado: `border-2 border-primary`.
- Encima va la etiqueta `Talla: S` (600 / valor en muted), y a la derecha, si existe, el enlace «Guía de tallas» (13px).

### QuantityStepper
Alto 54 en ficha y 44 en listas. Borde `border-border rounded-sf-btn`, botones de 46×100% con iconos `minus`/`plus` 16 y número de 28px de ancho en 600.

### Tabs / Segmented
Contenedor `bg-surface p-1 rounded-sf-btn gap-1`. Activa: `bg-background shadow-sf font-semibold`. Inactiva: `text-muted-foreground`. Padding `9px 14px`.

### Chip de filtro (listados)
Alto 34, `rounded-full`, `px-3.5`, 13px. Activo: `bg-foreground text-background` + `x` 14. Reposo: `border border-border`.

### Toast «Añadido al carrito»
`bg-ink text-ink-foreground rounded-sf shadow-sf-lg p-[12px_14px] gap-3`. Lleva un círculo de 36 `bg-success text-white` con `check`,
el título en negrita, la variante en `text-ink-muted` y el enlace «Ver carrito» en `text-secondary` 600.
En web se abre el **CartDrawer**; en móvil, toast + badge del carrito.

### Aviso de la app (`AndroidAppBanner`)
`bg-accent-soft rounded-sf p-[12px_14px]`, icono `smartphone` 18 en `text-primary`, texto 14px y enlace «Instalar» 700 a la derecha.

---
## ProductCard (`components/ProductCard.tsx`) — `layout: "grid" | "row"`, `compact?: boolean`
### grid (listados, carruseles, ofertas)
```
<article flex-col gap-[10px]>
  <div foto aspect-[4/5] rounded-sf overflow-hidden shadow-sf bg sf-placeholder | <img object-cover>>
    arriba-izq (left/top 10, columna gap 6): badge -% · badge «Nuevo»/product.badge · «Agotado»
    arriba-der (right/top 10): botón favorito 36×36 rounded-full bg-[color-mix(bg_88%,transparent)] icono heart 18
    abajo-der (right/bottom 10): añadir rápido  alto 40, rounded-sf-btn, bg-primary, shadow-sf,
            icono plus 18 + «Añadir» (600 13px); con compact (móvil) solo el icono, 40×40
            (oculto si está agotado; si el producto tiene variantes, abre un selector rápido: hoja inferior en móvil, popover en web)
  </div>
  <div info px-[2px] flex-col gap-[6px]>
    fila: marca (11px uppercase tracking .08em muted) ······ puntos de color 12×12 rounded-full, gap 4, máx. 4 (+N)
    nombre: 500 15px/1.3, line-clamp-2
    fila: [Desde] precio 700 16px · tachado 12px ······ botón WhatsApp 34×34 rounded-full border text-whatsapp icono 17
  </div>
</article>
```
- Agotado: la foto queda al 45 % de opacidad y desaparece «Añadir».
- Hover (web): la foto pasa a `scale-105` en 300 ms (como ahora) y el botón de añadir a `bg-primary-hover`.
- «Pedir por WhatsApp» directo: abre `wa.me` con el mensaje de `whatsapp.ts` («Hola, quiero: {nombre} – {precio}» + enlace).
- Favoritos: es una función **nueva**. En v1 vale con `localStorage` por tienda (`kshop:fav:{storeId}`). Con sesión de cliente se puede guardar en BD más adelante; hay que decidirlo en el PRP.
- Datos nuevos en `ProductCardData`: `discountPercent?`, `swatches?: string[]` (hex de los valores de atributo color), `variantCount`.

### row (carrito, búsqueda instantánea, ofertas en móvil)
Foto de 76 px de ancho en 4/5 con `rounded-sf-sm` (badge -% de 10px dentro), columna con marca, nombre de una línea con elipsis y precio 700 15px + tachado,
y botón de añadir de 40×40. En el carrito, el botón se sustituye por un QuantityStepper de 44.

### Rejilla
- Listado: `grid-cols-2` (móvil, hueco 12) → `sm:grid-cols-3` → `lg:grid-cols-4` (hueco 20).
- Carrusel: `grid-flow-col auto-cols-[clamp(164px,calc((100cqw-172px)/4),300px)] overflow-x-auto sf-scroller`, con padding lateral de página
  (4 columnas exactas a 1280, unos 42 % de ancho a 390).

---
## Cabecera y navegación
### AnnouncementBar (nuevo, sección `announcement_bar`)
`bg-ink text-ink-foreground`, padding `10px` + margen lateral de página, 13px 500, centrado, gap 10. Icono (`truck` por defecto) 16 + texto.
En web añade `·` (opacidad .5) + texto secundario + enlace en `text-secondary` 600. En móvil solo el texto principal.

### StoreHeader
`sticky top-0 z-30 bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur-md border-b border-border`, fila con padding `12px` + margen lateral y gap `clamp(6px,1.8cqw,24px)`.
1. **Hamburguesa** (< 1180): 44×44, icono `menu` 22.
2. **Logo**: `flex-none max-w-[60%]`. Cuadrado de 36 `rounded-sf-sm bg-primary text-primary-foreground` con la inicial (800 18px, letra de títulos), o el logo
   de la tienda, más el nombre (700 19px, título, `truncate`).
3. **Menú** (≥ 1180): `flex-1 min-w-0 overflow-hidden`. Cada enlace `flex-none px-2.5 py-[9px] rounded-sf-btn 500 14px whitespace-nowrap`, con `chevron-down` 14 si tiene
   hijos (el desplegable de dos niveles es igual que ahora). Al final va **«Ofertas»** en `text-sale` 600 con icono `flame` 15 (enlace a `/collection/ofertas` o `?onSale`).
4. **Acciones** (`ml-auto flex-none gap-1`): búsqueda (campo `clamp(150px,15cqw,240px)` solo si el ancho es ≥ 1400; si no, icono de 44), moneda, favoritos 44,
   cuenta 44 y **carrito** = botón relleno `bg-primary` de alto 44 con `shopping-bag` 19 y badge contador `bg-secondary text-secondary-foreground` 20×20 (700 11px).
5. **Móvil** (< 720): debajo de la fila, un buscador de ancho completo de alto 44 («Buscar en {tienda}») y una fila de chips de categorías con scroll
   (alto 34, `rounded-full border`, 13px 500).
> **Bug corregido:** el nombre de la tienda ya no se monta encima del menú. El logo es `flex-none`, el menú es `min-w-0 overflow-hidden`, las acciones son `flex-none`
> y los cortes están en 1180 y 1400.

### BottomTabBar (nuevo; solo < 720 y en la APK)
`sticky bottom-0 z-30` (`fixed` en la app), `grid-cols-5`, `bg-[color-mix(bg_94%,transparent)] backdrop-blur-md border-t`, padding `6px 4px 10px + safe-area-inset-bottom`.
Pestañas: **Inicio** `house`, **Categorías** `layout-grid`, **Favoritos** `heart`, **Carrito** `shopping-bag` (con badge), **Cuenta** `user`.
Cada una: píldora de 56×30 `rounded-full` (activa: `bg-accent-soft text-primary`) con icono 21 y etiqueta 11px 600 (activa `text-primary`, reposo `text-muted-foreground`).
Badge: 18 px de alto, `bg-secondary text-secondary-foreground` 700 10px, en `top:-2 right:8`.
En móvil, el pie lleva padding inferior extra para no quedar debajo de la barra.

### StoreFooter
`bg-ink text-ink-foreground`, padding superior `clamp(40px,5cqw,64px)`. Dos bloques con `flex-wrap gap-10`:
- Marca (`1 1 260px`, máx. 360): logo cuadrado `bg-secondary text-secondary-foreground` + nombre, descripción 14px `text-ink-muted` y botón WhatsApp (`bg-whatsapp`, alto 46).
- Columnas (`2 1 420px`, `grid auto-fit minmax(130px,1fr) gap-7`): título 11.5px uppercase tracking .1em `text-ink-muted` y enlaces 14px `text-ink-foreground` (hover `text-secondary`). Salen del menú `footer`.
- Barra legal: `mt-10 py-[18px] border-t border-[color-mix(ink-fg_14%,transparent)]` 12.5px `text-ink-muted`: «© 2026 {tienda} · Precios en CUP, USD y MLC» · «Tienda creada con Kshop».

---
## Ficha de producto (`ProductView.tsx`) — ver `TiendaFicha.dc.html`
- **Barra superior:** migas 13px muted con `chevron-right` 14 y el actual en `text-foreground` 500. En móvil, botón atrás `arrow-left` 44 antes de las migas.
- **Layout:** `flex-wrap gap-[clamp(20px,4.4cqw,56px)]`, galería `1.1 1 380px` e información `1 1 340px`.
- **Galería web:** miniaturas en columna (68×84, `rounded-sf-sm`, activa `ring-2 ring-primary`, resto `ring-1 ring-border`) a la izquierda y foto principal 4/5 `rounded-sf-lg`.
  **Móvil:** foto arriba y miniaturas en fila debajo (`flex-col-reverse` / `row`).
  Sobre la foto: badge arriba a la izquierda; a la derecha, favorito y compartir (44 `rounded-full bg-background shadow-sf`); contador `1 / 4` (mono 11px, píldora) abajo a la derecha.
- **Información** (columna gap 20): marca (12px uppercase muted, enlace a /brand) · H1 · valoración (5 estrellas rellenas `text-secondary` 15 + «**4,9** · 38 opiniones» 13px).
  · **Caja de precio** `bg-surface rounded-sf p-4`: precio de 30px, tachado, -% y equivalencia de moneda.
  · Talla · Color · stock (punto de 8 + «Disponible · quedan 4» en `text-success` 500; si hay 5 o menos se dice cuántas quedan).
  · **CTA web:** stepper de 54 + «Añadir al carrito» (`flex-1`, 54, 700 16px, `shadow-sf`) y debajo «Pedir por WhatsApp» (`whatsappOutline`, ancho completo, alto 50).
  · Beneficios en rejilla de 2×2 (círculo de 36 `bg-accent-soft text-primary`, icono 17, texto 13px).
  · Acordeón (Descripción abierta / Envío y entrega / Opiniones): filas con `border-b`, padding 16, título 600 e icono `minus`/`plus` 18.
- **Relacionados:** carrusel de ProductCard con eyebrow «Combínalo con» y H2 «También te puede gustar».
- **Barra de compra móvil** (`sticky bottom-0`, sustituye a la BottomTabBar en la ficha): WhatsApp 52×52 outline + botón de 52 `flex-1 justify-between`
  con «Añadir» e icono a la izquierda y el precio (letra de títulos) a la derecha.

## CartDrawer (nuevo; `cart/CartDrawer.tsx`)
Web: panel lateral derecho de 420 px. Móvil: hoja inferior al 90 % de alto. `bg-background rounded-sf-lg shadow-sf-lg`.
1. Cabecera: «Tu carrito · 3» (700 19px título) + `x`, con `border-b`.
2. Barra de envío gratis `bg-accent-soft`: «¡Te faltan **1 650 CUP** para el envío gratis!» y progreso de 6px (`bg-primary` sobre `color-mix(accent 18%, bg)`).
   Necesita un umbral de envío gratis en la configuración de entregas; si no hay umbral, la barra no se muestra.
3. Líneas ProductCard `row` con stepper, y cupón (input con borde discontinuo + botón «Aplicar» `bg-foreground text-background`).
4. Pie: «Descuentos» en `text-sale`, «Total» 800 24px y CTA **«Finalizar pedido por WhatsApp»** (`bg-whatsapp`, alto 54, 700 16px). Debajo, «Pagas al recibir · en efectivo o transferencia» (12.5px muted).
`CartView` (página `/cart`) usa los mismos bloques a página completa.

## Estados que hay que respetar
- **Cargando:** esqueletos con `bg-surface` y `animate-pulse`, con el mismo tamaño que el contenido (CLS 0, como ahora).
- **Sin imagen:** `sf-placeholder` (rayado), sin texto.
- **Sin conexión y versión nueva (APK):** mismas pantallas de la Fase 7, pero con Button y Alert v2.
- `prefers-reduced-motion`: sin autoplay en el hero ni zoom de fotos.
