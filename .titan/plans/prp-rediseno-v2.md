# PRP-R: Rediseño v2 — tienda, admin, APKs y landing

> **Estado**: APROBADO por Roberto (2026-10-27), con las respuestas de «Preguntas para Roberto». En curso: R0
> **Fecha**: 2026-10-27
> **Proyecto**: Kshop
> **Fases**: R0–R7 + validación final (de `docs/design-v2/06-PLAN-MIGRACION.md`). Código de partida: commit `60f8a2e` (Fase 7 cerrada)
> **Especificación**: `docs/design-v2/` (README, 01–05, `codigo/`, `referencias/*.dc.html`). Este PRP no la repite: la
> ordena por fases, la contrasta con el código y la base de datos actuales, y lista lo que hay que decidir.

---

## Objetivo

Llevar Kshop al diseño v2: un sistema de temas ampliado y retrocompatible (12 colores, forma, sombras, mayúsculas),
una biblioteca de componentes de tienda compartida por la web y la APK de tienda, una portada con 13 tipos de sección,
el admin rediseñado (barra lateral agrupada en web, pestañas inferiores en Kshop Admin, editor de Apariencia con vista
previa real) y la landing de `kshop.fullkod.com`. Todo sin cambiar la RLS, el checkout por WhatsApp ni las reglas de
módulos.

## Por Qué

| Problema | Solución |
|----------|----------|
| La tienda es plana: un solo radio, 7 colores, tarjetas sin acciones; todas las tiendas se parecen | 12 colores, 4 radios por pieza, sombras, mayúsculas y un preset nuevo (`fresh`); tokens derivados en `themeStyle()` |
| La portada tiene 6 secciones casi iguales; el dueño no puede montar una portada que venda | 13 tipos: barra de anuncio, beneficios, banner doble, oferta con cuenta atrás, producto destacado, colecciones, opiniones… |
| La tarjeta de producto no deja comprar: hay que entrar a la ficha | Añadir rápido, favorito, % de descuento, puntos de color y «Pedir por WhatsApp» desde la tarjeta |
| En la cabecera el nombre de la tienda se monta encima del menú en algunos anchos | Cortes en 720 / 1180 / 1400, logo `flex-none`, menú `min-w-0 overflow-hidden` |
| En móvil y en la APK no hay navegación inferior; el carrito es solo una página | `BottomTabBar` y `CartDrawer` (panel en web, hoja inferior en móvil) |
| El admin es una lista plana de módulos; el editor de tema no enseña cómo queda | Barra lateral por grupos, Inicio con KPIs y «Por hacer», Apariencia con vista previa real Web/Móvil |
| La landing de la plataforma es un titular sin más | Landing de venta: funciones, temas en vivo, pasos, precios leídos de `plans` y contacto |

**Valor de negocio**: la apariencia es lo primero que juzga un comerciante al probar Kshop (y está fuera del Base:
empuja al Pro). Una portada y una tarjeta que venden mejor son el argumento frente a Plaza Cubana/VendeYa, y la
landing es el primer punto de venta antes de migrar klauShop.

## Qué

### Criterios de Éxito
- [ ] **Retrocompatible**: las tiendas existentes (Tienda Demo incluida) se ven igual de color tras R0; el único cambio
  visible son los radios por pieza. Un tema v1 guardado se lee sin migrar datos.
- [ ] **Sin colores fijos en la tienda**: en `packages/storefront` solo variables del tema o clases del `@theme`
  (excepciones: `--wa` y los hex reales de variante). Comprobable con un `grep` de `#[0-9a-fA-F]{3,6}` y `bg-[#` en el
  paquete (se añade como test o regla de lint si es barato).
- [ ] **Nada se monta** en la cabecera a 1280, 1180, 1000, 720 y 390 con los 6 presets (capturas).
- [ ] La Tienda Demo con las **13 secciones** se ve como `TiendaPortada.dc.html` a 1280 y 390 con los 6 presets.
- [ ] Ficha, carrito (`CartDrawer` + `/cart`) y tarjeta según `TiendaFicha.dc.html` y `ProductCard.dc.html`; añadir
  rápido con selector de variante funciona.
