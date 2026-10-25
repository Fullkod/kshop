# PRP-1: Catálogo de Kshop

> **Estado**: COMPLETADO (2026-10-25) — 1.1 a 1.8 hechas, incluidas las imágenes por URL del Excel y la prueba de 1 000 filas; ver «Progreso». Aprobado por Roberto el 2026-10-25 (D1–D13 tal cual; D4 provisional Base = 300, Pro sin límite).
> **Fecha**: 2026-10-24
> **Proyecto**: Kshop
> **Fase**: 1 (ver `arranque-y-fases.md`). Código de partida: commit `9fcd43f` (Fase 0b cerrada)

---

## Objetivo

Que el staff de cada tienda pueda montar y mantener su catálogo completo desde `/s/[storeSlug]/admin`
(tipos de producto, atributos, productos con variantes, precio de venta y de costo, monedas, categorías,
colecciones, marcas, imágenes, almacenes y stock) y cargarlo o descargarlo por Excel, con el costo y los
borradores invisibles para el público y aislamiento total entre tiendas probado con tests.

## Por Qué

| Problema | Solución |
|----------|----------|
| Sin catálogo no hay tienda pública (Fase 2) ni carrito/órdenes (Fase 3) | Esquema de catálogo Saleor/dcabellos (decisión 2): la variante es lo que se compra, con SKU, precio, costo y stock propios |
| Las tiendas cubanas compran en USD y venden en CUP; sin costo no hay margen | Precio de costo + moneda de costo por variante, **privado** (decisiones 18 y 20); el snapshot en la orden llega en la Fase 3 |
| Cargar a mano cientos de productos espanta a una tienda nueva | Plantilla Excel por tipo de producto, vista previa con errores por fila, importación por lotes y exportación ida y vuelta (decisión 19) |
| Añadir multi-almacén o multimoneda después obliga a migrar stock y precios | Esquema completo desde ahora (almacén por defecto, `stocks` por almacén, `store_currencies`); la funcionalidad extra se activa por módulo (`multi_warehouse`, `multi_currency`) |
| En multi-tenant un fallo de RLS o una referencia cruzada es una fuga | RLS en todas las tablas, **FK compuestas `(store_id, id)`** para que ninguna fila apunte a otra tienda, y tests de aislamiento A/B ampliados al catálogo |

**Valor de negocio**: es el módulo `catalog` (core) y `excel_import` (Base). Al cerrarla, una tienda real
puede tener su catálogo cargado en una tarde (Excel) y la Fase 2 solo tiene que pintarlo. También es el
ensayo del modelo para la migración de klauShop (Fase 8).

## Qué

