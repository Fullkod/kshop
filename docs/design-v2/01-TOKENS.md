# 01 · Tokens y sistema de temas v2

Fuente de verdad: `codigo/packages-core-src-storefront-theme.ts` y `codigo/packages-storefront-src-theme-style.ts`.
Equivalente en JS para los prototipos: `referencias/themes.js` (misma lógica, mismos valores).

## 1. Qué guarda el admin (`stores.theme`, JSON)
```ts
{ preset: "kshop"|"classic"|"minimal"|"warm"|"fresh"|"dark",
  colors?: Partial<12 colores>,
  headingFont?, bodyFont?,            // THEME_FONTS (sin cambios)
  radius?: "none"|"sm"|"md"|"lg"|"full",
  buttonShape?: "auto"|"pill",        // NUEVO
  elevation?: "flat"|"soft"|"lifted", // NUEVO
  headingCase?: "normal"|"uppercase"  // NUEVO
}
```
**Retrocompatible:** un tema v1 se lee sin cambios. Lo que falta sale del preset, y como el preset v1 tenía 7 colores,
`secondary`, `ink` y `sale` salen del preset elegido. No hace falta migrar datos.

## 2. Colores editables (12)
| Campo | Variable CSS | Clase Tailwind | Uso | Nuevo |
|---|---|---|---|---|
| accent | `--accent` | `bg-primary` / `text-primary` | Botón principal, enlaces, selección, fondo del hero | |
| accentFg | `--accent-fg` | `text-primary-foreground` | Texto sobre acento | |
| secondary | `--secondary` | `bg-secondary` | Badge «Nuevo», estrellas, contador del carrito, círculo decorativo del hero, bloque B del mosaico | ✔ |
| secondaryFg | `--secondary-fg` | `text-secondary-foreground` | Texto sobre secundario | ✔ |
| background | `--bg` | `bg-background` | Fondo de página | |
| surface | `--surface` | `bg-surface` | Tarjetas, beneficios, campo de búsqueda, banda de opiniones | |
| ink | `--ink` | `bg-ink` | Barra de anuncio, pie, banner con imagen, tarjetas de colección, toast | ✔ |
| inkFg | `--ink-fg` | `text-ink-foreground` | Texto sobre ink | ✔ |
| foreground | `--fg` | `text-foreground` | Texto principal y precios | |
| muted | `--muted` | `text-muted-foreground` | Marca del producto, ayudas, precio tachado | |
| line | `--line` | `border-border` | Bordes y divisores | |
| sale | `--sale` | `bg-sale` / `text-sale` | Badge -%, «Ofertas» del menú, cifras de la cuenta atrás, descuentos del carrito | ✔ |

## 3. Derivados (calculados, nunca se guardan)
| Variable | Fórmula | Clase |
|---|---|---|
| `--accent-hover` | `color-mix(accent 86%, negro)`, o blanco si el tema es oscuro | `hover:bg-primary-hover` |
| `--accent-soft` | `color-mix(accent 12%, background)` | `bg-accent-soft` |
| `--secondary-soft` | `color-mix(secondary 20%, background)` | `bg-secondary-soft` |
| `--sale-soft` | `color-mix(sale 12%, background)` | `bg-sale-soft` |
| `--sale-fg` | `readableOn(sale)`: `#FFFFFF` o `#111111`, el que más contraste | `text-sale-foreground` |
| `--surface-2` | `color-mix(line 45%, surface)` | `bg-surface-2` |
| `--ink-muted` | `color-mix(inkFg 70%, ink)` | `text-ink-muted` |
| `--ring` | `color-mix(accent 45%, transparent)` | foco: `shadow-[0_0_0_4px_var(--ring)]` |
| `--scrim` | `color-mix(ink 72%, transparent)` | degradado sobre fotos: `linear-gradient(to top, var(--scrim), transparent 60–65%)` |
| `--ok/--ok-bg`, `--warn/--warn-bg`, `--bad/--bad-bg` | claro: `#1F7A4D/#E3F4EA`, `#8A5A00/#FFF3D6`, `#A3262E/#FBE6E7` · oscuro: `#6FD39C/#17321F`, `#F5C451/#3A2E12`, `#FF8F95/#3A1A1E` | `text-success`, `bg-warning-soft`… |
| `--wa` | `#1FA855` fijo | `bg-whatsapp` / `text-whatsapp` |

**Modo oscuro:** `theme.isDark = luminance(background) < 0.2`. Antes era `preset === "dark"`, lo que fallaba con colores propios.

**Contraste:** `themeContrastIssues()` comprueba 6 parejas. Son las 4 de antes más secundario/texto y banda/texto. El editor las muestra en vivo.