- [ ] Admin web con barra lateral agrupada, Inicio nuevo y editor de Apariencia con vista previa real; Kshop Admin con
  pestañas inferiores y tarjetas de pedido. Los módulos bloqueados se ven con **PRO**; el empleado ve solo lo suyo.
- [ ] Landing según `Plataforma Landing.dc.html`, precios leídos de `plans`.
- [ ] Accesibilidad: zonas táctiles ≥ 44 px en móvil, contraste AA avisado por `themeContrastIssues()` (6 parejas),
  foco visible (`--ring`), `prefers-reduced-motion` respetado.
- [ ] Rendimiento: listado con CLS 0 (Lighthouse), las fuentes siguen cargándose solo las del tema.
- [ ] `pnpm typecheck`, `lint`, `test`, `build`, `test:rls` en verde; `e2e:orders`, `e2e:discounts`, `qa:orders`,
  `qa:apps`, `qa:pro` en verde; capturas 1280 y 390 de cada fase en `.titan/qa/rediseno-v2/`.

### Comportamiento Esperado (Happy Path)

**Dueño de tienda (plan Pro)**
1. Entra al admin: barra lateral por grupos (Ventas, Catálogo, Tienda, Negocio), Inicio con «Vendido hoy», cobrado,
   por cobrar, pedidos de hoy, ventas de la semana, «Por hacer» y últimos pedidos.
2. Apariencia › Tema: elige el preset `fresh`, cambia el color de oferta, pone botones píldora y títulos en mayúsculas;
   la vista previa (componentes reales de `@kshop/storefront`) cambia al momento en Web y Móvil; el pie avisa si una
   pareja no tiene contraste. Guarda.
3. Apariencia › Portada: añade una barra de anuncio, beneficios, una oferta con cuenta atrás que termina el domingo y
   un producto destacado. Guarda; la portada pública se invalida como hoy (Cache Components).

**Clienta (web a 1280 o APK a 390)**
1. Ve la barra de anuncio, la cabecera sin solapes y la portada nueva; la cuenta atrás corre y la sección desaparece
   al llegar a 0.
2. En una tarjeta pulsa «Añadir»: si hay variantes elige talla en un popover (web) u hoja inferior (móvil); se abre el
   `CartDrawer` (web) o sale el toast con el contador (móvil). Marca un favorito (queda en el dispositivo).
3. Ficha: galería, precio con equivalencia en otras monedas, talla/color, stock, «Añadir al carrito» y «Pedir por
   WhatsApp»; en móvil, barra de compra fija.
4. Carrito: barra de envío gratis (si la tienda tiene umbral), cupón, total y «Finalizar pedido por WhatsApp»: el mismo
   checkout de hoy.

**Visitante de kshop.fullkod.com**
1. Landing con hero, funciones, selector de temas que repinta la portada real, tres pasos, precios Base/Pro y CTA de
   contacto por WhatsApp.

---

## Contexto

### Referencias
- `docs/design-v2/README.md` (mapa prototipo → archivo), `01-TOKENS.md` … `05-LANDING.md`, `06-PLAN-MIGRACION.md`.
- `docs/design-v2/codigo/` — `theme.ts`, `theme-style.ts`, `styles.css` (ui y storefront) para sustituir casi tal cual;
  `content.additions.ts` con los esquemas Zod de los 7 tipos nuevos.
- `docs/design-v2/referencias/*.dc.html` — prototipos (abrir en Chrome con `support.js`); **referencia visual, no código**.
- Memoria: `decisiones.md` (17: **el MLC no existe**; signup cerrado, alta de tiendas por el superadmin),
  `2026-10-25-fase-2-tienda-publica.md` (Cache Components, invalidación), `2026-10-27-fase-7-apps.md` (apps),
  `modulos-y-planes.md` (Apariencia fuera del Base), `2026-10-25-estudio-precios-cuba.md` (textos de precios),
  `reference/trucos-entorno-y-next.md`.