### Criterios de Éxito
- [x] `pnpm db:migrate` aplica las migraciones del catálogo al Supabase online sin errores y los advisors de seguridad/rendimiento no marcan tablas nuevas sin RLS ni FKs sin índice.
- [x] `pnpm test:rls` en verde con la suite nueva de catálogo: anon solo ve productos `published` de tiendas activas y **nunca** el costo (ni por tabla, ni por pg_graphql, ni por relación anidada); el staff de A no lee borradores, costos, stocks ni import jobs de B, ni escribe nada directo en tablas (solo vía API); una FK que apunte a otra tienda es rechazada por la BD.
- [x] Desde el admin de «Tienda A», el dueño crea el tipo «Ropa» (atributos Talla y Color de variante, Material de producto), un producto con 6 variantes (3 tallas × 2 colores) con precio, costo en USD, stock e imágenes, lo asigna a categoría, marca y colección y lo publica.
- [x] Descarga la plantilla Excel del tipo «Ropa», la rellena con 20 productos / 60 variantes (con una categoría y un valor de atributo nuevos), ve la vista previa con los errores por fila, corrige, importa y los encuentra en el listado; exporta el catálogo, cambia precios y stock en el Excel y lo vuelve a subir en modo actualización (match por SKU).
- [x] La consulta pública (anon, pg_graphql) de un producto publicado devuelve nombre, precio, variantes, imágenes y stock disponible, y pedir `costPrice` falla o no existe; un producto en borrador no aparece.
- [x] Con el plan Base, la tienda no puede crear un segundo almacén ni activar otra moneda (UI muestra «Disponible en el plan Pro», la API responde 403 `module_not_enabled`); con Pro sí. El límite `max_products` se respeta al crear e importar (aviso antes de importar).
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm build` pasan; E2E Playwright de los dos flujos anteriores con capturas en `.titan/qa/fase-1/`.

### Comportamiento Esperado (Happy Path)

1. El dueño de «Tienda A» entra en `tienda-a.kshop.localhost:3000/admin` → **Catálogo**. Ya tiene un almacén
   por defecto («Principal») y su moneda base (CUP) creados con la tienda.
2. **Atributos**: crea «Talla» (dropdown: S, M, L), «Color» (swatch: Rojo #DC2626, Negro #111111) y
   «Material» (texto). **Tipos de producto**: «Ropa», con variantes; Talla y Color como atributos de
   variante (selección de variante) y Material como atributo de producto.
3. **Categorías** (árbol: Mujer › Vestidos), **Marcas** («Kaya») y **Colecciones** («Novedades», manual).
4. **Nuevo producto** → elige el tipo «Ropa»: nombre, slug sugerido, descripción, categoría, marca,
   colecciones, etiquetas, Material = «Algodón». Marca Talla {S, M, L} × Color {Rojo, Negro} y el editor
   genera la matriz de 6 variantes con SKU sugerido. Rellena precio de venta (CUP), precio tachado, costo
   y moneda de costo (USD) «para todas» y ajusta una variante; pone stock por variante (almacén por
   defecto, edición "plana"). Sube 4 imágenes (se comprimen en el navegador) y asigna la roja a las
   variantes rojas. Guarda como borrador → publica.
5. Un producto de tipo sin variantes («Accesorios») muestra precio, costo, SKU y stock directamente en la
   ficha: por debajo es una variante por defecto.
6. **Listado de productos**: búsqueda por nombre/SKU, filtros por estado, categoría, marca, tipo y stock
   bajo; paginado; acciones masivas publicar/archivar.
7. **Importar Excel** → descarga la plantilla de «Ropa» (columnas fijas + Talla, Color, Material; una fila
   por variante, agrupadas por código de producto), la sube → vista previa: 18 filas a crear, 2 con
   error («categoría Hombre no existe» → opción «crear categorías que falten»), resumen de lo nuevo →
   Confirmar → barra de progreso por lotes → resumen final. Los ajustes de stock quedan en
   `stock_movements` con el id del job.
8. **Exportar** → baja el catálogo en el mismo formato; edita precios/stock y lo sube en modo
   «actualizar» (match por SKU), o usa la importación parcial de solo stock / solo precios.
9. Mientras, un visitante anónimo que consulte pg_graphql ve el producto publicado con su precio y stock
   disponible, pero nunca el costo, los borradores ni nada de otra tienda.

---

## Contexto

### Referencias
- `.titan/memory/project/modelo-de-datos.md` §3 (catálogo), §4 (monedas), §10 (`brands`, `product_tags`, colecciones), §13 (Excel).
- `.titan/memory/project/decisiones.md` — 2 (Saleor), 4 (multimoneda del dueño, tasa manual), 17 (CUP/USD/EUR), 18–20 (costo/venta, Excel, overrides por moneda, multi-almacén en Pro).
- `.titan/memory/project/modulos-y-planes.md` — `catalog` y `excel_import` en Base; `multi_warehouse` y `multi_currency` en Pro/sueltos; límite de productos pendiente.
- `.titan/memory/project/lecturas-graphql-y-rls.md` — catálogo público por `status = 'published'`, filtros por función SQL, columnas desnormalizadas para listados.
- `.titan/memory/project/2026-10-24-fase-0b-cimientos.md` — convenciones D1–D7 y trucos (introspección, POST, versiones de migración, storage).
- Código actual (commit `9fcd43f`):
  - `supabase/migrations/20261024120000_platform_schema.sql` — helpers `private.is_superadmin/my_store_ids/has_store_role/store_has_module`, `currency_code`, patrón de grants por columna y RLS.
  - `supabase/migrations/20261024120100_platform_functions.sql` — `public.create_store` (hay que ampliarla: almacén y moneda por defecto), bucket público `store-media` con políticas `stores/{store_id}/...`.
  - `supabase/tests/_harness.sql` + `01_platform_isolation.test.sql` — `tests.create_user/login/login_anon/eq/check/throws/affected`.
  - `apps/web/src/server/{auth,http,supabase}.ts` — `getUserFromBearer`, `requireStoreRole`, `requireModule`, `apiHandler`, `HttpError`.
  - `apps/web/src/features/{catalog,excel-import,multi-warehouse,multi-currency}/module.ts` + `registry.ts`; placeholder en `app/s/[storeSlug]/admin/[module]/page.tsx`.
  - `packages/core/src/{currency,modules,roles,slug}.ts`, `packages/data/src/{api,graphql,queries}.ts` + codegen (`pnpm db:graphql-schema && pnpm codegen`), `packages/ui/src/components.tsx`.
- Referencias externas (**solo lectura**): dcabellos (modelo de producto/atributos/precios por moneda),
  Saleor (`product`, `attribute`, `warehouse`), klauShop (`src/app/api/medias/route.ts` con sharp,
  `ExportProductsButton.tsx` con `xlsx`, `react-dropzone`, AdminTable).
- Skills: `tf-supabase`, `supabase`, `supabase-postgres-best-practices`, `tf-playwright-cli`, `anthropic-skills:xlsx` (solo para generar Excels de prueba).

### Decisiones técnicas propuestas (Roberto confirma o cambia)

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D1 | **Librería de Excel** | **ExcelJS** (MIT, en npm y mantenida) en el servidor (route handler, runtime Node): genera la plantilla con hoja de instrucciones, **listas desplegables** (validación de datos) para categoría, marca, moneda y valores de atributo, y lee `.xlsx`; `.csv` con el mismo mapeo. El navegador nunca carga la librería | SheetJS (`xlsx`, la de klauShop): la versión de npm está congelada en 0.18.5 con avisos de seguridad (prototype pollution/ReDoS) y la nueva solo se instala desde su CDN; sin estilos ni validaciones en la edición libre |
| D2 | **Flujo de importación** | Subida del archivo a un **bucket privado nuevo `store-imports`** (`stores/{store_id}/imports/...`, staff de la tienda escribe; sin lectura pública) → `POST /api/v1/stores/{id}/imports` lo parsea, valida con Zod fila a fila y guarda `import_jobs` + `import_job_rows` (vista previa) → confirmar → el cliente llama a `.../imports/{jobId}/run` por lotes (p. ej. 200 filas) y cada lote es **una transacción** en una función SQL. Así no hay límite de 4,5 MB de body de Vercel ni timeouts, y el archivo queda para auditoría | Parsear en el navegador y enviar JSON por lotes (más ligero en servidor, pero sin archivo de auditoría y con la librería pesada en el cliente) |
| D3 | **Subida de imágenes** | **Compresión en el navegador** (canvas → WebP, máx. 1600 px + miniatura de 480 px, sin dependencia o con `browser-image-compression`) y **subida directa a Storage** con el token del staff (las políticas de `store-media` ya lo permiten) a `stores/{store_id}/products/{uuid}-{size}.webp`; luego `POST /api/v1/.../media` registra la fila. Funciona igual en la app Capacitor. Para las **URLs del Excel**, el servidor descarga, procesa con **sharp** a los mismos tamaños y sube. El **.zip de imágenes** queda fuera de esta fase | Todo por el servidor con sharp (como klauShop): una sola lógica, pero cada imagen pasa por Vercel (límite 4,5 MB, más lento desde Cuba). O Image Transformations de Supabase (requiere plan de pago) |
| D4 | **Límite de productos por plan** | Mecanismo listo: `plan_limits.max_products` contando **productos no archivados** (no variantes), comprobado en la función SQL de crear producto y en el import (aviso en la vista previa). Valores **a decidir por Roberto**; propuesta inicial **Base = 300, Pro = sin límite** (sin fila = ilimitado, como `max_staff`). Archivar libera cupo; bajar de plan no borra nada (solo impide crear) | Contar variantes/SKU; o sin límite hasta la Fase 5 |
| D5 | **Costo privado** | El costo vive en una **tabla aparte `variant_costs`** (store_id, variant_id, cost_price, cost_currency) con RLS solo staff/superadmin y **sin grant a anon**. Lectura pública de `product_variants` no tiene nada que filtrar; el staff lo lee por la relación en pg_graphql. Se aparta de la nota del modelo (columna en `product_variants`) por ser más difícil de romper | Columnas en `product_variants` con grant por columna (anon/authenticated sin `select` en el costo): pero entonces el staff tampoco lo lee por pg_graphql y hay que exponerlo por función |
| D6 | **Integridad entre tiendas** | `unique (store_id, id)` en las tablas padre y **FK compuestas** `(store_id, x_id) references x (store_id, id)` en todas las relaciones (incluidas tablas puente y `stocks`, que también llevan `store_id`). La BD garantiza que un producto de A no apunte a una categoría o almacén de B, aunque una función tenga un fallo | Comprobar pertenencia dentro de cada función SQL (fácil de olvidar) |
| D7 | **Escrituras** | Igual que 0b (D2): **funciones SQL `security definer`** con `execute` solo para `service_role`, llamadas por RPC desde `/api/v1/stores/{storeId}/catalog/...` tras Zod + `requireStoreRole` + `requireModule('catalog')`. Las que tocan varias tablas o stock (`save_product` con variantes/precios/costos/atributos en una transacción, `adjust_stock` con `for update` + `stock_movements`, `run_import_batch`, reordenar). CRUD simple de una tabla (marca, colección, atributo) desde el route handler con el cliente de servicio y `store_id` tomado de la ruta | Una función SQL por cada escritura (más SQL, misma seguridad) |
| D8 | **Descripción** | `description jsonb` + `description_plain`. En la Fase 1, **texto con saltos de línea** (textarea) guardado como bloques simples `{format: 'plain', text}`; editor rico más adelante sin migrar la columna | Tiptap ya en esta fase (negrita, listas, enlaces) |
| D9 | **Árbol de categorías** | `parent_id` + `path ltree` mantenido por trigger (subárboles con `<@` e índice GiST), profundidad máx. 3, mover rama recalcula la descendencia | `parent_id` + CTE recursiva en cada consulta |
| D10 | **Monedas en esta fase** | `store_currencies` (base creada con la tienda) y `currency_rate_history`. **Base**: una moneda de venta; el costo puede estar en CUP/USD/EUR (decisión 18) y la tienda guarda la tasa de esas monedas solo para calcular margen. **Pro/`multi_currency`**: activar monedas de venta, tasa, redondeo y overrides `variant_prices`. La conversión precio × tasa + redondeo vive en `@kshop/core` (probada) y en SQL para la Fase 2 | Dejar todo lo de monedas para la Fase 6 (Pro) y solo validar la moneda de costo |
| D11 | **Colecciones** | **Manuales** en esta fase (`collection_products` con orden). La columna `rules jsonb` existe pero las colecciones automáticas se resuelven en la Fase 2 junto a la home por secciones | Automáticas ya (categoría, etiqueta, últimos N días) |
| D12 | **Desnormalizado para listados** | Trigger/función que mantiene en `products`: `min_price`, `max_price` (moneda base), `in_stock`, `primary_media_url`, `search_vector` (config `spanish` + `unaccent`, por trigger porque `unaccent` no es inmutable). Los usa ya el listado del admin y los hereda la Fase 2 | Calcularlos al leer (joins grandes en la grilla) |
| D13 | **Lecturas del admin** | pg_graphql + urql + codegen (como 0b), paginación por cursor con `totalCount` (comentario `@graphql({"totalCount": {"enabled": true}})` en las tablas del listado); la búsqueda/filtros del listado por una función SQL `admin_search_products` expuesta por pg_graphql | Endpoints REST de lectura en `/api/v1` |

### Arquitectura Propuesta

```
supabase/
├── migrations/
│   ├── 2026102513xxxx_catalog_schema.sql        tipos, tablas, FK compuestas, índices, RLS, grants, triggers
│   ├── 2026102513xxxx_catalog_functions.sql     save_product, adjust_stock, reorder_*, admin_search_products,
│   │                                            create_store v2 (almacén + moneda por defecto) + backfill
│   └── 2026102513xxxx_catalog_imports.sql       import_jobs/rows, run_import_batch, bucket store-imports
└── tests/02_catalog_isolation.test.sql          A/B, anon, costo, FK cruzadas, límites y módulos

