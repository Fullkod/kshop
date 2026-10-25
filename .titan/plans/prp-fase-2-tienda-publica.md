# PRP-2: Tienda pública de Kshop

> **Estado**: APROBADO (2026-10-25) — Roberto: D13 sí (WhatsApp aún no se puede probar de punta a punta), D1 sí (Cache Components), D10 cambiada (URLs en inglés), Lighthouse: cuanto más alto mejor (los umbrales son el mínimo). Resto de D tal cual.
> **Fecha**: 2026-10-25
> **Proyecto**: Kshop
> **Fase**: 2 (ver `arranque-y-fases.md`). Código de partida: commit `0684e23` (Fase 1 cerrada)

---

## Objetivo

Que cada tienda tenga en `{slug}.kshop.fullkod.com` una tienda pública rápida, con SEO y pensada para el
móvil: portada armada por secciones, listados con filtros, búsqueda, ficha de producto, menús, páginas
estáticas y su propio tema (colores, fuente, logo). Todo editable desde el admin («Apariencia»), con las
lecturas cacheadas por tienda y aislamiento entre tiendas probado con tests.

## Por Qué

| Problema | Solución |
|----------|----------|
| El catálogo de la Fase 1 no lo ve ningún cliente: la home es un «Muy pronto» | Storefront SSR por tienda que pinta el catálogo publicado (decisiones 7 y 10) |
| En Cuba la red es lenta y cara: cada KB y cada petición cuentan | Server Components + caché por tienda (`store:{id}:catalog` / `store:{id}:content`), columnas desnormalizadas de la Fase 1, imágenes WebP de tamaño fijo, poco JS en el cliente |
| Cada tienda quiere verse distinta sin que Fullkod escriba código por tienda | Temas por **tokens** (preset + colores, fuente, radios, logo, favicon) y contenido dinámico estilo Saleor/apululu: secciones de portada, banners programables, menús, páginas (decisión 10) |
| Buscar «vestido rojo talla M» en un catálogo con variantes es incómodo con pg_graphql | Funciones SQL de búsqueda y filtros facetados sobre atributos (`filterable_in_storefront`), precio, marca, stock — como se previó en `lecturas-graphql-y-rls.md` |
| Las colecciones de la Fase 1 son solo manuales | Colecciones **automáticas** por reglas (D11 de la Fase 1, aplazado aquí): categoría, marca, etiqueta, en oferta, novedades |
| La app Capacitor (Fase 7) tendrá que leer lo mismo | Lecturas públicas en `@kshop/data` sin `next/*`; la web solo añade la caché |

**Valor de negocio**: es lo que la tienda enseña a sus clientes y lo primero que Fullkod enseña al vender
Kshop. Con la Fase 3 (carrito + WhatsApp) se convierte en ventas. El módulo `themes` está en el plan Base.

## Qué

