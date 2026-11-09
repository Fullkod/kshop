# La web en el teléfono (2026-10-31)

Roberto pidió que quien abra la web desde un iPhone o un Android (sin app) pueda hacerlo todo con comodidad.
Medido con `pnpm qa:mobile` (61 páginas a 390 px: admin, tienda y superadmin), corregido en común y vuelto a medir.

## Reglas que ya están en el código (seguirlas en lo nuevo)

- **Variante `touch:`** (`packages/ui/src/styles.css`): dedo (`pointer: coarse`) o pantalla de menos de 48 rem.
  Lo que un dedo toca mide **40 px o más** bajo `touch:` (`touch:h-10`, `touch:size-10`, `touch:min-h-10`);
  con ratón se mantiene lo denso. `Button size="sm"`, `Chip` y `Segmented` ya lo traen.
- **Campos a 16 px en táctil** (regla sin capa en `styles.css`): iOS hace zoom en cualquier campo más pequeño.
  No hace falta tocar cada `Input`; sí vale para selects escritos a mano.
- **Enlaces de texto** («Ver», «← Pedidos»): en táctil reciben 8 px de área extra arriba y abajo por `::after`
  (quedan excluidos los `flex`, `block`, `absolute` y los que ya usan `after:`). Casillas y radios a 24 px.
- **«Volver» en la barra superior del móvil**: `AdminShell` lo pone en toda subpágina de un módulo (un pedido,
  un producto, Categorías…) hacia el módulo; `SuperadminShell` en `/superadmin/<algo>/<algo>`. No hace falta
  añadir «Volver» en cada página.
- **Pestañas de módulo**: `AdminSubNav` (`apps/web/src/components/`), no un `<nav>` a mano: en el teléfono van
  de borde a borde, la activa se centra y miden 44 px.
- **Filtros de lista**: `FilterBar` de `@kshop/admin`: en pantalla ancha siempre a la vista; en el teléfono detrás
  de un botón «Filtros · n» (la búsqueda queda fuera, siempre visible). Úsalo en toda lista nueva con filtros.
- **Formularios largos** en el teléfono: la cabecera del editor de producto (nombre, estado, Guardar) es
  `sticky` bajo la barra (`--admin-header-height`, 4 rem en la web, la barra de estado en Kshop Admin); el pedido
  manual lleva el subtotal y «Crear pedido» fijos abajo (`lg:hidden`, con `env(safe-area-inset-bottom)`).
  Todo `sticky` de una pantalla del admin usa esa variable, nunca `top-0`: con `top-0` se mete bajo la cabecera.
- **Barra de estado en Kshop Admin (2026-11-09):** con `targetSdk` 35+ Android ignora `StatusBar.setBackgroundColor` y
  la app se dibuja detrás. Con WebView 140+ la cubre la franja oscura de `apps/admin-app/src/styles.css`
  (`body::before` y `dialog[open]::before`); con uno anterior, `android:windowBackground`, que pone `app-build.mjs`.
  Para probarlo sin teléfono: CDP `Emulation.setSafeAreaInsetsOverride`.
- **Tablas**: siempre dentro de un `overflow-x-auto`; en el catálogo el estado baja bajo el nombre en el móvil
  (`hidden md:table-cell`) para que el nombre tenga sitio.
- `viewportFit: "cover"` en el layout: los `env(safe-area-inset-*)` valen algo en un iPhone.

- **Tema claro / oscuro / sistema** (Roberto, 2026-10-31): `ThemeSwitch` de `@kshop/ui` en la barra lateral del admin
  y del superadmin y en «Más» de Kshop Admin. La elección va a `localStorage` (`kshop-theme`) y a `data-theme` en
  `<html>` por un script inline antes de pintar (`THEME_BOOT_SCRIPT` en el layout y en `apps/admin-app/index.html`);
  `styles.css` y la variante `dark:` leen el sistema salvo que haya elección. Es por navegador, no por cuenta.
- **Tablas de edición en el teléfono**: las variantes del producto son tarjetas por debajo de `md`
  (`useMediaQuery` de `@kshop/admin`; un solo DOM, nada duplicado para Playwright). Un `<pre>` o un `<textarea>`
  dentro de una tarjeta lleva `min-w-0` y `[overflow-wrap:anywhere]`: un enlace largo no tiene por dónde partirse.
- **Variantes**: «Generar» solo añade las combinaciones que faltan (y dice cuántas); cada fila se quita con «×»
  (se borra al guardar; los pedidos hechos conservan su snapshot). La caja deja escribir la cantidad.

## Cómo medir

`pnpm qa:mobile` (con `pnpm dev`; `QA_PAGES=admin,store,super`, `QA_VIEWS=catalog,orders/new`). Informe en
`.titan/qa/mobile-web/report.json` y una captura por página. Avisa de desbordes horizontales, objetivos de
menos de 40 px, campos de menos de 16 px, tablas sin scroll, textos de menos de 12 px y subpáginas sin «Volver».
Lo que queda señalado a propósito: etiquetas de 10-11 px de la barra inferior de la tienda y de las cabeceras
de tabla, y la vista previa del tema (contenido a escala).

## Sin probar

Un iPhone y un Android de verdad: todo esto se midió en Chromium a 390 px con táctil emulado.
