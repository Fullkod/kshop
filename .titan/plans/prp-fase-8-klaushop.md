# PRP: Fase 8 · Migrar klauShop como tienda nº 1 de Kshop (Nano, por lotes)

> **Estado**: APROBADO (2026-10-27). Respuestas de Roberto: dueña Claudia (la tienda `klau` ya existe con ella como owner;
> se usa ese slug, no `klaushop`), cortesía, por ahora el subdominio `klau`, pedidos abiertos como historial sin reserva,
> enlaces antiguos caducan, D5 y D9 confirmadas. 8.1–8.5 ejecutadas el 2026-10-28 (ver Aprendizajes).
> **Fecha**: 2026-10-27
> **Proyecto**: Kshop (`C:\Local-Disc-D\Project\Fullkod\kshop`)
> **Sigue a**: R10 (`prp-r10-deuda-lecturas.md`). Memoria: `project/2026-10-24-estudio-klaushop-vs-dcabellos.md`,
> `project/tienda-demo.md` (el slug `klaushop` se reservó para esta fase), `project/lecturas-tienda-r9.md` (Nano),
> `reference/fuentes.md` (klauShop es **solo lectura**; nunca su Supabase como backend).

---

## Objetivo

Klau's Shop vende desde Kshop como la tienda `klaushop` (plan Pro), con su catálogo, imágenes, zonas, clientes,
favoritos e historial de pedidos traídos de la base actual de klauShop, migrados **por lotes** y de forma
**reanudable** contra la instancia Supabase actual (Nano), sin tocar la producción de klauShop hasta el día del corte.

## Por qué

| Problema | Solución |
|----------|----------|
| klauShop es un sitio aparte (Next 14, admin global, sin variantes ni multimoneda) que ya no se quiere mantener | Pasa a ser una tienda más de Kshop y hereda todo lo nuevo (variantes con stock, promociones, finanzas, app) |
| Klau no puede «empezar de cero»: tiene catálogo, fotos, clientes y pedidos con historial | Se migran los datos con mapa de ids antiguos → nuevos, en lotes verificables |
| La Nano se estrangula con ráfagas (R9) y una migración masiva la tumbaría con la tienda Demo en uso | Lotes pequeños con pausa, imágenes procesadas en local, ensayos medidos antes del corte |
| El checkout por WhatsApp sigue siendo el modelo de venta | Kshop ya lo tiene; el corte solo cambia el dominio al que entran los clientes |

**Valor de negocio**: primera tienda **real** en Kshop (prueba de fuego de la plataforma), un solo código que
mantener, y Klau's Shop gana variantes, ofertas, finanzas, multimoneda y la app de tienda.

## Qué

### Criterios de éxito
- [ ] `pnpm klaushop:export` vuelca la base de klauShop a una carpeta **git-ignored** sin escribir nada allí; el
      informe de inventario (conteos por tabla, productos por nº de combinaciones, clientes sin teléfono, pedidos
      por estado) coincide con lo que Klau ve en su admin.
- [ ] `pnpm klaushop:import` es **idempotente y reanudable**: se corta a la mitad, se vuelve a lanzar y termina sin
      duplicar nada (mapa `private.legacy_ids`); `--dry-run` no escribe.
- [ ] `pnpm klaushop:verify` compara origen y destino: mismos productos publicados, misma suma de stock, mismas
      imágenes por producto, mismos clientes con teléfono, mismos pedidos por estado y misma suma de importes
      por estado (± redondeo), 0 diferencias no explicadas.
- [ ] Durante un lote la Demo sigue respondiendo (portada < 2 s medida alternando) y ninguna consulta cae por
      `57014`; el ensayo completo deja anotados tiempos por lote y total.
- [ ] `pnpm test:rls` sigue en verde (598+); `typecheck`, `lint`, `test` en verde; un cliente de la tienda A sigue
      sin ver nada de `klaushop`.
- [ ] Klau entra en `klaushop.kshop.fullkod.com/admin` con su cuenta, ve sus productos con fotos y su historial,
      y hace un pedido de prueba de principio a fin (WhatsApp en «Real» solo a los números de prueba).
- [ ] Tras el corte, los pedidos nuevos de Klau's Shop entran en Kshop; klauShop queda en reserva sin recibir pedidos.