packages/core/src/catalog/                       Zod de entradas (product, variant, attribute, category…),
                                                 matriz de variantes, SKU sugerido, precios/redondeo,
                                                 columnas y validación de filas del Excel (sin I/O)
packages/data/src/catalog/                       documentos GraphQL del admin y públicos + tipos de /api/v1

apps/web/src/
├── app/api/v1/stores/[storeId]/
│   ├── catalog/{product-types,attributes,categories,brands,collections,products,warehouses,currencies,media}/…
│   ├── stock/…                                  ajustes (y transferencias con multi_warehouse)
│   └── imports/…, exports/…, templates/…        Excel (requireModule('excel_import'))
├── server/catalog/                              llamadas RPC, ExcelJS, sharp, límites, revalidateTag
├── features/catalog/                            module.ts + components/ (editor, listados, árbol, uploader)
├── features/excel-import/                       module.ts + asistente importar/exportar
├── features/multi-warehouse/, multi-currency/   pantallas extra que solo aparecen con su módulo
└── app/s/[storeSlug]/admin/catalog/…            rutas client-side del admin (reemplazan el placeholder)
```

Endpoints (todos con `Authorization: Bearer`, tienda en la ruta, nunca del host):

| Recurso | Rol mínimo | Módulo |
|---------|-----------|--------|
| Tipos de producto, atributos y valores, categorías, marcas, colecciones | `admin` | `catalog` |
| Productos, variantes, precios, costos, medias, etiquetas | `staff` | `catalog` (+ límite `max_products` al crear) |
| Ajuste de stock | `staff` | `catalog`; transferencias y >1 almacén: `multi_warehouse` |
| Almacenes | `admin` | `catalog` (1); crear más: `multi_warehouse` |
| Monedas: tasas para el costo | `admin` | `catalog`; monedas de venta y overrides: `multi_currency` |
| Plantilla, exportar, importar | `admin` | `excel_import` |

### Modelo de Datos

```sql
create extension if not exists ltree;
create extension if not exists unaccent;