### Criterios de Éxito
- [ ] `pnpm db:migrate` aplica las migraciones de contenido y lectura pública sin errores; advisors sin avisos nuevos.
- [ ] `pnpm test:rls` en verde con la suite nueva `03_storefront_isolation`: anon ve solo secciones, banners, menús y páginas **visibles, publicados y dentro de fechas** de tiendas activas; nada de tiendas suspendidas; el staff de A no lee borradores ni escribe nada de B; las funciones de búsqueda/facetas nunca devuelven borradores, productos de otra tienda ni el costo.
- [ ] En `demo.kshop.localhost:3000` (build de producción) un visitante en móvil: ve la portada con slider, carrusel «Novedades», rejilla de categorías y franja de marcas; entra en Mujer › Vestidos, filtra Talla M + Color Rojo + rango de precio, ordena por precio; busca «vestido» (también «nandu» sin tilde); abre la ficha, cambia de variante y ve precio, imagen y disponibilidad de esa variante; navega por el menú y abre «Envíos» (página estática).
- [ ] Desde `/admin/themes` el dueño cambia preset, color principal, fuente y logo; reordena secciones, programa un banner con fechas, edita el menú y crea una página; los cambios se ven en la tienda pública en ≤ 5 s sin redeploy.
- [ ] Lecturas cacheadas por tienda: una segunda visita a la portada/listado/ficha no hace peticiones a Supabase (comprobado en logs del servidor); editar un producto o el contenido invalida solo la caché de **esa** tienda.
- [ ] Lighthouse (móvil, build de producción, Tienda Demo) en portada, listado y ficha: Rendimiento ≥ 90, Accesibilidad ≥ 95, Buenas prácticas ≥ 95, SEO ≥ 95 como mínimo (Roberto: «mientras más rendimiento mejor»; apuntar a 100). `sitemap.xml` y `robots.txt` por host; ficha con JSON-LD `Product`.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm build` pasan; E2E Playwright del happy path con capturas en `.titan/qa/fase-2/` (móvil 390 px y escritorio).

### Comportamiento Esperado (Happy Path)

1. Un cliente abre `demo.kshop.fullkod.com` en el móvil. La cabecera muestra el logo y el menú de la
   tienda (hamburguesa en móvil), buscador y selector de moneda si la tienda vende en varias (`multi_currency`).
   Colores y fuente son los del tema de la tienda.
2. **Portada** (por secciones ordenadas desde el admin): slider de banners (imagen móvil/escritorio, enlace a
   colección), carrusel «Novedades» (colección automática: últimos 30 días), rejilla de categorías, franja de
   marcas, texto libre. Una sección o banner fuera de fechas no aparece. Si la tienda no configuró nada,
   se ve una portada por defecto (categorías + últimos productos).
3. **Listado** `/category/vestidos` (también `/collection/…`, `/brand/…`, `/products`): tarjetas con
   imagen, nombre, precio «desde», precio tachado y «Agotado»; filtros (subcategorías, marca, atributos
   filtrables como Talla/Color con swatches, rango de precio, solo disponibles) en un panel lateral en
   escritorio y en una hoja inferior en móvil; orden (novedades, precio ↑↓, nombre); paginación. El estado
   vive en la URL (`?talla=m&color=rojo&price=…`; las claves de atributo son sus slugs, que son datos de la tienda), así que se puede compartir y lo indexa Google.
4. **Búsqueda** `/search?q=vestido`: por nombre, descripción, SKU, marca y categoría, sin distinguir tildes
   ni mayúsculas, con los mismos filtros.
5. **Ficha** `/product/vestido-nandu`: galería (las fotos de la variante elegida primero), nombre, marca,
   precio y precio tachado, selector de variante (botones por talla, swatches por color; combinaciones sin
   stock deshabilitadas), disponibilidad, atributos visibles, descripción, productos relacionados (misma
   categoría). La acción de compra de esta fase es **«Pedir por WhatsApp»** (ver D13); en la Fase 3 pasa a
   «Añadir al carrito».
6. **Páginas** `/page/envios`, `/page/sobre-nosotros`; el pie muestra el menú de pie, WhatsApp y «Tienda creada con Kshop».
7. El dueño, en `/admin/themes` (**Apariencia**): pestañas Tema · Portada · Banners · Menús · Páginas. Elige
   preset, ajusta tokens con vista previa y aviso de contraste, sube logo y favicon; añade/ordena/oculta
   secciones; programa banners; arma menús (categoría, colección, marca, página o URL; dos niveles); escribe
   páginas. En **Catálogo › Colecciones** puede marcar una colección como automática y definir sus reglas.
8. Al guardar, la API invalida `store:{id}:content` (o `store:{id}:catalog`) y la tienda pública se actualiza.

---

## Contexto

### Referencias
- `.titan/memory/project/modelo-de-datos.md` §10 (temas, `home_sections`, `banners`, `menus`/`menu_items`, `pages`, colecciones automáticas) y §3–§4 (catálogo, monedas).
- `.titan/memory/project/decisiones.md` — 7 (pg_graphql + RLS, velocidad), 10 (temas = tokens + contenido dinámico, sin CSS libre), 4/17 (monedas), 16 (`themes` en Base).
- `.titan/memory/project/lecturas-graphql-y-rls.md` — caché por tienda, desnormalizado, filtros por función SQL, catálogo público por `status = 'published'`.
- `.titan/memory/project/2026-10-25-fase-1-catalogo.md` y `.titan/plans/prp-fase-1-catalogo.md` (D10–D13, Aprendizajes).
- Código actual (commit `0684e23`):
  - `apps/web/src/proxy.ts` — host → `/s/{slug}/…`; el `matcher` **excluye rutas con extensión** (afecta a `sitemap.xml`/`robots.txt`).
  - `apps/web/src/app/s/[storeSlug]/{layout.tsx,(front)/layout.tsx,(front)/page.tsx}` — layout de tienda, aviso de suspendida, home provisional.
  - `apps/web/src/server/stores.ts` — `getStoreBySlug` con `unstable_cache` + tag `store:{slug}` (en Next 16 `unstable_cache` está reemplazado por `use cache`).
  - `apps/web/src/server/catalog/access.ts` — `catalogCacheTag(storeId)` + `revalidateTag(…, "max")` en cada escritura del catálogo.
  - `supabase/migrations/20261025100000_catalog_schema.sql` — políticas públicas (`private.store_is_public`, `product_is_public`), grants por columna de `products` (`search_vector` no público), `collections.rules jsonb` sin usar, `stock_available` por variante.
  - `supabase/migrations/20261025100300_admin_search_text_status.sql` — patrón de función de búsqueda expuesta por pg_graphql (`admin_search_products`).
  - `packages/core/src/catalog/pricing.ts` — `convertFromBase`, `formatMoney`; `packages/data/src/catalog-queries.ts` — consultas del admin.
  - `packages/ui/src/styles.css` — tokens de la marca Kshop como variables CSS (`--accent`, `--bg`…): el tema de tienda los sobrescribe.
  - `apps/web/src/features/themes/module.ts` — módulo «Apariencia» registrado con `availableInPhase: 2`.
  - `apps/web/node_modules/next/dist/docs/01-app/01-getting-started/{08-caching,09-revalidating}.md` — Cache Components, `use cache`, `cacheTag`, `cacheLife`.
- Referencias externas (**solo lectura**): apululu `storefront-clean` (menús, páginas, carrusel por atributos de página, `ProductListByCollection`), klauShop (tarjetas, ficha, slider, `featured`/`badge`), Saleor (`menu`, `page`, filtros por atributo).
- Skills: `tf-supabase`, `supabase`, `supabase-postgres-best-practices`, `tf-playwright-cli`.

### Decisiones técnicas propuestas (Roberto confirma o cambia)

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D1 | **Caché** | Activar **Cache Components** de Next 16 (`cacheComponents` + `partialPrefetching`) y usar `use cache` + `cacheTag('store:{id}:catalog' / ':content')` + `cacheLife` en las lecturas públicas; migrar `getStoreBySlug`. Es lo recomendado en Next 16 y da shell estático + streaming | Seguir con `unstable_cache` (funciona, pero está reemplazado y no da prerender parcial). Activarlo obliga a revisar el admin (lecturas fuera de `<Suspense>`) |
| D2 | **Dónde vive el tema** | Reusar `stores.theme jsonb` (ya existe y ya es público por grant) validado con Zod en `@kshop/core`: `{ preset, colors{accent, accentFg, bg, fg, surface, muted, line}, font, radius, faviconUrl, logoUrl? }`; `stores.logo_url` sigue siendo el logo. Se aplica como variables CSS en el layout de la tienda | Tabla `store_themes` aparte (como el borrador del modelo): una tabla y una RLS más sin ganar nada hoy |
| D3 | **Presets y fuentes** | 5 presets (Kshop, Clásico, Minimal, Cálido, Oscuro) y **6 fuentes** curadas cargadas con `next/font` de forma estática (next/font no admite fuentes elegidas en runtime); el tema elige por clave. Aviso de contraste WCAG AA en el editor (función en core) | Fuente libre de Google Fonts por URL (más flexible, peor rendimiento y privacidad) |
| D4 | **Secciones de portada** | Tabla `home_sections` con tipos MVP: `hero_slider`, `banner`, `product_carousel` (colección/categoría/marca), `category_grid`, `brand_strip`, `rich_text`. `settings jsonb` validado por tipo con Zod (discriminated union). Programables (`starts_at`/`ends_at`) | Incluir ya `image_grid` y bloques libres (más UI de admin) |
| D5 | **Banners** | Tabla `banners` (imagen escritorio + móvil, título, subtítulo, texto del botón, enlace tipado: producto/categoría/colección/marca/página/URL, fechas, orden). Imágenes al bucket `store-media` (`stores/{id}/banners/…`) con la compresión del navegador de la Fase 1 (tamaños 1920/768) | Banners como `settings` dentro de la sección (sin reutilizar entre secciones) |
| D6 | **Menús** | `menus` (`header`, `footer`, únicos por tienda) + `menu_items` (árbol de 2 niveles con `parent_id`, orden, destino tipado como en D5). Un ítem que apunte a algo no publicado no se pinta | Menú generado solo desde las categorías (sin admin) |
| D7 | **Páginas y texto enriquecido** | `pages` con `content` en **Markdown restringido** (títulos, negrita, cursiva, listas, enlaces; sin HTML) renderizado en el servidor con `react-markdown` sin `rehype-raw`. Se reusa para `rich_text` y, más adelante, para la descripción del producto | Tiptap/editor visual ya (más peso y más tiempo); o texto plano como la descripción de la Fase 1 |
| D8 | **Colecciones automáticas** | `collections.rules jsonb` (Zod en core): `{ categoryId?, brandId?, tags?, onSale?, newerThanDays?, featured?, inStock? , sort }`, resueltas por una función SQL en la lectura (sin materializar). Manual si `rules` es null | Materializar en `collection_products` por trigger (más rápido en lectura, más complejo y propenso a desincronizarse) |
| D9 | **Búsqueda y filtros** | Funciones SQL `security invoker` expuestas por pg_graphql: `storefront_search_products(store_id, q, category_id (subárbol por ltree), collection_id, brand_id, attribute value ids agrupados por atributo, min/max precio, in_stock, sort, limit, offset)` y `storefront_product_facets(…mismos filtros…)` → valores con conteo de los atributos `filterable_in_storefront`, marcas y rango de precio. Búsqueda por `search_vector` (`spanish` + `unaccent`) + `ilike` en SKU; índices nuevos donde haga falta (`variant_attribute_values (store_id, attribute_id, value_id)`) | Búsqueda con `pg_trgm` para errores tipográficos (se puede añadir después); o motor externo (Algolia/Meilisearch), descartado por coste |
| D10 | **Paginación y URLs** | **Cambiada por Roberto: código y URLs en inglés; solo el texto visible va en español.** `/products`, `/category/{slug}`, `/collection/{slug}`, `/brand/{slug}`, `/product/{slug}`, `/search`, `/page/{slug}`. Paginación por número (`?page=2`, enlaces reales para SEO), 24 por página; filtros en query params (`?talla=m,l&color=rojo&price=500-2000&sort=price-asc`; las claves de atributo son sus slugs). Las categorías hijas usan su propio slug (únicos por tienda) | URLs en inglés; o «cargar más» infinito (peor SEO y peor en la app) |
| D11 | **Monedas en la tienda** | Precios en la moneda base renderizados en el servidor (cacheable). Si la tienda tiene `multi_currency` y más de una moneda de venta, un componente cliente `<Price>` convierte con las tasas, redondeo y overrides `variant_prices` que ya llegan en los datos (lógica de `@kshop/core`), y la moneda elegida se guarda en `localStorage`/cookie. Las páginas siguen siendo cacheables | Leer la cookie en el servidor y renderizar por moneda (rompe la caché estática; una entrada por tienda × moneda) |
| D12 | **Imágenes** | `<img>` con `srcset` sobre los dos tamaños WebP ya generados (480/1600), `width/height`, `loading="lazy"` salvo la primera imagen (prioridad alta). **Sin** Image Optimization de Vercel (coste por imagen y dominios por tienda) | `next/image` con loader propio que devuelva esos tamaños (misma salida, más configuración) |
| D13 | **Acción de compra antes de la Fase 3** | Botón **«Pedir por WhatsApp»** en la ficha: abre `wa.me/{whatsapp_phone}` con producto, variante, precio y URL. Se sustituye por «Añadir al carrito» en la Fase 3 | Sin botón de compra hasta la Fase 3 (tienda solo vitrina) |
| D14 | **Admin de contenido y API** | Pantallas client-side en `/s/[storeSlug]/admin/themes/…` y API `/api/v1/stores/{id}/content/{theme,sections,banners,menus,pages}` con Zod + `requireStoreRole(admin)` + `requireModule('themes')`, escrituras con el cliente de servicio (CRUD de una tabla) o función SQL para reordenar/árbol de menú; cada escritura invalida `store:{id}:content`. Sin `themes` (no debería pasar en Base) la tienda usa el tema y la portada por defecto | Guardar todo el contenido en un único JSON por tienda (más simple, pero sin RLS fina ni programación por fechas en SQL) |

### Arquitectura Propuesta

```
supabase/
├── migrations/
│   ├── 20261026xxxxxx_storefront_content.sql    home_sections, banners, menus, menu_items, pages: FK compuestas,
│   │                                             índices (store_id primero), RLS pública por fechas/visibilidad, grants
│   └── 20261026xxxxxx_storefront_functions.sql  storefront_search_products, storefront_product_facets,
│                                                 storefront_collection_products (reglas), reordenar contenido
└── tests/03_storefront_isolation.test.sql       anon/fechas/suspendida, A vs B, funciones sin borradores ni costo