### Comportamiento esperado (happy path)
1. Roberto pone `KLAUSHOP_DATABASE_URL` (solo lectura) en `.env.local`. `pnpm klaushop:export` abre una transacción
   `read only`, lee las 14 tablas y guarda `snapshot.json` + `manifest.json` en `.klaushop-snapshot/` (git-ignored,
   lleva teléfonos). Imprime el inventario.
2. `pnpm klaushop:import --only structure` crea la tienda `klaushop` (si no existe) con dueña, plan, zonas, métodos
   de envío y pago, tipo de producto, atributos (Color, Talla, Material), categorías (del árbol de colecciones) y
   secciones de portada.
3. `pnpm klaushop:import --only products --batch 20 --pause 2000` crea cada producto con `save_product` (variantes,
   precios, stock, etiquetas), baja sus fotos del bucket `klaushop`, las convierte (WebP 1600/480) y las sube a
   `store-media/stores/{id}/products/...`; apunta cada id antiguo en `private.legacy_ids`. Entre lotes espera.
4. `--only customers` crea las cuentas (email sintético por teléfono, contraseña aleatoria), direcciones y favoritos.
5. `--only orders` inserta el historial con `import_legacy_order` (nº secuencial nuevo, referencia `KS-xxxx` antigua
   en el evento `imported`), pagos y eventos; sin reservas ni avisos.
6. `pnpm klaushop:verify` imprime la comparación. Se repite el ciclo (`--wipe` + import) hasta que cuadre y los
   tiempos sean aceptables.
7. Día del corte: Klau deja de aceptar pedidos en klauShop, export final, `--delta` (solo lo nuevo desde el último
   snapshot), verify, Klau reparte el stock por variante (Excel), Roberto cambia el dominio con permiso explícito.

---

## Contexto

### Qué hay en klauShop (leído del código, no de su base)
`src/lib/supabase/schema.ts` (Drizzle): `profiles` (id = auth.users, email real, phone opcional, is_admin sin uso),
`products` (precio CUP, `discount` %, `stock` único, `colors/sizes/materials` json, `images` json legado,
`featured_image_id`, `featured`, `show_in_slider`, `badge`, `tags`, `rating`, `collection_id`), `product_medias` →
`medias.key` (bucket público `klaushop`: `${SUPABASE_URL}/storage/v1/object/public/klaushop/${key}`), `collections`
(árbol por `parent_id`, `show_in_home`, imagen), `shipping_zones` (nombre + costo), `address` (zona, dirección,
`is_default`), `orders` (`KS-{shortId}` no secuencial, `order_status` = mismo ciclo que Kshop, `payment_status`
con `no_payment_required`, `customer_data` json, `zone`/`shipping_zone_id`/`shipping_cost`, `payment_method` texto),
`order_lines` (color/talla/material, `list_price`, `discount`), `inventory_reservations` (reserva blanda: el stock
**no** se descuenta hasta pagar), `wishlist`, `comments`, `carts`, `private_config` (OpenWA; no se migra).
Login de clientes: email + contraseña, Google y GitHub. Admin: `app_metadata.isAdmin`. RLS 0018: `anon` no lee
pedidos ni perfiles → el volcado va por `DATABASE_URL` (patrón `klauShop/.titan/memory/reference/acceso-bd-sin-mcp.md`).

### Qué reutiliza de Kshop
- `public.create_store(...)` (`20261024120100`), `subscription_update` / grants (Fase 5), `scripts/seed-demo-store.mjs`
  como patrón de script idempotente con `service_role`.
- `public.save_product(p_store_id, p_payload, p_user_id)` (Fase 1): mismo payload que el importador de Excel; crea
  variantes, precios, stock inicial (movimientos) y etiquetas. `import_product` **no** (espera filas de Excel).
- `apps/web/src/server/catalog/remote-images.ts`: tamaños y layout de `store-media` que el script debe replicar
  (sharp es devDependency de la raíz; el módulo es `server-only`, así que se copia la parte de sharp, no el guard SSRF).
- `apps/web/src/server/customers/accounts.ts`: `syntheticEmail(storeId, phone)` = `c_{sha256(store:phone)[0..24]}@
  customers.kshop.fullkod.com` y el `app_metadata` de `registerCustomer`; `@kshop/core` `orders/phone` (E.164, Cuba).