create type public.attribute_input_type as enum ('dropdown','multiselect','swatch','boolean','numeric','text','date');
create type public.attribute_scope      as enum ('product','variant');
create type public.product_status       as enum ('draft','published','archived');
create type public.media_type           as enum ('image','video');
create type public.stock_movement_type  as enum ('adjustment','sale','cancel','refund','transfer_in','transfer_out','purchase','import');
create type public.import_job_status    as enum ('uploaded','validating','ready','importing','done','failed','cancelled');
create type public.import_job_type      as enum ('products','stock','prices');
create type public.import_mode          as enum ('create_only','upsert');

-- Toda tabla: store_id not null FK stores on delete cascade, unique (store_id, id) en las padre,
-- FK compuestas (store_id, x_id) → x (store_id, id), created_at/updated_at, RLS habilitada.

-- Monedas (§4)
store_currencies       (store_id, currency currency_code, is_base, sells bool, rate_to_base numeric(18,6),
                        rounding numeric(12,2), updated_by, updated_at)      pk (store_id, currency)
currency_rate_history  (id, store_id, currency, rate, set_by, set_at)

-- Estructura
attributes             (id, store_id, name, slug, input_type, unit, value_required, visible_in_storefront,
                        filterable_in_storefront, filterable_in_dashboard, sort_order)   unique (store_id, slug)