packages/core/src/storefront/                    Zod: tema (+presets, contraste), secciones por tipo, enlaces tipados,
                                                 reglas de colección, filtros ⇄ query params, orden
packages/data/src/storefront-queries.ts          documentos GraphQL públicos (tienda+tema, portada, menús, página,
                                                 ficha, listado/facetas) — sin next/*, los reusa la app (Fase 7)

apps/web/src/
├── app/s/[storeSlug]/(front)/
│   ├── layout.tsx                               tema (CSS vars + fuente), cabecera, menús, pie
│   ├── page.tsx                                 portada por secciones (+ portada por defecto)
│   ├── productos/, categoria/[slug]/, coleccion/[slug]/, marca/[slug]/, buscar/
│   ├── producto/[slug]/                          ficha + JSON-LD
│   ├── pagina/[slug]/
│   └── sitemap.xml/, robots.txt/                 por host (route handlers)
├── features/storefront/                          componentes públicos: ProductCard, Filters, VariantPicker,
│                                                 Gallery, Price, sections/*, Markdown
├── features/themes/                              module.ts + admin «Apariencia» (tema, portada, banners, menús, páginas)
├── server/storefront/                            lecturas con `use cache` + cacheTag/cacheLife por tienda
└── app/api/v1/stores/[storeId]/content/…         API del contenido (D14)
```

### Modelo de Datos

```sql
create type public.home_section_type as enum ('hero_slider','banner','product_carousel','category_grid','brand_strip','rich_text');
create type public.link_type        as enum ('product','category','collection','brand','page','url');
create type public.menu_location    as enum ('header','footer');

-- Todas: store_id not null FK stores on delete cascade, unique (store_id, id) en las padre,
-- FK compuestas (store_id, x_id), created_at/updated_at, RLS habilitada, escritura solo service_role.

home_sections (id, store_id, type, title, source_collection_id null, source_category_id null, source_brand_id null,
               settings jsonb /* Zod por tipo: nº de productos, columnas, banners, markdown… */,
               sort_order, is_visible, starts_at null, ends_at null)
               idx (store_id, sort_order)