- Código actual (commit `60f8a2e`):
  - `packages/core/src/storefront/theme.ts` — `THEME_RADII` es `Record<radius, string>`; usos: `packages/storefront/src/theme-style.ts:37`
    y `apps/web/src/features/themes/components/ThemeEditor.tsx:145` (solo `Object.keys`). Tests en
    `packages/core/src/storefront/storefront.test.ts`.
  - `packages/storefront/src/components/*` — 44 usos de `rounded-[var(--sf-radius)]` a revisar en R0. `.sf-root` ya existe
    en `packages/storefront/src/styles.css`.
  - `packages/data/src/storefront-reads.ts:158` — `ProductCardData` (hoy `badge` es «-20 %»/«Oferta»; `products.badge`
    no llega a la tarjeta). `HomeSection` en la línea 441.
  - `packages/core/src/storefront/content.ts` — `HOME_SECTION_TYPES` (6) y `homeSectionInputSchema`.
  - `apps/web/src/features/themes/components/{ThemeEditor,SectionsEditor,AppearancePage,BannersEditor}.tsx`.
  - `apps/web/src/app/s/[storeSlug]/admin/AdminShell.tsx` (179 líneas, lista plana de `ADMIN_MODULES` + Equipo y Plan),
    `apps/web/src/features/registry.ts` y `features/types.ts` (`AdminModule` sin `group`).
  - `apps/admin-app/src/App.tsx` — **shell propio** de 548 líneas (no reutiliza `AdminShell`); comparte `@kshop/admin`
    (`orders/`, `catalog/`, `SalesTodayCard`).
  - `apps/store-app/src/{App,pages}.tsx` — ya usa `@kshop/storefront`: lo que cambie en el paquete llega a la APK.
  - `apps/web/src/app/(platform)/page.tsx` — landing actual de 24 líneas.
  - Pedido manual ya existe (`POST /api/v1/stores/{id}/orders`, decisión 23) → el botón «Nuevo pedido» del topbar tiene destino.
  - Clientes ya existe dentro de Pedidos (`features/orders/components/CustomersPage.tsx`).
- Skills: `tf-supabase` (migración del enum y test de aislamiento), `tf-playwright-cli` (capturas), `tf-bucle-agentico`.

### Lo que el prototipo pide y la base de datos ya tiene / no tiene

| Dato del prototipo | Estado actual | Propuesta |
|---|---|---|
| 7 tipos de sección nuevos | `home_sections.type` es el **enum** `public.home_section_type` | Migración `alter type … add value` × 7 (R5) + test de aislamiento como el resto |
| `eyebrow` en secciones | `home_sections.settings` (jsonb) | En `settings` (Zod), sin columna nueva |
| `eyebrow` y `productId` del banner (hero) | `banners` no tiene esas columnas | Migración: `banners.eyebrow text check (≤ 40)` y `banners.product_id uuid` con FK compuesta `(store_id, product_id)` → `products` `on delete set null` (R5) |
| Imagen de colección y de categoría | `collections.image_url` y `categories.image_url` **existen**, pero el admin no las edita | Subida de imagen en los formularios de categoría y colección (R5), mismo flujo WebP de `lib/images.ts`; sin migración |
| Nº de productos por categoría/colección | No se lee | Contarlo en la consulta de portada (pg_graphql `totalCount` o función SQL si sale caro) |
| Umbral de envío gratis (`CartDrawer`) | `shipping_methods.free_over_subtotal` **existe**, por método y zona | Ver D4 |
| «Recíbelo mañana en La Habana» | `shipping_methods.min_days/max_days` existen | Derivarlo del método más rápido («Recíbelo en 1–2 días»); sin texto libre nuevo |
| Puntos de color (`swatches`) | `attribute_values.value` guarda el hex | `ProductCardData.swatches` desde los valores de color de las variantes publicadas (R3) |
| `discountPercent`, `variantCount` | Se calculan con los datos que ya se leen | En el mapeo de `storefront-reads.ts` (R3) |
| Badge «Más vendido»/«Nuevo» | `products.badge` existe y no llega a la tarjeta | Llevarlo a `ProductCardData` (R3) |
| Favoritos | No existe | Ver D3 |
| Valoraciones (estrellas + «38 opiniones») en ficha y producto destacado | **No hay tabla de reseñas** | Ver D5 |
| Opiniones de la portada (`testimonials`) | — | Las escribe el dueño en `settings` (como dice la especificación) |
| «Guía de tallas» | No existe | No se muestra en v2 (sin campo) |
| Talla agotada «clicable para avisar» | No hay avisos de reposición | Ver D6 |
| Admin: búsqueda global «Ctrl K», campana, comparativa «vs ayer», segmentado Hoy·7 días·Mes | No existen | Ver D7 |
| «MLC» en la ficha, el pie y la landing | **El MLC no existe** (decisión 17) | Se usa la lista real de monedas activas de la tienda (CUP, USD, EUR) |
| CTA «Crear mi tienda» / «Prueba 30 días gratis» / «Entrar» en la landing | El signup está cerrado: el superadmin crea las tiendas | Ver D8 |