## 4. Presets (valores exactos)
| | kshop | classic | minimal | warm | fresh (nuevo) | dark |
|---|---|---|---|---|---|---|
| accent | #5B21B6 | #1F3A5F | #111111 | #B4441E | #0F7B4F | #F2B705 |
| accentFg | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #24104F |
| secondary | #F2B705 | #B08D57 | #E9E9E6 | #E8A33D | #FF8A3D | #B79CFF |
| secondaryFg | #24104F | #1A1A1A | #111111 | #3B2416 | #2A1A0A | #14101F |
| background | #FFFFFF | #FFFFFF | #FFFFFF | #FFFBF5 | #FFFFFF | #14101F |
| surface | #F7F5FC | #F4F4F2 | #F5F5F5 | #F8EEE2 | #F1F7F3 | #211A33 |
| ink | #24104F | #1F3A5F | #111111 | #3B2416 | #0F3D2A | #0B0814 |
| inkFg | #FFFFFF | #FFFFFF | #FFFFFF | #FFFBF5 | #FFFFFF | #F5F3FA |
| foreground | #24104F | #1A1A1A | #111111 | #3B2416 | #12261C | #F5F3FA |
| muted | #5E5873 | #5C5C5C | #5F5F5F | #6E5442 | #4F6158 | #B8B0CC |
| line | #E6E1F2 | #E2E2DE | #E5E5E5 | #EBDCCB | #DCE7DF | #332A4A |
| sale | #C42350 | #9E2B25 | #D11A1A | #A3262E | #C93A1C | #FF7A93 |
| headingFont | outfit | playfair-display | inter | poppins | poppins | outfit |
| bodyFont | dm-sans | lora | inter | dm-sans | dm-sans | dm-sans |
| radius | lg | sm | none | md | full | lg |
| buttonShape | auto | auto | auto | auto | pill | auto |
| elevation | soft | flat | flat | soft | soft | lifted |
| headingCase | normal | normal | uppercase | normal | normal | normal |

Los 7 colores v1 de cada preset no cambian, para que las tiendas que ya existen se vean igual de color.

## 5. Forma
`radius` → 4 radios. `buttonShape: "pill"` fuerza `--sf-btn-radius: 9999px`.
| radius | `--sf-radius-sm` (badges, miniaturas) | `--sf-radius` (tarjetas, campos de ficha) | `--sf-radius-lg` (hero, banners, bloques) | `--sf-btn-radius` (botones, inputs, chips de variante) |
|---|---|---|---|---|
| none | 0 | 0 | 0 | 0 |
| sm | 2 | 4 | 6 | 4 |
| md | 4 | 8 | 12 | 8 |
| lg | 8 | 14 | 22 | 12 |
| full | 10 | 20 | 28 | 9999 |

Clases Tailwind (vía `@theme`): `rounded-sf-sm`, `rounded-sf`, `rounded-sf-lg`, `rounded-sf-btn`. Sustituyen a `rounded-[var(--sf-radius)]`.
**Excepción:** los iconos redondos (favorito, flechas del carrusel, avatares) siempre son `rounded-full`.

## 6. Sombras (`elevation`)
`sh = color-mix(foreground 18%, transparent)`; en tema oscuro, `color-mix(#000 60%, transparent)`.
| elevation | `--sf-shadow` (tarjeta, foto de producto, caja de cuenta atrás) | `--sf-shadow-lg` (tarjeta flotante del hero, carrito, toast) |
|---|---|---|
| flat | none | `0 0 0 1px line` |
| soft | `0 1px 2px sh, 0 8px 24px -14px sh` | `0 24px 60px -24px sh` |
| lifted | `0 2px 4px sh, 0 14px 32px -12px sh` | `0 32px 80px -20px sh` |

Clases: `shadow-sf`, `shadow-sf-lg`.

## 7. Tipografía de la tienda
Títulos: `font-family: var(--sf-heading); text-transform: var(--sf-case); letter-spacing: var(--sf-track)`. Normal: `-0.015em`; en mayúsculas: `0.04em`.
Los tamaños fluidos usan `cqw`, porque `.sf-root` tiene `container-type: inline-size`. Así la web (1280) y la APK (390) comparten componente.
| Rol | Tamaño | Peso / interlineado |
|---|---|---|
| H1 del hero | `clamp(38px, 5cqw, 68px)` | 800 / 1.02, `text-wrap: balance` |
| H1 de la ficha | `clamp(28px, 3cqw, 40px)` | 800 / 1.08 |
| H2 de sección | `clamp(24px, 2.6cqw, 34px)` | 700 / 1.1 |
| H2 destacado (mosaico, oferta, producto destacado) | `clamp(26–28px, 3–3.2cqw, 40–44px)` | 800 / 1.05 |
| Eyebrow (antetítulo) | 12px, `uppercase`, tracking `.1em` | 700, color `--accent` (`--secondary` sobre ink, `--muted` en marcas) |
| Texto | 15px (página), 14px (UI), 12.5–13px (metadatos) | 400–600 / 1.5 |
| Precio de tarjeta | 16px, letra de títulos | 700 |
| Precio de ficha | 30px, letra de títulos | 800 |
| Marca del producto | 11px, `uppercase`, tracking `.08em`, `--muted` | 500 |
| Badge | 12px | 600 («Nuevo») / 700 (-%) |
| Código / contador | JetBrains Mono 11–12px | 500 |

## 8. Espaciado y layout de la tienda
- Margen lateral de página: `clamp(16px, 4.4cqw, 56px)` (56 px a 1280 y 16 px a 390). **Sin `max-width`**: el contenido ocupa todo el ancho.
- Separación vertical entre secciones: `clamp(44px, 5.6cqw, 72px)`.
- Hueco entre tarjetas: `clamp(12px, 1.6cqw, 20px)`.
- Cortes de ancho: **720 px** (móvil/APK frente a web) y **1180 px** (menú completo). Por debajo de 1180 hay hamburguesa. El campo de búsqueda solo aparece
  por encima de 1400; por debajo es un icono. Así nunca se pisan el nombre de la tienda, el menú y la búsqueda.

## 9. Admin (marca fija, no usa el tema de la tienda)
`--night #24104F` (barra lateral y cabecera de la APK), `--accent #5B21B6`, `--gold #F2B705`, `--surface #F7F5FC`, `--line #E6E1F2`,
texto `#17132A` y secundario `#625C7A`. Tipos: Outfit para títulos y cifras, DM Sans para la interfaz.
Radios del admin: 9–10 px en controles, 14 px en tarjetas y 12 px en botones. Ver `04-ADMIN.md`.