attribute_values       (id, store_id, attribute_id, name, slug, value /*hex*/, file_url, sort_order)
                        unique (store_id, attribute_id, slug)
product_types          (id, store_id, name, slug, has_variants, is_shipping_required, weight)
product_type_attributes(store_id, product_type_id, attribute_id, scope, variant_selection, sort_order)
categories             (id, store_id, parent_id, name, slug, description, image_url, sort_order,
                        path ltree, seo_title, seo_description)               unique (store_id, slug)
brands                 (id, store_id, name, slug, logo_url, description, is_published)
collections            (id, store_id, name, slug, description, image_url, is_published, sort_order,
                        rules jsonb /* automáticas en Fase 2 */, seo_*)
collection_products    (store_id, collection_id, product_id, sort_order)     pk (collection_id, product_id)

-- Productos
products               (id, store_id, product_type_id, category_id, brand_id, name, slug,
                        description jsonb, description_plain, status, published_at, featured, badge,
                        seo_title, seo_description, metadata jsonb,
                        -- desnormalizado (D12):
                        min_price, max_price, in_stock, primary_media_url, search_vector tsvector)
                        unique (store_id, slug); idx (store_id, status, published_at desc), gin(search_vector)
product_tags           (store_id, product_id, tag)                           pk (product_id, tag)
product_attribute_values(store_id, product_id, attribute_id, value_id null, value_text, value_numeric,
                        value_boolean, value_date)
product_variants       (id, store_id, product_id, sku, name, sort_order, is_default, track_inventory,
                        weight, price numeric(12,2) /*moneda base*/, compare_at_price, metadata)
                        unique (store_id, sku); un solo is_default por producto (índice parcial)
variant_attribute_values(store_id, variant_id, attribute_id, value_id)       pk (variant_id, attribute_id)
variant_prices         (store_id, variant_id, currency, price, compare_at_price)   -- solo overrides (Pro)
variant_costs          (store_id, variant_id pk, cost_price numeric(12,2), cost_currency currency_code)  -- D5
product_media          (id, store_id, product_id, storage_key, url, thumb_url, alt, type, sort_order)
variant_media          (store_id, variant_id, media_id)

-- Inventario
warehouses             (id, store_id, name, address, phone, is_default, is_pickup_point, is_active)
                        un solo is_default por tienda (índice parcial)
stocks                 (store_id, variant_id, warehouse_id, quantity, quantity_allocated,
                        low_stock_threshold)   pk (variant_id, warehouse_id); check quantity_allocated <= quantity
stock_movements        (id, store_id, variant_id, warehouse_id, type, quantity, order_id null,
                        import_job_id null, note, user_id, created_at)        idx (store_id, variant_id, created_at)
-- warehouse_shipping_zones se crea en la Fase 3 junto a shipping_zones.

-- Excel (§13)
import_jobs            (id, store_id, type, mode, file_key, status, product_type_id null, total_rows,
                        created_count, updated_count, error_count, options jsonb, created_by, created_at, finished_at)
import_job_rows        (store_id, job_id, row_number, product_key, data jsonb, action /*create|update|skip*/,
                        errors jsonb, applied_at)                           pk (job_id, row_number)