### Decisiones técnicas propuestas (Roberto confirma o cambia)

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D1 | **Iconos** | Añadir **`lucide-react`** a `packages/ui` (tree-shaking, mismos trazos que el prototipo) | SVG a mano en `packages/ui/src/icons.tsx` (~45 iconos, sin dependencia) |
| D2 | **Código de `codigo/`** | Sustituir `theme.ts`, `theme-style.ts` y los dos `styles.css` tal cual y ajustar solo lo que no compile; los esquemas de `content.additions.ts` se integran en `content.ts` | Reescribirlos a mano (más riesgo de desviarse de los prototipos) |
| D3 | **Favoritos** | v1 en **`localStorage`** por tienda (`kshop:fav:{storeId}`), también en la APK (WebView); página `/favorites` que pide las tarjetas por id. Sin BD | Tabla `customer_favorites` con RLS (solo con sesión; más trabajo y tests) |
| D4 | **Barra de envío gratis** | Se muestra si **algún método activo** tiene `free_over_subtotal`; usa el **menor** umbral y dice «envío gratis desde X en {método}». El cálculo real sigue en el checkout SQL | Campo nuevo de tienda `free_shipping_threshold` (dato duplicado con los métodos) |
| D5 | **Valoraciones** | **No se muestran** en ficha ni en producto destacado hasta que exista un módulo de reseñas (no se inventan cifras). En `testimonials` sí, porque las escribe el dueño | Mostrar estrellas desde `settings` del producto (datos inventados por el dueño en la ficha: poco honesto) |
| D6 | **Talla agotada** | Se ve tachada y discontinua, **no seleccionable** para añadir; al pulsarla ofrece «Preguntar por WhatsApp» (mensaje con la talla) | Avisos de reposición (tabla nueva + avisos: otra fase) |
| D7 | **Extras del admin sin backend** | v2 incluye: topbar con «Ver tienda», botón contextual y campana que **lleva a pedidos por confirmar** (punto si hay alguno). **Fuera de v2**: búsqueda global Ctrl K, variación «vs ayer» y segmentado Hoy·7 días·Mes, salvo que `sales-today` ya dé los datos (se mira en R6 y se decide allí) | Construirlos ahora (endpoints nuevos) |
| D8 | **CTAs de la landing** | «Crear mi tienda» / «Prueba 30 días gratis» / «Hablar con Kshop» abren **WhatsApp de la plataforma** con un mensaje prellenado; «Entrar» lleva a una página corta que pide el subdominio de la tienda (o se quita) | Formulario de solicitud que crea un lead (tabla nueva) o signup abierto (contradice la decisión de alta por el superadmin) |
| D9 | **Kshop Admin (APK)** | Rediseñar el **shell propio** de `apps/admin-app` (pestañas Inicio · Pedidos · Productos · Ventas · Más) y las tarjetas de pedido en `@kshop/admin/orders/OrderList.tsx`; «Más» lista los módulos y abre el panel web para lo que no está en la app (como hoy). No se fusiona con `AdminShell` | Un único shell responsive para web y APK (refactor grande del admin web) |
| D10 | **Cuenta atrás** | `offer_countdown` exige `ends_at` (columna existente de `home_sections`); el servidor ya filtra por fecha y el cliente oculta al cruzar 0. La caché de la portada se etiqueta con la próxima expiración (`cacheLife`) para que no sirva la sección vencida | Solo ocultar en cliente (SSR seguiría pintándola hasta invalidar) |
| D11 | **Secciones por defecto** | Al crear una tienda (alta del superadmin) se insertan hero_slider, benefits, category_grid, product_carousel (novedades), banner_mosaic y rich_text **ocultas o con contenido de ejemplo** (ver pregunta 4). `pnpm demo:seed` monta las 13 en la Tienda Demo | Portada vacía como hoy |
| D12 | **Página de muestras** | `/admin/_ui` solo en desarrollo (R1) para comparar con `Tienda Biblioteca.dc.html`; se usa también para las capturas de R1 | Sin página (capturas solo en las pantallas reales) |