banners       (id, store_id, title, subtitle, cta_label, image_url, image_mobile_url, alt,
               link_type null, link_target_id null, link_url null, sort_order, is_visible, starts_at, ends_at)
home_section_banners (store_id, section_id, banner_id, sort_order)        pk (section_id, banner_id)
menus         (id, store_id, location)                                    unique (store_id, location)
menu_items    (id, store_id, menu_id, parent_id null, label, link_type, link_target_id null, link_url null, sort_order)
               profundidad máx. 2 (trigger/check)
pages         (id, store_id, slug, title, content text /* Markdown restringido */, is_published,
               seo_title, seo_description)                                unique (store_id, slug)

-- Existentes que se usan/ajustan:
stores.theme         jsonb  -- D2, validado en API; ya público por grant de columna
collections.rules    jsonb  -- D8, activa las colecciones automáticas
-- Índices de lectura pública si EXPLAIN lo pide: variant_attribute_values (store_id, attribute_id, value_id),
-- products (store_id, category_id) / (store_id, brand_id) where status = 'published'.
```

RLS (patrón de 0b/1: `revoke all` y conceder lo justo):

| Tabla | anon / cliente | staff (admin) de la tienda / superadmin | Escritura |
|-------|----------------|------------------------------------------|-----------|
| `home_sections`, `banners`, `home_section_banners` | `is_visible` y `now()` dentro de `[starts_at, ends_at)` y tienda pública | todo lo de su tienda | solo `service_role` |
| `menus`, `menu_items` | de tiendas públicas | todo lo de su tienda | solo `service_role` |
| `pages` | `is_published` y tienda pública | todo lo de su tienda | solo `service_role` |
| Funciones `storefront_*` | `execute` para anon/authenticated, `security invoker` (heredan la RLS del catálogo) | ídem | — |

---

## Blueprint (Assembly Line)

> IMPORTANTE: Solo se definen FASES. Las subtareas se generan al entrar a cada fase
> siguiendo el bucle agéntico (mapear contexto → generar subtareas → ejecutar).

### Fase 1: Esquema de contenido y tests de aislamiento
**Objetivo**: migración de `home_sections`, `banners`, `home_section_banners`, `menus`, `menu_items` y `pages`
(FK compuestas, índices, RLS pública por visibilidad/fechas, grants) y suite `03_storefront_isolation.test.sql`.
**Validación**: `pnpm db:migrate` sin errores; advisors limpios; `pnpm test:rls` en verde (01–03); romper a
propósito una política hace fallar un test; `pnpm db:graphql-schema && pnpm codegen` OK.

### Fase 2: Lecturas públicas en SQL, core y data
**Objetivo**: funciones `storefront_search_products`, `storefront_product_facets` y
`storefront_collection_products` (reglas D8) con índices; en `@kshop/core` los Zod del tema, secciones,
enlaces, reglas de colección y el mapeo filtros ⇄ query params; en `@kshop/data` los documentos GraphQL
públicos + codegen.
**Validación**: tests SQL de las funciones (filtros combinados, subárbol de categoría, sin tildes, nunca
borradores/otra tienda/costo, `EXPLAIN` usa índices con el catálogo de la Tienda Demo); Vitest de core.

### Fase 3: Caché, tema y layout de la tienda
**Objetivo**: decisión D1 aplicada (Cache Components o no), lecturas de `server/storefront/` con tags por
tienda y `getStoreBySlug` migrado; tema aplicado como variables CSS + fuentes `next/font`; cabecera con
menú (móvil y escritorio), buscador, selector de moneda (D11) y pie; tienda suspendida y 404 propios.
**Validación**: el admin y la plataforma siguen funcionando (E2E de las fases 0b/1 en verde); dos tiendas
con temas distintos se ven distintas; segunda visita sin peticiones a Supabase; invalidar una tienda no toca la otra.

### Fase 4: Páginas públicas
**Objetivo**: portada por secciones (+ portada por defecto), listados (`/products`, categoría, colección,
marca), búsqueda con filtros y orden, ficha con selector de variante, galería, relacionados y «Pedir por
WhatsApp» (D13), páginas estáticas.
**Validación**: happy path pasos 1–6 en el navegador (390 px y escritorio) sobre la Tienda Demo; filtros
y paginación reflejados en la URL y compartibles.

### Fase 5: SEO y rendimiento
**Objetivo**: `generateMetadata` (título, descripción, Open Graph, canonical) por página, JSON-LD `Product`
y `BreadcrumbList`, `sitemap.xml` y `robots.txt` por host (ajustando el `matcher` del proxy), imágenes con
`srcset` (D12), favicon y `manifest` por tienda, presupuesto de JS del cliente; script `pnpm e2e:lighthouse`.
**Validación**: Lighthouse móvil en portada, listado y ficha con los umbrales de los criterios de éxito;
validador de datos estructurados sin errores.

### Fase 6: Admin «Apariencia» y colecciones automáticas
**Objetivo**: API `/api/v1/stores/{id}/content/…` (D14) y pantallas Tema (presets, tokens, contraste,
logo/favicon, vista previa), Portada (añadir/ordenar/ocultar/programar secciones), Banners, Menús (árbol de
2 niveles) y Páginas (Markdown con vista previa); reglas de colección automática en Catálogo › Colecciones;
`demo:seed` ampliado con tema, portada, menús y páginas de la Tienda Demo.
**Validación**: tests de API (401 sin token, 403 staff de B sobre A, 403 `module_not_enabled`, 422 Zod con
mensaje en español, happy path); paso 7–8 del happy path en el navegador; el cambio se ve en ≤ 5 s.

### Fase 7: Validación final
**Objetivo**: sistema funcionando end-to-end.
**Validación**:
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pasan
- [ ] `pnpm test:rls` y E2E de API (fases 0b, 1 y 2) en verde
- [ ] E2E Playwright del happy path con capturas en `.titan/qa/fase-2/` (móvil y escritorio)
- [ ] Lighthouse con los umbrales de los criterios de éxito
- [ ] Criterios de éxito cumplidos; memoria (`.titan/memory/project/`) y este PRP actualizados

---

## Progreso (actualizado 2026-10-25)

| Sub-fase | Estado | Commit / evidencia |
|----------|--------|--------------------|
| 2.1 Esquema de contenido | Hecha: banners, home_sections (+banners), menus/menu_items (2 niveles), pages; RLS por visibilidad/fechas; suite 03 (26 checks, contraprueba OK) | `7143805` |
| 2.2 Lecturas SQL, core y data | Hecha: `storefront_search_products` + `storefront_product_facets` (+ reglas de colección), Zod de tema/contenido, filtros ⇄ URL, consultas públicas probadas como anon; `test:rls` 177/177, core 35 tests | `8ceaf7d`, `0f8d196` |
| 2.3 Caché, tema y layout | Hecha: Cache Components activo (D1), `use cache` + tags por tienda, tema como variables CSS + 6 fuentes, cabecera/pie/menús, selector de moneda (D11) | `8382021`, `8375274` |
| 2.4 Páginas públicas | Hecha: portada por secciones (+ por defecto), listados, búsqueda, ficha con variantes y «Pedir por WhatsApp», páginas; probado en navegador (390 px y escritorio) | `a1aa24c` |
| 2.5 SEO y rendimiento | Hecha: robots/sitemap por tienda, canónicos, OG, JSON-LD, ISR en rutas con slug. Lighthouse móvil local: A11y/BP/SEO 100; rendimiento 82–93 con mucho ruido local (dev server + otra app en la misma máquina) → **medir en Vercel** | `bae3f5c` |
| 2.6 Admin «Apariencia» y colecciones automáticas | Pendiente | — |
| 2.7 Validación final | Pendiente (incluye Lighthouse en Vercel y el E2E del happy path con contenido creado desde el admin) | — |

## 🧠 Aprendizajes (Self-Annealing / Neural Network)

> Esta sección CRECE con cada error encontrado durante la implementación.

- **Cache Components**: quitar `export const runtime` de todos los route handlers; `apiHandler` debe llamar `unstable_rethrow(error)` o registra como error el abandono del prerender de los GET.
- **Rutas con params dinámicos**: o `generateStaticParams` (nunca vacío) y `await params` fuera de `<Suspense>` (ISR por URL), o todo dentro de `<Suspense>`. Admin/superadmin (cliente con `usePathname`) van dentro de `<Suspense>` en su layout.
- **pg_graphql devuelve `jsonb` como string JSON** (facetas, `settings`, `theme`): `JSON.parse` al leer.
- **Enums en filtros GraphQL** van sin comillas (`status: { eq: active }`).
- **Devolver `products.*` a anon** exige `select (search_vector)` para anon (derivado de datos públicos).
- **`--color-*` de `@theme inline` se resuelven en `:root`** (paleta del admin, con modo oscuro): la tienda lee `--fg/--bg/--ok…` directamente y el tema fija todos.
- **`seoDescription` puede ser `""`**: usar `||`, no `??`, para caer en la descripción.
- **`TaskStop` sobre `npx next start` deja vivo el proceso hijo de Next**: pararlo por puerto y comprobar su línea de comandos antes.
- **El puerto 3100 lo usa otra app de Roberto**: para builds de prueba usar otro (3200) y compilar con `NEXT_PUBLIC_PLATFORM_DOMAIN` de ese puerto.

---

## Gotchas

- [ ] El `matcher` de `proxy.ts` ignora rutas con extensión: `sitemap.xml`, `robots.txt` y `manifest` por tienda no se reescriben a `/s/{slug}` si no se exceptúan.
- [ ] Con Cache Components, leer `params`, `cookies()` o datos sin caché fuera de `<Suspense>` rompe el build; activarlo afecta también al admin y al superadmin (revisarlos en la Fase 3).
- [ ] `next/font` solo carga fuentes declaradas en build: el tema elige entre fuentes ya importadas, no URLs arbitrarias.
- [ ] Secciones y banners programados cambian sin que nadie guarde: la caché de contenido necesita `cacheLife` corto (p. ej. 5 min) además de `cacheTag`.
- [ ] `revalidateTag(tag, "max")` es stale-while-revalidate: la siguiente visita aún ve lo viejo. Para «se ve en ≤ 5 s» tras guardar en el admin usar `{ expire: 0 }` (como en `platform/stores/[storeId]`).
- [ ] La RLS pública por fechas usa `now()`: la caché puede servir una sección ya caducada hasta que expire su `cacheLife`.
- [ ] `products.search_vector` no tiene grant público: la búsqueda debe ir por la función, nunca filtrando la columna desde pg_graphql.
- [ ] Facetas: contar por producto, no por variante (un vestido con 3 tallas rojas cuenta 1 en «Rojo»), y aplicar los filtros de los **otros** atributos al calcular cada faceta.
- [ ] Enlaces tipados (menú, banner) pueden apuntar a algo despublicado o borrado: resolver en la lectura y no pintar el ítem (sin 404 en el menú).
- [ ] Markdown: nunca permitir HTML crudo ni `javascript:` en enlaces (XSS en una tienda = riesgo para todas las del mismo dominio padre).
- [ ] Las cookies de sesión del admin viven en el mismo host que la tienda: las páginas públicas no deben leerlas (romperían la caché y mezclarían vistas).
- [ ] Rendimiento real desde Cuba: probar Lighthouse con throttling móvil, y no solo en local.

## Anti-Patrones

- NO poner lógica de lectura en componentes con `next/*` que la app Capacitor no pueda reusar (lecturas en `@kshop/data`).
- NO consultar Supabase por cada visita: todo lo público pasa por la caché por tienda.
- NO permitir CSS ni HTML libre por tienda (decisión 10): solo tokens y Markdown restringido.
- NO exponer borradores, costo, stock por almacén ni contenido fuera de fechas en lecturas públicas.
- NO crear nuevos patrones si los de las fases 0b/1 funcionan (API, Zod, `requireStoreRole`, `requireModule`, tags).
- NO ignorar errores de TypeScript ni introducir `any`.

---

*PRP pendiente aprobación. No se ha modificado código.*