- Órdenes: `store_order_counters`, `order_events`, `payments`; los avisos WhatsApp se encolan **dentro** de
  `checkout_create_order` / `order_transition`, no por trigger → inserciones directas no avisan.
- `customer_favorites` (wishlist), `shipping_zones` + `shipping_methods` (`delivery` con precio por zona, `to_agree`),
  `payment_methods`, `promotions` (Fase 4) para el `discount` %, `home_sections`/colecciones (Fase 2/R9).
- Módulo `custom_domain` + `store_domains` + `server/custom-domains.ts` (Vercel en modo simulado hasta tener token).

### Decisiones propuestas (Roberto confirma o cambia)
| # | Decisión | Por qué |
|---|----------|---------|
| D1 | **Acceso a klauShop solo lectura**: `KLAUSHOP_DATABASE_URL` en `.env.local`, transacción `set transaction read only`; nunca `service_role` de klauShop en Kshop ni al revés | Regla de `fuentes.md`; una transacción read-only no puede escribir ni por error |
| D2 | **Snapshot en disco** (`.klaushop-snapshot/`, git-ignored): el import lee del JSON, no de la base de klauShop | Lotes repetibles sin volver a cargar la producción de klauShop; el delta compara snapshots |
| D3 | **Mapa de ids en la BD**: `private.legacy_ids (store_id, entity, legacy_id, new_id, unique)` | Idempotencia y reanudación sin ficheros frágiles; `verify` y `--delta` lo consultan por SQL |
| D4 | **Catálogo**: un tipo de producto «Ropa y accesorios» con atributos Color, Talla y Material como **selección de variante**; una variante por combinación presente en los arrays (producto sin opciones = variante por defecto); SKU `KS-{shortId}[-COLOR][-TALLA][-MAT]`; slug y nombre se conservan | Es el modelo Saleor de Kshop; conserva URLs de producto (`/products/{slug}`) |
| D5 | **Stock por variante**: klauShop tiene un stock por producto. Si el producto tiene **una sola** combinación, esa variante recibe el stock; si tiene varias, las variantes nacen con **0** y el stock del producto queda en el informe (`stock_to_split.xlsx` generado con la plantilla del Excel de Kshop) para que Klau lo reparta **antes del corte** con el importador en modo `upsert` | Repartir a ciegas (todo en la primera, o el total en cada una) vende lo que no hay; Klau es la única que sabe cuántas tallas tiene |
| D6 | **Stock = `stock` − reservas `active`** en el snapshot del corte | En klauShop la reserva blanda no descuenta; en Kshop los pedidos históricos no reservan |
| D7 | **Precio y descuento**: `price` = precio de lista de klauShop en CUP (moneda base CUP); el `discount` % se convierte en **promociones automáticas por porcentaje** («Rebaja 20 %», targets = esos productos) | Klau sigue viendo la rebaja como una oferta editable; el motor de precios de Kshop calcula el tachado |
| D8 | **Colecciones de klauShop → categorías** de Kshop (mismo árbol, misma imagen); `show_in_home` → sección de portada por categoría; `featured` / `badge` / `show_in_slider` → colecciones «Destacados», «Novedades», «Más vendidos» y el carrusel de portada; `tags` → `product_tags`; `rating`/`comments` **no se migran** (Kshop no tiene reseñas) | En klauShop «colección» hace de categoría; la portada v2 ya trabaja con categorías y colecciones |
| D9 | **Clientes**: cuenta en Kshop solo para perfiles con **teléfono** (normalizado E.164, Cuba por defecto); contraseña aleatoria → recuperan con el código por WhatsApp; email real a `customers.email`; dos perfiles con el mismo teléfono se funden en uno (el más reciente manda, se anota en el informe). Sin teléfono: **no** se crea cuenta; sus pedidos entran igual (snapshot de nombre/teléfono del pedido) | Kshop identifica al cliente por teléfono (decisión 23); las contraseñas de klauShop no sirven (otro identificador, y los de Google/GitHub no tienen) |
| D10 | **Pedidos**: se migra **todo el historial** con función SQL `import_legacy_order` (service_role): nº nuevo del contador en orden cronológico, `KS-xxxx` antiguo en el evento `imported` y en `legacy_ids`; líneas con snapshot (nombre, atributos, precios) enlazadas a la variante nueva cuando existe; `payment_status` `no_payment_required` → `unpaid` + nota; pedidos `paid` con un `payments` por el total; **sin** reservas, stock ni avisos | Klau conserva su historial y Finanzas lo ve; nada dispara WhatsApp |
| D11 | **Lotes**: `--batch` (20 productos / 50 clientes / 50 pedidos por defecto), `--pause 2000` ms entre lotes, imágenes 3 en paralelo, parada al primer error (reanudable); se corre **en local** contra el Supabase online, fuera de builds/QA, con la Demo como testigo de latencia | La Nano se estrangula con ráfagas; procesar imágenes en el portátil no cuesta CPU de la base |
| D12 | **Ensayos en la tienda real** `klaushop` con `--wipe` (borra la tienda y sus datos; `stores` cascada) y se repite; no se crea tienda de ensayo aparte | Menos piezas; la cuenta de la dueña y el slug quedan reservados desde el primer ensayo |