```

RLS y privilegios (patrón de 0b: se parte de `revoke all` y se concede solo lo necesario):

| Tabla | anon | authenticated (staff de la tienda / superadmin) | Escritura |
|-------|------|------------------------------------------------|-----------|
| `products` y su contenido (variantes, atributos, medias, tags, colecciones, `variant_prices`) | `select` si `status = 'published'` y tienda `active` (columnas públicas por grant) | todo lo de su tienda (`has_store_role(store_id,'staff')`) incluidos borradores | solo `service_role` |
| `categories`, `brands`, `collections`, `attributes`(+values), `product_types` | `select` de lo publicado/visible de tiendas activas | todo lo de su tienda | solo `service_role` |
| `stocks` | solo disponible (`quantity - quantity_allocated`) vía columna/función pública, no el detalle por almacén | todo lo de su tienda | solo `service_role` (`adjust_stock`) |
| `variant_costs`, `stock_movements`, `currency_rate_history`, `import_jobs`, `import_job_rows` | **sin grant** | staff de su tienda (costo e imports: `admin`) | solo `service_role` |
| `store_currencies` | moneda/redondeo de las monedas de venta | todo lo de su tienda | solo `service_role` |
| Storage `store-imports` (privado) | — | staff de su tienda escribe/lee su prefijo | — |

---

## Blueprint (Assembly Line)

> IMPORTANTE: Solo se definen FASES. Las subtareas se generan al entrar a cada fase
> siguiendo el bucle agéntico (mapear contexto → generar subtareas → ejecutar).

### Fase 1: Esquema del catálogo en la BD
**Objetivo**: migraciones del modelo de arriba (tipos, tablas, FK compuestas, índices con `store_id`
primero, RLS, grants por columna, triggers de `updated_at`, `path`, desnormalizados y `search_vector`),
`create_store` ampliada con almacén «Principal» y moneda base (+ backfill de las tiendas existentes),
bucket privado `store-imports` y comentarios de pg_graphql (`totalCount`, nombres).
**Validación**: `pnpm db:migrate` sin errores; advisors sin avisos nuevos; `pnpm db:graphql-schema` muestra
el catálogo y **no** muestra funciones de escritura ni `variant_costs` para anon; las tiendas de 0b tienen
almacén y moneda por defecto.

### Fase 2: Tests de aislamiento y privacidad del catálogo
**Objetivo**: `supabase/tests/02_catalog_isolation.test.sql` con tiendas A (Base) y B (Pro): anon (publicado
sí, borrador/costo/movimientos/imports no, tienda suspendida no), staff de A vs datos de B (lectura y
escritura directa), FK compuesta que apunta a otra tienda rechazada, storage `store-imports`, consulta
`graphql.resolve` como anon pidiendo el costo.
**Validación**: `pnpm test:rls` en verde (suites 01 y 02); romper a propósito una política o una FK hace
fallar al menos un test.

### Fase 3: Funciones de escritura, core y contrato de datos
**Objetivo**: funciones SQL `save_product`, `adjust_stock`, `set_currency_rate`, reordenar, borrar/archivar
con comprobación de límites y módulos en BD (`store_has_module`, `max_products`); en `@kshop/core` los Zod
del catálogo, matriz de variantes, SKU sugerido, precios con tasa y redondeo; en `@kshop/data` documentos
GraphQL (admin y público) + codegen y tipos de `/api/v1`.
**Validación**: tests SQL de las funciones (transacción, `for update`, movimientos de stock, límite y
módulo); Vitest de core (matriz, redondeo, Zod); `pnpm codegen` sin errores.

### Fase 4: API v1 del catálogo y medias
**Objetivo**: route handlers de la tabla de endpoints con Zod, `requireStoreRole`, `requireModule` y
`revalidateTag('store:{id}:catalog')`; registro de medias subidas desde el cliente y helper de
compresión WebP (dos tamaños) compartido web/app; procesado de imágenes por URL con sharp en el servidor.
**Validación**: tests de integración (`pnpm e2e:api` ampliado): sin token 401, staff de B sobre A 403,
módulo ausente 403 `module_not_enabled`, límite 409/422 con mensaje en español, happy path 200/201.

### Fase 5: Admin — estructura del catálogo
**Objetivo**: pantallas client-side en `/s/[storeSlug]/admin/catalog/...` para atributos y valores
(swatch con color), tipos de producto (asignar atributos y alcance), categorías (árbol con orden y mover),
marcas, colecciones manuales (orden de productos), almacenes y monedas (las partes Pro con «Disponible en
el plan Pro»); menú de Catálogo con sus secciones; componentes reutilizables en `@kshop/ui` si hacen falta.
**Validación**: crear la estructura del happy path (pasos 2–3) en el navegador, en escritorio y móvil;
con Base el segundo almacén/moneda aparece bloqueado.

### Fase 6: Admin — productos, variantes, precios, stock e imágenes
**Objetivo**: listado con búsqueda, filtros, paginado y acciones masivas; editor de producto (con y sin
variantes): atributos, matriz de variantes, precio/tachado/costo «para todas» y por variante, overrides
por moneda (Pro), stock plano o por almacén (Pro), imágenes con subida directa, orden y asignación a
variantes; borrador/publicar/archivar.
**Validación**: pasos 4–6 del happy path en el navegador; el producto queda bien en la BD (variantes,
costos, stocks, `stock_movements`, desnormalizados) y la consulta anon no trae el costo.

### Fase 7: Excel — plantilla, exportar e importar
**Objetivo**: plantilla por tipo de producto con ExcelJS (instrucciones + desplegables), exportación en el
mismo formato, importación en tres pasos (subir → vista previa con errores por fila y opción de crear
categorías/marcas/valores que falten → ejecutar por lotes con progreso y resumen), modos `create_only` /
`upsert` por SKU, importaciones parciales de stock y de precios, imágenes por URL, aviso de límite.
**Validación**: importar 20 productos / 60 variantes con errores provocados y corregidos; exportar →
editar → reimportar en `upsert` deja los cambios y los movimientos de stock con el id del job; un Excel
de 1 000 filas se importa sin timeouts.

### Fase 8: Validación final
**Objetivo**: catálogo funcionando end-to-end, documentado y cerrado.
**Validación**:
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:rls` y `pnpm build` pasan
- [x] E2E Playwright: crear el producto con 6 variantes + importar/exportar Excel + consulta anon sin costo; capturas en `.titan/qa/fase-1/`
- [x] Criterios de éxito cumplidos
- [x] Memoria actualizada (`.titan/memory/project/` con D1–D13 confirmadas y los trucos nuevos), `AGENTS.md`/`docs/` si cambian comandos
- [x] Commit(s) `feat:` en local (sin push ni deploy sin permiso)

---

## Progreso (actualizado 2026-10-25)