### Modelo de Datos (cambios mínimos, R5)

```sql
-- 7 tipos nuevos de sección (no se puede usar el valor nuevo en la misma transacción que lo añade)
alter type public.home_section_type add value if not exists 'announcement_bar';
alter type public.home_section_type add value if not exists 'benefits';
alter type public.home_section_type add value if not exists 'banner_mosaic';
alter type public.home_section_type add value if not exists 'offer_countdown';
alter type public.home_section_type add value if not exists 'featured_product';
alter type public.home_section_type add value if not exists 'collection_cards';
alter type public.home_section_type add value if not exists 'testimonials';

-- Hero: antetítulo y mini producto enlazado
alter table public.banners
  add column eyebrow text check (char_length(eyebrow) <= 40),
  add column product_id uuid,
  add foreign key (store_id, product_id) references public.products (store_id, id) on delete set null (product_id);
create index banners_product_idx on public.banners (store_id, product_id) where product_id is not null;
```
Sin tablas nuevas: la RLS de `home_sections` y `banners` no cambia. Test de aislamiento: una sección `featured_product`
o un banner de la tienda A no puede apuntar a un producto de B (la FK compuesta lo impide) y B no lee las secciones de A.
Tras la migración: `pnpm test:rls`, `pnpm db:graphql-schema && pnpm codegen`.

---

## Blueprint (Assembly Line)

> Solo fases. Las subtareas se generan al entrar en cada una con `tf-bucle-agentico` (mapear contexto → subtareas →
> ejecutar). Una fase = un commit (o varios pequeños), con capturas 1280 y 390 en `.titan/qa/rediseno-v2/R{n}/`.
> Orden: R0 → R1 → (R2, R3) → R4 → R5 → R6 → R7. R6 puede adelantarse justo después de R1.