### Preguntas abiertas (necesarias antes de implementar)
1. **Dueña**: email real de Klau para la cuenta `owner` (y si Roberto/Claudia van también como `admin`).
2. **Plan y cobro**: Pro con grant de fundadora (`free_days`/`price_lock`) o cortesía (`comped`) como la Demo.
3. **Dominio actual de klauShop** y a dónde apunta (Vercel): ¿se cambia el DNS a `klaushop.kshop.fullkod.com`
   (CNAME / módulo `custom_domain`) o basta el subdominio al principio? Siempre con permiso explícito en el corte.
4. **Pedidos abiertos el día del corte** (`pending_*`, `paid`, `processing`, `shipped`): ¿Klau los cierra antes en
   klauShop, o se importan como historial sin reserva (propuesta)?
5. **Enlaces antiguos** `/order/{id}` que están en WhatsApps enviados: ¿se deja un redirect en klauShop (tocarla) o
   se asume que caducan?
6. Confirmar D5 (stock por variante vía Excel) y D9 (clientes sin teléfono sin cuenta).

### Arquitectura propuesta
```
scripts/klaushop/
├── export.mjs      # pnpm klaushop:export  — read-only → .klaushop-snapshot/{snapshot,manifest}.json + inventario
├── import.mjs      # pnpm klaushop:import  — --only structure|products|customers|orders|all --batch --pause
│                   #   --dry-run --resume (por defecto) --delta --wipe
├── verify.mjs      # pnpm klaushop:verify  — comparación origen/destino + stock_to_split.xlsx
└── lib/            # mapeos (producto → payload save_product, zona, estado, teléfono), imágenes (sharp), legacy map
supabase/migrations/2026110700xxxx_klaushop_migration.sql
├── private.legacy_ids                      # mapa id antiguo → nuevo (solo service_role)
└── public.import_legacy_order(...)         # security definer, execute solo service_role; sin reservas ni avisos
supabase/tests/12_legacy_import_isolation.test.sql   # la tienda B no ve legacy_ids ni los pedidos importados de A
.klaushop-snapshot/   (git-ignored)         # datos personales: nunca al repo
```
Env (`.env.local`, plantilla en `.env.example`): `KLAUSHOP_DATABASE_URL`, `KLAUSHOP_STORAGE_PUBLIC_URL`
(`https://…supabase.co/storage/v1/object/public/klaushop`), `KLAUSHOP_OWNER_EMAIL`.

### Modelo de datos (solo lo nuevo)
```sql
create table private.legacy_ids (
  store_id uuid not null references public.stores (id) on delete cascade,
  entity text not null check (entity in ('product','variant','media','collection','customer','address','order','order_line','zone')),
  legacy_id text not null,
  new_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (store_id, entity, legacy_id)
);
-- fuera de public: pg_graphql no la ve; sin grants a anon/authenticated.

create function public.import_legacy_order(p_store_id uuid, p_payload jsonb, p_user_id uuid) returns jsonb
-- inserta orders (número del contador), order_lines (+ order_line_costs si hay costo), payments, order_events
-- ('imported' con legacy_id y KS-xxxx); nunca toca stocks, inventory_reservations ni notification_log.
-- revoke all from public, anon, authenticated; grant execute to service_role.
```

---

## Blueprint (fases)

> Solo fases. Las subtareas se generan al entrar en cada una con `tf-bucle-agentico`.