| Sub-fase | Estado | Commit / evidencia |
|----------|--------|--------------------|
| 1.1 Esquema del catálogo | Hecha | `83c5144` (+ migraciones 100200, 100300) |
| 1.2 Tests de aislamiento del catálogo | Hecha: suite 02, 122/122 en total; contrapruebas OK | `83c5144` |
| 1.3 Funciones, core y contrato | Hecha: Zod, matriz, SKU, precios (20 tests); cliente tipado en @kshop/data | `be4645d` |
| 1.4 API v1 del catálogo | Hecha: `pnpm e2e:catalog` 30/30 | `be4645d` |
| 1.5 Admin — estructura | Hecha (categorías, atributos, tipos, marcas, colecciones, almacenes, monedas) | `e6dd85b`, `a6b0cd1` |
| 1.6 Admin — productos | Hecha: listado + editor con matriz, costo/margen, stock, imágenes WebP; probado en la Tienda Demo | `e6dd85b`, capturas `.titan/qa/fase-1/01–07` |
| 1.7 Excel | Hecha: API (plantilla con desplegables, export, import con vista previa y lotes, upsert por SKU; `pnpm e2e:excel` 18/18) y pantalla `/admin/excel-import` (tipo → plantilla/export → subir → vista previa → importar por lotes con progreso → resumen) | `9a24b5a`, `8fb5b0e`, capturas `08–11` |
| 1.8 Validación final | Hecha: editor con precios por moneda (`multi_currency`) y stock por almacén (`multi_warehouse`), badge «Pro» en Base; E2E en navegador del Excel (8/8) y del editor Pro (7/7); `typecheck`, `lint`, `test`, `build`, `test:rls` 122/122, `e2e:catalog` 30/30, `e2e:excel` 18/18; advisors sin tablas sin RLS ni FKs sin índice | `86ba903`, capturas `12–13` |

**Cierre de la 1.7 (Roberto pidió cerrar la fase, 2026-10-25):**
1. Imágenes por URL en el Excel: columna «Imágenes (URLs)» (plantilla, export e import). El servidor descarga
   (solo http/https y direcciones públicas, comprobadas en cada redirección; 15 s; 15 MB), convierte con sharp a
   WebP 1600/480 y guarda en `store-media`; `product_media.source_url` (columna privada) evita duplicar al
   reimportar; los fallos salen como avisos. Commit `c901b47`; `pnpm e2e:excel` 22/22; `test:rls` 123/123.
2. Carga: `pnpm e2e:excel-load` (1 000 filas / 250 productos en la Tienda Demo, borra lo creado). Lotes de 4
   productos en paralelo y slugs comprobados una vez por lote: de 441 s a 89 s en total, lote más lento 22,5 s,
   vista previa 22,6 s (medido en local con ~170 ms de latencia a Supabase). Commit `d6f1507`.

**Notas del cierre (2026-10-25):**
- La Tienda Demo queda con USD a la venta, el almacén «Tienda Centro», un precio de 9,50 USD en
  VESTIDO-NANDU-S-ROJO, 7 unidades de esa variante en Tienda Centro y las faldas «Falda UI N …» del E2E de Excel.
- Advisors: avisos esperados (pg_graphql expone `public` a propósito; `private.store_private_config` sin
  políticas a propósito; HIBP requiere Supabase Pro; índices aún sin uso por falta de tráfico).
- La vista de Base de las secciones Pro del editor se verificó por código (badge + texto), no con captura;
  el bloqueo de la API en Base lo cubre `pnpm e2e:catalog`.
- Los guiones de navegador de esta sesión (playwright-core aparte) no están en el repo: si se quieren
  permanentes, pasar a `scripts/` en la Fase 2.

## 🧠 Aprendizajes (Self-Annealing / Neural Network)

- **pg_graphql 1.6 no expone funciones con argumentos enum** (ni las que devuelven `table(...)`): usar `text` y `setof <tabla>`.
- **Devolver `products.*` desde una función invoker** exige `select` en todas las columnas (incl. `search_vector`) para el rol que llama.
- **`INSERT … RETURNING` no vale como subconsulta en FROM**: usar CTE `with x as (insert …) …`.
- **Un `count` en la misma sentencia que llama a una función que escribe** usa el snapshot anterior: separar en dos sentencias.
- **Triggers corren con el rol que escribe** (`service_role`): los helpers de `private` que llaman necesitan `execute` para ese rol.
- **Prettier reformatea el GraphQL embebido**: correr `pnpm codegen` después de formatear; si no, los documentos tipados pasan a `unknown`. Verificar con códigos de salida, no con `grep` en una cadena `&&` (así se coló el commit `e6dd85b` con el typecheck roto, arreglado en `a6b0cd1`).
- **PostgREST puede devolver un embed uno-a-uno como lista** (`variant_costs`): normalizar `Array.isArray(x) ? x[0] : x`.
- **Leaked password protection (HIBP) de Supabase Auth requiere plan Pro de Supabase**: no se puede activar en el plan actual.
- **Guiones de Playwright**: esperar la respuesta de la API y el elemento nuevo en la lista, no un botón que siempre está visible.
- **Si el navegador del MCP de Playwright está ocupado por otra sesión**, lanzar un Chromium propio con `playwright-core` (misma versión que el navegador instalado en `%LOCALAPPDATA%\ms-playwright`) desde un directorio aparte.
- **El import es lento por idas y vueltas a la BD, no por la BD** (`import_product` ~17 ms): paralelizar productos del lote y agrupar consultas; nunca juntar el marcado de filas al final del lote (se perdería la reanudación).
- **`ReadableStream` no es iterable con `for await` en los tipos DOM de TS**: usar `getReader()`.
- **Node no resuelve `*.localhost`** (ENOTFOUND): las llamadas a la API desde scripts van a `http://localhost:3000`; el navegador sí resuelve `demo.kshop.localhost`. `getByRole("button")` choca con el botón de Next Dev Tools: usar el nombre.