### Fase R0: Tokens y tema
**Objetivo**: sistema de temas v2 en `@kshop/core` y `@kshop/storefront` (12 colores, 4 radios, sombras, mayúsculas,
`isDark` por luminancia, `readableOn`, 6 parejas de contraste, preset `fresh`), `styles.css` nuevos y los 44 radios de
la tienda pasados a `rounded-sf-*` según `01-TOKENS.md` §5. El `ThemeEditor` actual sigue compilando (su rediseño es R6).
**Validación**: tests ampliados en `storefront.test.ts` (tema v1 → campos del preset, `isDark`, 6 parejas,
`readableOn("#FF7A93") === "#111111"`); capturas antes/después de la Tienda Demo con el mismo color; typecheck, lint,
test y build en verde.
**Hecha (2026-10-27)**: `codigo/` copiado (comentarios pasados a inglés); 44 radios a `rounded-sf-*` pieza a pieza
(botones/campos/chips `sf-btn`, tarjetas/fotos/cajas `sf`, miniaturas `sf-sm`, banner `sf-lg`); fuera los dos colores
fijos de la tienda (`bg-[#25D366]` → `bg-whatsapp`, degradado `from-black/60 text-white` → `from-scrim
text-ink-foreground`); `ThemeEditor` mínimo con los 12 colores, 6 presets y botones/sombras/mayúsculas (el rediseño es
R6); `docs/design-v2/referencias/**` fuera del lint. Evidencia en `.titan/qa/rediseno-v2/R0/` (antes/después a 1280 y
390: mismas variables de color, solo cambian radios; menú móvil y hoja de filtros fijos siguen pegados al viewport;
Apariencia con el preset Fresco sin guardar). 69 tests, typecheck, lint y build en verde.

### Fase R1: Átomos
**Objetivo**: `packages/ui/src/components.tsx` con Button (`secondary`, `whatsapp`, `whatsappOutline`, `inverse`,
tamaño `icon`), Badge (`sale`, `secondary`, `warning`), Input con foco y error, Tabs/Segmented y Chip; iconos según D1;
página de muestras según D12.
**Validación**: la página de muestras se parece a §02 de `Tienda Biblioteca.dc.html` con 2–3 presets (capturas); el
admin sigue igual (los átomos del admin no cambian de aspecto salvo lo pedido); typecheck, lint, test.

### Fase R2: Cabecera, pie y navegación móvil
**Objetivo**: `StoreHeader` (sin solapes, cortes 720/1180/1400, «Ofertas», buscador y chips en móvil), `StoreFooter`,
`AnnouncementBar` y `BottomTabBar` (oculta ≥ 720 y en la ficha; `fixed` con `safe-area-inset-bottom` en la APK), con
favoritos según D3. Hasta R5 la barra de anuncio se alimenta de una sección `announcement_bar` si existe (el tipo llega
en R5; en R2 solo el componente).
**Validación**: capturas a 1280, 1180, 1000, 720 y 390 sin solapes; la APK (Vite 5173 en Chromium a 390) con la barra
fija; buscador, «sin conexión» y «versión nueva» siguen funcionando (`qa:apps`).

### Fase R3: ProductCard, listados y carrito
**Objetivo**: `ProductCard` `grid`/`row`/`compact` (favorito, -%, añadir rápido con selector de variante, puntos de
color, WhatsApp, badge del producto), `ProductCardData` ampliado (`discountPercent`, `swatches`, `variantCount`,
`badge` del producto) con su consulta pg_graphql y codegen, `CartDrawer` (panel/hoja) y `CartView` con los mismos
bloques; barra de envío gratis según D4; toast «Añadido al carrito».
**Validación**: `e2e:orders` y `e2e:discounts` en verde (añadir rápido incluido); `qa:orders` en verde; Lighthouse del
listado con CLS 0; capturas de listado, drawer y hoja.

### Fase R4: Ficha de producto
**Objetivo**: `ProductView` según `02` y `TiendaFicha.dc.html`: galería (vertical web, horizontal móvil), caja de precio
con equivalencia en las monedas activas (sin MLC), variantes con D6, stock («quedan N» si ≤ 5), CTA + WhatsApp,
beneficios, acordeón (descripción, envío desde `shipping_methods`), relacionados y barra de compra fija en móvil;
valoraciones según D5. Piezas reutilizables para `featured_product`.
**Validación**: capturas 1280/390 con 2 presets; `qa:orders` en verde (compra desde la ficha); `prefers-reduced-motion`.