### Fase 8.1: Volcado de solo lectura e inventario
**Objetivo**: `pnpm klaushop:export` lee klauShop en una transacción read-only y deja snapshot + manifest +
informe de inventario (conteos, combinaciones por producto, clientes sin teléfono / duplicados, pedidos por estado,
zonas, imágenes por producto). Con esos números Roberto cierra las preguntas abiertas.
**Validación**: carpeta git-ignored con los JSON; `git status` limpio; klauShop sin cambios (ninguna escritura
posible); conteos revisados con Klau.

### Fase 8.2: Cimientos de la migración (BD + tienda)
**Objetivo**: migración SQL (`private.legacy_ids`, `import_legacy_order`) con su test de aislamiento; `import --only
structure` crea la tienda `klaushop` (dueña, plan/grant, CUP, prefijo `KS`, WhatsApp, logo/tema), zonas y métodos
de envío/pago, tipo de producto, atributos, categorías y secciones de portada. `--wipe` la deja como no existía.
**Validación**: `pnpm db:migrate`, `pnpm test:rls` en verde, `db:graphql-schema && codegen` sin diff (nada nuevo en
`public` legible); la tienda abre en `klaushop.kshop.localhost:3000` y en `/admin` con la dueña.

### Fase 8.3: Catálogo por lotes
**Objetivo**: productos → `save_product` (variantes D4, stock D5/D6, precios D7, etiquetas), imágenes del bucket
`klaushop` → `store-media` con los tamaños de Kshop, colecciones/portada D8, `legacy_ids` por producto, variante y
media; promociones por porcentaje; `--dry-run`, `--resume`, `--batch`, `--pause`.
**Validación**: dos ejecuciones seguidas no duplican nada; cortar a mitad y reanudar termina igual; `verify` cuadra
productos, variantes, imágenes y suma de stock; la portada y la ficha de `klaushop` se ven con fotos; tiempos por
lote anotados y la Demo respondiendo durante la carga.

### Fase 8.4: Clientes, direcciones y favoritos por lotes
**Objetivo**: cuentas con email sintético por teléfono (D9) y `app_metadata` idéntico al de `registerCustomer`,
`customers`, `customer_addresses` (zona mapeada por nombre), `customer_favorites`; informe de fusionados y de
perfiles sin teléfono.
**Validación**: un cliente migrado recupera el acceso con el código por WhatsApp (modo «Simulado») y ve sus
favoritos y direcciones; `verify` cuadra clientes con teléfono; test de aislamiento sigue en verde.

### Fase 8.5: Historial de pedidos por lotes
**Objetivo**: `import_legacy_order` por cada pedido en orden cronológico (D10), líneas enlazadas a la variante
nueva cuando la combinación existe, pagos de los `paid`, evento `imported`; `--delta` importa solo lo que no está en
`legacy_ids`.
**Validación**: `verify` cuadra pedidos por estado y suma de importes por estado; ningún `notification_log` nuevo;
ninguna reserva ni movimiento de stock creado; Finanzas › Resumen de `klaushop` muestra el histórico; el detalle de
un pedido en el admin y en la cuenta del cliente coincide con klauShop.

### Fase 8.6: Ensayo general y medición en la Nano
**Objetivo**: `--wipe` + `all` de principio a fin con los lotes por defecto, midiendo tiempo total, tiempo por lote
y latencia de la Demo alternando; ajustar `--batch`/`--pause`; QA en navegador en `klaushop` (`pnpm qa:klaushop`,
capturas en `.titan/qa/fase-8/`): portada, categoría, ficha con variantes, compra completa, admin, Finanzas.
**Validación**: criterios de éxito 1–5 cumplidos; informe de tiempos en el PRP; `typecheck`, `lint`, `test`,
`test:rls` en verde; WhatsApp vuelto a «Real».

### Fase 8.7: Corte (solo con permiso explícito de Roberto)
**Objetivo**: ventana acordada con Klau: klauShop deja de aceptar pedidos, export final, `--delta` (clientes y
pedidos nuevos), `verify`, Klau reparte el stock por variante (Excel `upsert`), dominio cambiado (pregunta 3),
klauShop en reserva N días.
**Validación**: primer pedido real entra en Kshop con aviso WhatsApp real a Klau; `verify` final 0 diferencias;
memoria y `arranque-y-fases.md` actualizados; nota en `.titan/memory/project/` con lo que quedó fuera.

---

## 🧠 Aprendizajes (Self-Annealing)