> Esta sección CRECE con cada error encontrado durante la implementación.
> El conocimiento persiste para futuros PRPs. El mismo error NUNCA ocurre dos veces.

---

## Gotchas

> Cosas críticas a tener en cuenta ANTES de implementar

- [ ] pg_graphql expone **las relaciones**: aunque `variant_costs` tenga RLS, comprobar que anon no ve el campo ni por `productVariants → variantCosts` (sin grant = no aparece en el esquema de anon). Probarlo con `graphql.resolve` como anon en los tests.
- [ ] `max_rows: 100` del esquema `public`: el listado del admin y el export no pueden depender de una sola consulta GraphQL; el export se hace en servidor (service role, por páginas).
- [ ] Las políticas públicas de las tablas hijas (variantes, medias, atributos) deben comprobar que el **producto padre** está publicado y la tienda activa (`exists` con índice), no solo su propia fila.
- [ ] `unaccent` no es inmutable: `search_vector` por trigger, no columna generada. `ltree` no admite `-` en etiquetas: usar el id (hex sin guiones) o un índice, no el slug.
- [ ] FK compuestas obligan a `unique (store_id, id)` en el padre y a que las tablas puente lleven `store_id`; `on delete` coherente (borrar producto → cascada a variantes; borrar categoría → `set null` de `category_id` sin tocar `store_id`: usar `on delete set null (category_id)` de Postgres 15+).
- [ ] Producto sin variantes = una variante `is_default`; al activar `has_variants` en un tipo con productos existentes no se rompen sus variantes por defecto.
- [ ] Stock: `adjust_stock` con `select … for update` sobre `stocks` y movimiento en la misma transacción; `quantity_allocated` lo usará la Fase 3 (reservas): no permitir bajar `quantity` por debajo de lo reservado.
- [ ] La Management API devuelve solo el último `select`: las funciones de import devuelven un resumen y los tests escriben en la tabla temporal del harness. Versiones de migración: `db.mjs` las reescribe.
- [ ] Vercel: body máx. 4,5 MB y tiempo por función limitado: el Excel va por Storage y el import por lotes; las imágenes por URL del Excel también por lotes (descarga con timeout y tamaño máx.).
- [ ] Bucket `store-media` es **público**: nunca guardar ahí Excels ni nada privado (usar `store-imports`).
- [ ] Excel: SKU y teléfonos/códigos numéricos pierden ceros o salen como número/fecha; leer celdas como texto y normalizar. Filas del mismo producto deben compartir los datos de producto (avisar si difieren).
- [ ] Cambios de tasa no reescriben precios guardados; las órdenes (Fase 3) guardarán la tasa usada.
- [ ] Desactivar `multi_warehouse`/`multi_currency` no borra almacenes, overrides ni tasas: la UI los oculta y el stock "plano" pasa a mostrar el total.
- [ ] `revalidateTag` solo existe en el servidor de Next: llamarlo en los route handlers, nunca desde `packages/*`.

## Anti-Patrones

- NO crear nuevos patrones si los existentes funcionan (`apiHandler`, `requireStoreRole`, `requireModule`, harness SQL, codegen)
- NO ignorar errores de TypeScript ni introducir `any`
- NO hardcodear valores (límites en `plan_limits`, módulos como constantes de `@kshop/core`, tamaños de imagen y de lote como constantes)
- NO omitir validación Zod en inputs de usuario (incluidas las filas del Excel)
- NO exponer el costo en ninguna lectura pública ni mandarlo al storefront
- NO confiar en `store_id` del body: siempre de la ruta y comprobado contra el usuario
- NO escribir en tablas del catálogo desde el cliente (ni con RLS de insert): solo `/api/v1` → funciones/servicio
- NO importar todo el Excel en una sola petición ni transacción gigante
- NO usar Server Actions ni importar `next/*` en `packages/*`
- NO tocar Vercel, DNS, GitHub ni nada de klauShop sin permiso (el Supabase online de Kshop sí, por D3 de 0b)

---

*Tienda de pruebas persistente: «Tienda Demo» (`demo`), ver `.titan/memory/project/tienda-demo.md`.*