### Fase R5: Portada
**Objetivo**: migración del «Modelo de Datos» + test de aislamiento; `content.ts` con los 7 tipos y `eyebrow`;
`HomeSections` con los 6 tipos rediseñados y los 7 nuevos, `Countdown` (cliente) y caché según D10; `SectionsEditor` con
los formularios nuevos; imagen en categorías y colecciones; secciones por defecto según D11; `demo:seed` con las 13.
**Validación**: `test:rls`, `db:graphql-schema && codegen`; la Tienda Demo con las 13 secciones como
`TiendaPortada.dc.html` a 1280 y 390 con los **6 presets** (capturas por preset); la cuenta atrás oculta la sección al
vencer; editar una sección invalida la portada.

### Fase R6: Admin
**Objetivo**: `group` en `AdminModule` y el registro; `AdminShell` con barra lateral agrupada, selector de tienda,
PRO con candado, tarjeta de usuario y topbar (D7); Inicio con KPIs, ventas de la semana, «Por hacer» y últimos pedidos
(«Tu plan incluye» pasa a Plan y facturación); `ThemeEditor` con presets visuales, 12 colores por grupos, letra y forma,
vista previa real Web/Móvil (envuelta en `div.sf-root`) y estado de contraste; Kshop Admin según D9.
**Validación**: `qa:apps`, `qa:orders` y `qa:pro` en verde; módulos bloqueados con PRO; el empleado ve solo lo suyo y
no ve costos (como en la Fase 7); capturas de admin web 1280 y Kshop Admin 390.

### Fase R7: Landing
**Objetivo**: `(platform)/page.tsx` según `05-LANDING.md`: hero con teléfono, funciones (sin MLC), temas con la portada
real a escala y selector de preset, pasos, precios leídos de `plans` (Base y Pro, sueltos y fundadores con los textos
del estudio de precios), CTA final y pie con «Acceso Fullkod»; CTAs según D8.
**Validación**: capturas 1280 y 390; cambiar el precio de un plan en BD cambia la landing; Lighthouse de la landing
(rendimiento y accesibilidad ≥ 90).