> Crece durante la implementación. El mismo error nunca dos veces.

- **2026-10-28 · el import mandó WhatsApp reales.** La premisa «los avisos se encolan dentro de `checkout_create_order` /
  `order_transition`, no por trigger» era **falsa**: `private.order_event_notify` es un constraint trigger diferido en
  `order_events` que avisa a la tienda y al cliente por cada evento no interno `created` / `payment_recorded`. Con
  WhatsApp en «Real», el primer import envió 5 avisos a la tienda (número de prueba de Roberto) y 5 «pedido recibido» a
  3 clientes reales de klauShop (pedidos 1001–1005); los otros 32 se marcaron `skipped` antes de salir. El test 13 no lo
  vio porque el trigger diferido solo dispara al commit y los tests hacen rollback. **Fix**: `20261107100100` (eventos
  importados internos, `notify_customer = false`), test con `set constraints all immediate` y avisos activados, y control
  en rollback que prueba que un evento no interno sí encola. **Regla**: cualquier import o script que inserte en
  `orders`/`order_events` corre con WhatsApp en «Simulado», y sus tests fuerzan los triggers diferidos.

---

## Gotchas

- [ ] **Nunca escribir en klauShop**: la conexión del export va en transacción `read only`; ningún script de Kshop
      recibe la `service_role` de klauShop. `KLAUSHOP_DATABASE_URL` es producción.
- [ ] El snapshot lleva teléfonos y emails reales: carpeta git-ignored, no a Tasknic, no a la memoria.
- [ ] No usar `checkout_create_order` ni `order_transition` para el historial (reservan stock y encolan WhatsApp).
      El import inserta con `import_legacy_order`; comprobar al final que `notification_log` no creció.
- [ ] WhatsApp en «Real»: los **pedidos de prueba** en `klaushop` (QA) van con «Simulado» y luego «Real»; el import
      en sí no envía nada.
- [ ] Teléfonos de klauShop sin `+53` o con espacios: normalizar con el helper de `@kshop/core` antes del email
      sintético; dos perfiles con el mismo teléfono normalizado chocan con `unique (store_id, phone)` (D9).
- [ ] `save_product` exige SKU único por tienda y slugs `^[a-z0-9]+(-[a-z0-9]+)*$`: validar los slugs de klauShop y
      los de categorías antes del lote (dry-run los lista).
- [ ] `hasModule` se cachea 1 min por tienda: tras conceder plan/grants a `klaushop`, esperar o `expireStoreCaches`
      antes de pedir el módulo por la API (los `e2e` ya lo hacen por la API del superadmin).
- [ ] Nano: nunca lanzar un lote durante `pnpm build`, `e2e:*` o `qa:*`; medir alternando (la primera ejecución tras
      una tanda cuesta hasta 6×). `--pause` es la válvula, no el tamaño del lote solo.
- [ ] Imágenes: klauShop guarda `medias.key` (ruta en el bucket público) y `products.images` legado; la verdad es
      `product_medias` + `featured_image_id`. Reusar los mismos tamaños que `remote-images.ts` (WebP 1600/480).
- [ ] `store_order_counters` empieza en 1001: importar en orden cronológico para que el nº crezca con la fecha; el
      `created_at` original se conserva (la función lo acepta en el payload).
- [ ] `--wipe` borra la tienda entera (cascada) **y** los objetos de `store-media/stores/{id}/`: confirmar slug antes;
      jamás apuntar al `demo`.
- [ ] Dominio y DNS solo en 8.7 y con permiso; `custom_domain` real necesita `VERCEL_DOMAINS_TOKEN` y Vercel Pro
      (pendiente de Fase 6).

## Anti-patrones

- NO migrar «en caliente» leyendo klauShop en cada lote: siempre desde el snapshot.
- NO repartir el stock por variante a ciegas (ni todo en la primera ni el total en cada una).
- NO crear una segunda vía de alta de clientes: mismo email sintético y `app_metadata` que `registerCustomer`.
- NO saltarse `save_product` con inserts directos en el catálogo (triggers de resumen, límites y movimientos).
- NO subir la instancia «por si acaso»: se mide en 8.6 y Roberto decide con números.
- NO versionar datos personales ni credenciales; NO tocar klauShop ni el DNS sin permiso explícito.

---

*PRP pendiente de aprobación. No se ha modificado código.*