### Fase Final: Validación
**Objetivo**: todo el rediseño funcionando de punta a punta en web y APKs.
**Validación**:
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:rls` en verde
- [ ] `e2e:orders`, `e2e:discounts`, `e2e:catalog`, `qa:orders`, `qa:discounts`, `qa:apps`, `qa:pro` en verde
- [ ] Sin hex fijos en `packages/storefront` (salvo `--wa` y swatches)
- [ ] Capturas 1280/390 de cada fase en `.titan/qa/rediseno-v2/`
- [ ] Criterios de éxito cumplidos; memoria `project/2026-10-xx-rediseno-v2.md` enlazada en `MEMORY.md`;
  fila del rediseño en la tabla de `arranque-y-fases.md`
- [ ] APK de la Tienda Demo y Kshop Admin recompiladas por el workflow (solo con permiso de Roberto: es GitHub Actions)

---

## Preguntas para Roberto

1. **Iconos (D1)**: ¿añado `lucide-react` o prefieres SVG a mano?
2. **Favoritos (D3)**: ¿`localStorage` en v1 está bien?
3. **Valoraciones (D5)**: ¿las quitamos de ficha y producto destacado hasta tener reseñas reales?
4. **Portada de una tienda nueva (D11)**: ¿las 6 secciones por defecto se crean **visibles con textos de ejemplo**
   (beneficios típicos, texto de bienvenida) u **ocultas** para que el dueño las active?
5. **Landing (D8)**: ¿los CTAs van a WhatsApp de la plataforma? ¿Qué número (el de los avisos OpenWA u otro)? ¿Quito
   «Entrar» o hago la página que pide el subdominio?
6. **Orden respecto a la Fase 8** (migrar klauShop): ¿el rediseño va antes? (Propuesta: sí, así klauShop entra ya con
   el tema v2.)
7. **Commit de `docs/design-v2/`**: hoy está sin seguimiento en git; ¿lo versiono junto con este PRP (pesa poco salvo
   las capturas de `ui-actual/`)?

### Respuestas de Roberto (2026-10-27)
1. **D1**: sí, `lucide-react` (se añade en R1).
2. **D3**: los favoritos se guardan **en el sitio** (BD), no en `localStorage`. Tabla `customer_favorites`
   (`store_id`, `customer_id`, `product_id`, PK compuesta, FKs compuestas por tienda, RLS: el cliente solo ve y
   escribe los suyos y solo con el `store_id` de su JWT) + test de aislamiento + endpoints `/api/v1` (sirven también
   a la APK). Sin sesión, el corazón lleva a entrar/crear cuenta. Migración en R3 (donde nace el corazón de la tarjeta);
   la página de favoritos y el icono de la cabecera en R2/R3.
3. **D5**: sí, se quitan las estrellas de ficha y producto destacado.
4. **D11**: las secciones por defecto de una tienda nueva se crean **ocultas**.
5. **D8**: los CTAs de la landing abren WhatsApp con el **número del superadmin**; se **quita «Entrar»**.
6. El rediseño va **antes** de la Fase 8.
7. `docs/design-v2/` se versiona junto con este PRP.

---

## 🧠 Aprendizajes (Self-Annealing)

> Crece con cada error encontrado durante la implementación.

- **R0 — `git stash pop` deja CRLF** (con `core.autocrlf=true`) y Prettier marca los archivos: pasar `prettier --write`
  (y `pnpm codegen`) después. Para capturas «antes/después» con el dev corriendo, el stash funciona (HMR recompila).
- **R0 — `container-type: inline-size` en `.sf-root`** no rompe los `position: fixed` de la tienda (menú móvil, hoja
  de filtros): comprobado a 390 tras hacer scroll.
- **Aviso de Next en dev ajeno al rediseño**: «Could not validate that a segment in your UI has instant navigation» en
  `/admin` (`admin/page.tsx`) y `/admin/themes` (`themes/layout.tsx`). No rompe nada; revisar en R6 (admin).

---

## Gotchas

- [ ] `THEME_RADII` pasa de string a objeto `{sm,md,lg,btn}`: único cambio de API que rompe (2 usos, R0).
- [ ] `alter type … add value` no se puede usar en la misma transacción en que se añade el valor: la migración que lo
  añade no puede insertar secciones de ese tipo (las secciones por defecto/seed van aparte).
- [ ] `cqw` necesita que `.sf-root` sea contenedor: cualquier componente de tienda fuera de la tienda (vista previa del
  admin, landing) va envuelto en `div.sf-root` con `themeStyle()`.
- [ ] Cache Components: la cuenta atrás y las secciones con fechas necesitan `cacheLife`/etiquetas para no servir una
  sección vencida (D10). Revisar `2026-10-25-fase-2-tienda-publica.md`.
- [ ] Después de `prettier --write` hay que volver a correr `pnpm codegen` (GraphQL embebido).
- [ ] La APK de tienda usa el mismo paquete: `BottomTabBar` y `CartDrawer` con el teclado abierto y el safe area en
  Capacitor; `localStorage` funciona en la WebView pero se borra si el usuario limpia datos.
- [ ] El MLC aparece en los textos del prototipo: no existe (decisión 17).
- [ ] Apariencia sigue detrás del módulo `themes` (fuera del Base): el editor nuevo respeta las tres capas.
- [ ] Contraste: avisa, no bloquea (como hoy).

## Anti-Patrones

- NO copiar el HTML de `referencias/*.dc.html`: recrear con los componentes y patrones del repo.
- NO poner hex fijos en componentes de tienda; el admin sí usa la marca Kshop fija.
- NO inventar datos que no tienen campo (reseñas, guía de tallas, textos de entrega): proponer o derivar.
- NO añadir dependencias sin permiso (solo `lucide-react` está propuesta).
- NO mover lógica a Server Actions ni importar `next/*` en `packages/*`.
- NO tocar RLS ni el checkout por WhatsApp.
- NO push, deploy ni ejecutar el workflow de Android sin permiso.

---

*PRP pendiente de aprobación. No se ha modificado código.*
