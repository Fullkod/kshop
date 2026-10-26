# PRP-6: Pro — finanzas, multi-almacén, multimoneda y dominio propio

> **Estado**: EN CURSO (2026-10-26): 6.1–6.3 hechas; **pausado por Roberto** antes de la 6.4 (dominio propio). APROBADO con las respuestas de Roberto (ver «Decisiones de Roberto»)
> **Fecha**: 2026-10-26
> **Proyecto**: Kshop
> **Fase**: 6 (ver `arranque-y-fases.md`). Código de partida: commit `f33e8eb` (Fase 5 cerrada)

---

## Objetivo

Completar los cuatro módulos que se venden en el plan Pro (o sueltos a 3 USD/mes): **Finanzas** (ventas, cobros y
margen por moneda, inventario valorado, exportación), **Multi-almacén** (qué almacén sirve cada zona, transferencias,
historial de stock), **Multimoneda** (gestión de tasas con historial y el costo con su tasa congelada) y **Dominio
propio** (la tienda se sirve en `mitienda.com` con SSL y redirecciones), con la comprobación en UI, API y BD que ya
usan los demás módulos.

## Por Qué

| Problema | Solución |
|----------|----------|
| El dueño solo ve «Ventas de hoy»; no sabe cuánto vendió en la semana o el mes **por moneda**, cuánto ganó ni cuánto dinero tiene parado en el almacén (decisión 16, `modulos-y-planes.md` § Módulo Finanzas) | Módulo `finance`: informes por periodo y por moneda (tal como se cobró + equivalente en moneda base con la tasa de cada orden), margen, inventario valorado, desglose y exportación |
| El margen no se puede calcular bien: `order_line_costs` guarda costo y moneda del costo, pero **no la tasa** de esa moneda al vender (un costo en USD de una venta en CUP depende de la tasa de aquel día) | Snapshot `cost_rate_to_base` en la línea al crear la orden + relleno de las órdenes viejas con `currency_rate_history` |
| Hoy el multi-almacén es solo «stock por almacén» en el editor: el checkout reserva de cualquier almacén activo (el de por defecto primero), no hay transferencias ni historial visible, y no se sabe qué almacén sirve qué zona | `warehouse_shipping_zones` (zona → almacenes con prioridad), reserva según la zona o el punto de recogida, transferencias con dos movimientos, pantalla «Almacenes» con stock por almacén y movimientos |
| Multimoneda funciona desde la Fase 1–3 (monedas de venta, overrides, selector, orden con tasa), pero la tasa se cambia escondida en Catálogo › Monedas y su historial (`currency_rate_history`) no se ve | Pantalla del módulo «Monedas»: tasa actual, cambio rápido, historial, aviso de cuántos precios fijos (overrides) hay por moneda |
| «Dominio propio» se vende desde la Fase 5 pero el superadmin «lo configura a mano» y el proxy devuelve 404 a cualquier host que no sea `*.kshop` | Resolución por `store_domains` en el proxy, alta y verificación del dominio, redirecciones y enlaces (WhatsApp, sitemap, canonical) con el dominio principal |

**Valor de negocio**: son los argumentos de venta del Pro (12 USD frente a 5 del Base) y de los módulos sueltos.
klauShop (tienda nº 1 en la Fase 8) necesita al menos Finanzas y multimoneda; el dominio propio es lo que más
pide una tienda «seria».

## Qué

### Criterios de Éxito
- [ ] `pnpm db:migrate` sin errores; advisors sin avisos nuevos; `pnpm db:graphql-schema && pnpm codegen` OK.
- [ ] `pnpm test:rls` en verde con la suite nueva `08_pro_isolation`: el staff de B no ve informes, gastos,
  movimientos, transferencias, zonas de almacén ni dominios de A; las funciones de informes solo las llama
  `service_role` y la API exige owner/admin + módulo `finance`; anon solo resuelve dominios **verificados** de
  tiendas activas con el módulo (y solo obtiene el slug).
- [ ] **Los informes cuadran con las órdenes** (criterio de la fase): en una tienda temporal con órdenes en CUP, USD
  y EUR (pagadas, parciales, canceladas, reembolsadas, con descuentos y envío) el informe del periodo da, por moneda,
  exactamente las sumas que una consulta directa sobre `orders`, `payments` y `refunds`; el equivalente en moneda
  base usa la tasa de cada orden (cambiar la tasa hoy no altera el informe de ayer); el margen coincide con el
  calculado a mano con los costos y tasas de la prueba; cortes de día en `America/Havana`.
- [ ] **Multi-almacén**: con dos almacenes que sirven zonas distintas, un pedido a la zona 1 reserva del almacén 1;
  una transferencia de 5 unidades deja dos movimientos (`transfer_out`/`transfer_in`) y no puede dejar stock
  negativo ni mover lo reservado; dos transferencias simultáneas de la última unidad → una falla.
  **Sin el módulo**, la tienda vende y reserva solo del almacén por defecto y los demás se ven en solo lectura.
- [ ] **Multimoneda**: cambiar la tasa del USD guarda historial, cambia los precios convertidos de la tienda pública
  (los overrides no) y no toca ninguna orden existente.
- [ ] **Dominio propio**: con un dominio de prueba en local (`mitienda.localhost:3000`), la tienda se ve en ese
  host; el subdominio redirige (308) al dominio principal salvo `/admin`; `/admin` en el dominio propio lleva al
  subdominio; los enlaces de los avisos, el sitemap y el canonical usan el dominio principal; quitar el módulo hace
  que el dominio deje de resolver y todo vuelva al subdominio sin perder la configuración.
- [ ] `pnpm e2e:pro` y `pnpm qa:pro` en verde (capturas en `.titan/qa/fase-6/`, 390 px y escritorio);
  `pnpm typecheck`, `lint`, `test`, `build` pasan; suites RLS, E2E y QA de las fases 0b–5 siguen en verde.

### Comportamiento Esperado (Happy Path)

1. **Finanzas › Resumen** (owner/admin): elige periodo (hoy, 7 días, mes, rango). Ve por moneda «Vendido»
   (45 000 CUP · 120 USD · 50 EUR), «Cobrado», «Pendiente de cobro», nº de pedidos, ticket medio y la comparación
   con el periodo anterior; una fila «Equivalente» en la moneda base. Gráfico simple de ventas por día.
2. **Finanzas › Margen**: ingresos (sin envío) − costo de lo vendido = margen, en moneda base, por producto,
   categoría y marca; las líneas sin costo cargado se cuentan aparte («12 líneas sin costo: margen incompleto»).
3. **Finanzas › Inventario**: unidades en stock, reservadas y disponibles por almacén; valor a costo y a precio de
   venta; agotados, bajo mínimo y sin movimiento en N días; enlace a los movimientos de cada variante.
4. **Finanzas › Desglose**: por método de pago, zona de entrega, canal (web/app/admin) y moneda.
5. **Exportar**: cada informe a Excel (una hoja por vista, mismos números que la pantalla).
6. **Almacenes** (módulo `multi_warehouse`): lista de almacenes con stock total y valor; para cada uno, qué
   zonas de entrega sirve y en qué orden; **Transferir** (variante, de, a, cantidad, nota); **Movimientos** con
   filtros (almacén, tipo, fecha, producto). Al comprar, la tienda reserva del almacén que sirve la zona elegida
   (o del punto de recogida); si no hay bastante, de los siguientes según prioridad.
7. **Monedas** (módulo `multi_currency`): monedas de venta y de costo, tasa actual con «Actualizar tasa», historial
   con quién y cuándo, redondeo, cuántos productos tienen precio fijo en esa moneda.
8. **Dominio propio** (módulo `custom_domain`): el dueño escribe `mitienda.com`; ve los registros DNS a poner en
   su proveedor (A / CNAME) y el estado («Esperando DNS», «Verificado», «Certificado listo»); al verificarse, la
   tienda responde en `mitienda.com` y `mitienda.kshop.fullkod.com` redirige allí.

---

## Contexto

### Referencias
- `.titan/memory/project/modulos-y-planes.md` — § Multi-almacén (asignación por zona, sin dividir pedidos en el MVP)
  y § Módulo Finanzas (ventas por moneda, inventario, margen, gastos, cierre de caja, `daily_sales`).
- `.titan/memory/project/tenancy-dominios-auth.md` — dominio propio con la Vercel Domains API, `verified_at`.
- `.titan/memory/project/modelo-de-datos.md` §3–§4 (`warehouse_shipping_zones`, `stock_movements`, monedas, tasas).
- `.titan/memory/project/decisiones.md` — 4 (tasa manual del dueño), 16 (qué va en Pro), 17 (sin MLC), 18 (costo en
  otra moneda), 25 (dominio propio vendible ya, configurado a mano).
- Código actual (commit `f33e8eb`):
  - `supabase/migrations/20261025100000_catalog_schema.sql` — `store_currencies` (`rate_to_base`, `rounding`,
    `sells`), `currency_rate_history`, `variant_prices`, `variant_costs`, `warehouses`, `stocks`
    (`low_stock_threshold`), `stock_movements` (enum con `transfer_in`/`transfer_out` sin usar), triggers de módulo.
  - `supabase/migrations/20261027100000_orders_schema.sql` — `orders` (`currency`, `exchange_rate`, `warehouse_id`,
    `payment_status`, `paid_total`), `order_lines`, `order_line_costs` (**sin tasa**), `inventory_reservations`,
    `payments`, `refunds`; índices `(store_id, created_at desc)`.
  - `supabase/migrations/20261029100300_pricing_engine.sql` / `…20261030100300_checkout_notify_customer.sql` —
    última versión de `checkout_create_order` (reserva repartida: por defecto primero, luego los demás activos).
  - `supabase/migrations/20261027100600_sales_today.sql` — patrón de informe (`service_role`, día en `America/Havana`).
  - `supabase/migrations/20261030100200_notifications_engine.sql` — `private.store_public_url` (ya usa el dominio
    `is_primary`, pero **no** comprueba `verified_at` ni el módulo).
  - `supabase/migrations/20261024120000_platform_schema.sql` — `store_domains` (`type`, `is_primary`,
    `verified_at`, `vercel_status`).
  - `apps/web/src/proxy.ts` — los hosts `custom` van a 404 («Custom domains arrive in Phase 6»);
    `packages/core/src/host.ts` (`parseHost`, `storeOrigin`), `apps/web/src/lib/format.ts`,
    `server/storefront/page-helpers.ts`, `server/team.ts`, `server/platform-stores.ts` (enlaces con el subdominio).
  - `apps/web/src/features/{finance,multi-warehouse,multi-currency,custom-domain}/module.ts` — solo el registro
    (`availableInPhase: 6`); la página genérica `admin/[module]/page.tsx` los muestra como «próximamente».
  - Catálogo › Almacenes y Monedas (`features/catalog`, `api/v1/stores/{id}/catalog/{currencies,stock}`),
    `ProductEditor` (precios por moneda, stock por almacén), `server/catalog/excel.ts` (Excel solo con precio base).
- Skills: `tf-supabase`, `supabase`, `supabase-postgres-best-practices`, `tf-playwright-cli`.

### Decisiones técnicas propuestas (Roberto confirma o cambia)

**Finanzas**

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D1 | **Qué es «vendido»** | Dos vistas siempre juntas: **Vendido** = pedidos no cancelados por fecha de creación (lo mismo que «Ventas de hoy», para que no se contradigan) y **Cobrado** = `payments − refunds` por fecha de cobro. «Pendiente de cobro» = total − pagado de los pedidos vendidos no cancelados | Contar solo pedidos pagados (más «contable», pero un pedido confirmado y sin cobrar desaparece del informe) |
| D2 | **Moneda de los informes** | Cada importe **en la moneda en que se vendió/cobró**, sin mezclar; más una fila «Equivalente en {moneda base}» con la tasa congelada de cada orden (`orders.exchange_rate`). Los pagos en otra moneda que la de su orden se convierten con la tasa de la orden | Todo convertido a una sola moneda (oculta lo que de verdad hay en caja por moneda) |
| D3 | **Costo con su tasa** | Columna nueva `order_line_costs.cost_rate_to_base` rellenada por `checkout_create_order` (tasa del `store_currencies` de la moneda del costo en ese momento). Relleno de las órdenes existentes con la última tasa de `currency_rate_history` anterior a la orden (o la actual si no hay historial). Margen por línea en moneda base = `line_total × exchange_rate − unit_cost × quantity × cost_rate_to_base` | Convertir el costo con la tasa de hoy (el margen de meses pasados cambiaría cada vez que cambia la tasa) |
| D4 | **Descuentos y envío en el margen** | El descuento del pedido (`discount_total`) se reparte entre sus líneas en proporción a su importe; el envío **no** cuenta como ingreso de producto (se muestra como «Ingresos por envío» aparte). Líneas sin costo: se excluyen del margen y se cuentan | Margen solo por pedido completo (no se puede ver por producto) |
| D5 | **Cálculo** | Funciones SQL `finance_*` (`stable`, `service_role`, `p_store_id`, `p_from`, `p_to`, día en `America/Havana`) sobre las tablas existentes con sus índices `(store_id, created_at)`. **Sin tabla resumen** (`daily_sales`) por ahora: medir con 20 000 órdenes sintéticas en una tienda temporal y crearla solo si una vista pasa de ~300 ms | Tabla `daily_sales` mantenida por triggers desde el principio (más piezas y riesgo de que se desajuste) |
| D6 | **Inventario** | `finance_inventory(store_id, warehouse_id?)`: por variante y almacén: cantidad, reservada, disponible, valor a costo (en moneda base, tasa actual) y a precio de venta, bajo mínimo (`low_stock_threshold`), días sin movimiento (último `stock_movements`). Paginado y con filtros | Solo totales (no ayuda a decidir qué comprar) |
| D7 | **Gastos manuales** | Tabla `expenses` (store_id, date, category, amount, currency, note, created_by) y «Ganancia neta = margen − gastos» por moneda. **Ver pregunta 2** | Dejarlo fuera (el informe se queda en margen bruto) |
| D8 | **Exportar** | Excel con ExcelJS (ya en el proyecto): `GET /api/v1/stores/{id}/finance/export?view=…&from=…&to=…`, mismos números que la pantalla | CSV (más simple, peor para el dueño con tildes y monedas) |
| D9 | **Gráficos** | Barras y líneas propias en SVG/CSS dentro de `@kshop/ui` (dos componentes) sin dependencia nueva; sirven también para la app (Fase 7) | Recharts (~100 KB más; más bonito y con tooltips) |
| D10 | **Quién lo ve** | owner/admin (hay costos y márgenes). El staff no ve Finanzas; sigue viendo «Ventas de hoy» si la tienda la tiene | Staff ve Resumen sin margen |

**Multi-almacén**

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D11 | **Zona → almacenes** | Tabla `warehouse_shipping_zones` (store_id, warehouse_id, zone_id, priority). Sin filas para una zona = la sirven todos los activos (lo que pasa hoy, nada se rompe al activar el módulo) | Un solo almacén por zona (columna en `shipping_zones`) |
| D12 | **Reserva al comprar** | `checkout_create_order` (y «Nuevo pedido» del admin) reserva primero en el punto de recogida elegido o en los almacenes de la zona por prioridad; si no alcanza, **reparte** entre ellos (ya se reparte hoy desde la Fase 3); solo si ninguno de la zona tiene, «Solo quedan N». `orders.warehouse_id` = el que más aporta. **Ver pregunta 4** | Un único almacén por pedido (como decía `modulos-y-planes.md`; obliga a rechazar pedidos que sí se podrían servir) |
| D13 | **Módulo apagado** (hueco a cerrar) | Sin `multi_warehouse` la tienda vende y reserva **solo del almacén por defecto**, y `stock_available` de la tienda pública cuenta solo ese almacén; los otros se ven en solo lectura. Hoy el checkout reserva de todos los activos aunque el módulo esté apagado: se corrige y se prueba (tienda Pro → Base → Pro) | Dejarlo como está (una tienda que baja de plan seguiría usando el multi-almacén) |
| D14 | **Transferencias** | `transfer_stock(store_id, variant_id, from, to, qty, note, user_id)`: `for update` de las dos filas de `stocks` en orden fijo (sin deadlocks), no mueve lo reservado, dos `stock_movements` con un `transfer_id` común. Inmediata, sin estado «en tránsito». Transferencia de varias variantes a la vez desde la pantalla (una llamada por lote, una transacción) | Documentos de transferencia con estados (enviado/recibido) |
| D15 | **Movimientos** | Lectura por pg_graphql de `stock_movements` (ya con RLS de staff) con filtros; se muestra quién, cuándo, tipo, pedido o importación de origen | Pantalla solo para owner/admin |

**Multimoneda**

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D16 | **Pantalla del módulo** | `admin/multi-currency`: tasas con «Actualizar», historial (`currency_rate_history`), redondeo, monedas de venta y nº de precios fijos por moneda. Catálogo › Monedas se queda para la moneda base y las monedas de **costo** (eso es Base); las de venta se gestionan aquí | Dejar todo en Catálogo › Monedas y solo añadir el historial |
| D17 | **Cambio de tasa** | Cambia solo los precios convertidos (base × tasa + redondeo); los overrides de `variant_prices` y las órdenes existentes no se tocan. Invalida la caché del catálogo de la tienda (`store:{id}:catalog`). Aviso en la pantalla: «N productos tienen precio fijo en USD y no cambiarán» | Recalcular también los overrides (rompe la idea de «precio fijo») |
| D18 | **Excel** | Columnas opcionales «Precio {moneda}» por moneda de venta y «Stock {almacén}» por almacén en plantilla, exportación e importación, solo si la tienda tiene el módulo. **Ver pregunta 6** | Sin cambios en el Excel (precios por moneda y stock por almacén solo uno a uno en el editor) |

**Dominio propio**

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D19 | **Resolución en el proxy** | `parseHost` ya devuelve `custom`. El proxy llama a una RPC pública `resolve_store_domain(host)` (anon, devuelve solo el slug de un dominio `verified_at not null` de una tienda con `custom_domain`) y guarda el resultado en memoria del proceso 60 s (también los «no existe», para no consultar en cada bot). Luego hace el mismo rewrite a `/s/{slug}` que un subdominio: cachés, tags y páginas no cambian | Vercel Edge Config (otro servicio y otra sincronización) o un `store_domains` cacheado con `use cache` en una ruta intermedia |
| D20 | **Alta y verificación** | El dueño pide el dominio en `admin/custom-domain`; el servidor lo añade al proyecto de Vercel (`POST /v10/projects/{id}/domains`, también `www.` con redirección al apex), guarda los registros DNS que devuelve Vercel y los muestra; «Comprobar» consulta Vercel (`GET /v9/projects/{id}/domains/{d}` + `GET /v6/domains/{d}/config`) y al quedar verificado y bien configurado pone `verified_at`. El superadmin ve y gestiona todos los dominios. Variables `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` en el servidor. **Ver pregunta 7** | Seguir a mano: el superadmin añade el dominio en el panel de Vercel y en Kshop solo marca «Verificado» |
| D21 | **Dominio principal y redirecciones** | Un dominio propio por tienda (+ su `www`). Al verificarse pasa a `is_primary`; la tienda pública en el subdominio responde 308 al dominio propio (misma ruta y query) **excepto** `/admin` y `/api`. Origen público único `storePublicOrigin(store)` en TS y `private.store_public_url` en SQL (que pasa a exigir `verified_at` y el módulo) para avisos, sitemap, robots, canonical, enlaces de pedido y de invitación | Servir en los dos hosts sin redirección (contenido duplicado para Google) |
| D22 | **Admin y sesiones** | El admin vive **solo en el subdominio**: `/admin` en el dominio propio redirige a `{slug}.kshop.fullkod.com/admin` (la sesión del staff es por origen y las URLs de Supabase Auth ya permiten `*.kshop`). Los clientes inician sesión en el dominio propio por la API (`/api/v1/…`, sin cookies de Supabase), así que no hace falta nada en Supabase Auth | Admin también en el dominio propio (hay que añadir cada dominio a las redirect URLs de Supabase Auth) |
| D23 | **Módulo apagado o tienda suspendida** | El dominio queda guardado pero `resolve_store_domain` deja de devolverlo → el proxy redirige al subdominio (que muestra la tienda o el aviso de suspendida); al reactivar vuelve solo. No se borra de Vercel | Quitar el dominio de Vercel al bajar de plan (rompe el SSL al volver) |
| D24 | **Pruebas en local** | Chrome resuelve cualquier `*.localhost`: `mitienda.localhost:3000` es un host `custom` para `parseHost` → se prueba toda la resolución y las redirecciones sin DNS. La llamada a Vercel se aísla en `server/vercel-domains.ts` con un modo `dry_run` (sin token) que simula «verificado» para E2E | Probar solo en Vercel con un dominio real |

### Arquitectura Propuesta

```
supabase/
├── migrations/
│   ├── 2026110110xxxx_pro_schema.sql          warehouse_shipping_zones, order_line_costs.cost_rate_to_base
│   │                                            (+ relleno), expenses, stock_movements.transfer_id, store_domains
│   │                                            (status, dns_records jsonb, requested_by, checked_at), RLS y grants
│   ├── …_warehouse_engine.sql                  transfer_stock, set_warehouse_zones, checkout_create_order con zona
│   │                                            y módulo apagado (D12, D13), stock_available por módulo
│   ├── …_finance_engine.sql                    finance_summary, finance_daily, finance_margin, finance_breakdown,
│   │                                            finance_inventory, expenses CRUD (D1–D7)
│   └── …_custom_domains.sql                    resolve_store_domain (anon), store_domain_request/verify/remove,
│                                                store_public_url v2 (D19–D23)
└── tests/08_pro_isolation.test.sql             (+ casos en 02 y 04 para el módulo apagado)

packages/core/src/finance.ts       Zod de periodos y filtros, reparto del descuento, etiquetas
packages/core/src/host.ts          storePublicOrigin (dominio verificado o subdominio)
packages/ui/src/charts.tsx         BarChart / LineChart en SVG (D9)
packages/data/src/                 lecturas GraphQL de movimientos, zonas, tasas y dominios

apps/web/src/
├── proxy.ts                        resolución de dominio propio + redirecciones (D19, D21, D22)
├── server/vercel-domains.ts        cliente de la Vercel Domains API con dry_run (D20, D24)
├── features/finance/               Resumen, Margen, Inventario, Desglose, Gastos, exportar
├── features/multi-warehouse/       Almacenes, zonas, transferencias, movimientos
├── features/multi-currency/        Tasas, historial, monedas de venta
├── features/custom-domain/         Alta, registros DNS, estado
├── app/s/[storeSlug]/admin/{finance,multi-warehouse,multi-currency,custom-domain}/
├── app/(platform)/superadmin/domains/   todos los dominios y su estado
└── app/api/v1/stores/[storeId]/{finance/*,warehouses/{zones,transfers},currencies/rates,custom-domain/*}
    app/api/v1/platform/domains/*
scripts/e2e-pro.mjs · scripts/qa-pro.mjs   (pnpm e2e:pro · pnpm qa:pro)
```

### Modelo de Datos

```sql
create table public.warehouse_shipping_zones (
  store_id uuid not null,
  warehouse_id uuid not null,
  zone_id uuid not null,
  priority smallint not null default 0,
  primary key (zone_id, warehouse_id),
  foreign key (store_id, warehouse_id) references public.warehouses (store_id, id) on delete cascade,
  foreign key (store_id, zone_id) references public.shipping_zones (store_id, id) on delete cascade
);  -- índice (store_id, warehouse_id)

alter table public.order_line_costs add column cost_rate_to_base numeric(18, 6);  -- not null tras el relleno
alter table public.stock_movements add column transfer_id uuid;                    -- índice (store_id, transfer_id)

create table public.expenses (                       -- solo si Roberto dice sí (pregunta 2)
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  spent_on date not null,
  category text not null check (char_length(category) between 1 and 60),
  amount numeric(12, 2) not null check (amount > 0),
  currency public.currency_code not null,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);  -- índice (store_id, spent_on desc)

alter table public.store_domains
  add column status text not null default 'pending'   -- pending / misconfigured / verified / error
  , add column dns_records jsonb not null default '[]' -- lo que Vercel pide configurar
  , add column requested_by uuid references auth.users (id) on delete set null
  , add column checked_at timestamptz;
-- unique (store_id) where type = 'custom'  → un dominio propio por tienda (D21)
```

RLS (patrón de las fases anteriores: `revoke all`, conceder lo justo, escrituras por funciones `service_role`):

| Tabla / función | anon / cliente | staff | owner/admin | superadmin |
|-----------------|----------------|-------|-------------|------------|
| `warehouse_shipping_zones` | — | leer lo suyo | leer lo suyo | todo |
| `stock_movements` (con `transfer_id`) | — | leer lo suyo (como hoy) | ídem | todo |
| `order_line_costs.cost_rate_to_base` | — | — (como el costo) | leer lo suyo | todo |
| `expenses` | — | — | leer lo suyo | todo |
| `store_domains` custom | solo `resolve_store_domain` (slug) | — | leer lo suyo | todo |
| `finance_*`, `transfer_stock`, `store_domain_*` | — | — | por la API (`service_role`) | por la API |

---

## Blueprint (Assembly Line)

> IMPORTANTE: Solo se definen FASES. Las subtareas se generan al entrar a cada fase
> siguiendo el bucle agéntico (mapear contexto → generar subtareas → ejecutar).

### Fase 1: Esquema y aislamiento
**Objetivo**: tablas y columnas nuevas (zonas de almacén, tasa del costo con relleno, `transfer_id`, gastos si se
aprueban, columnas de `store_domains`), RLS y grants; suite `08_pro_isolation.test.sql`.
**Validación**: `pnpm db:migrate` sin errores; advisors limpios; `pnpm test:rls` en verde (01–08); romper una
política a propósito hace fallar un test; ninguna línea de costo queda sin tasa; `pnpm db:graphql-schema && pnpm codegen` OK.

### Fase 2: Multi-almacén y multimoneda
**Objetivo**: `transfer_stock`, zonas por almacén, reserva por zona y almacén por defecto con el módulo apagado
(D11–D15); pantallas Almacenes (zonas, transferencias, movimientos) y Monedas (tasas, historial) (D16, D17);
columnas del Excel si se aprueban (D18).
**Validación**: tests SQL (reserva por zona, reparto, transferencias concurrentes, módulo apagado → solo almacén
por defecto); E2E de API (403 `module_not_enabled`, 422 en español); en el navegador: transferir y ver el
movimiento, cambiar la tasa y ver el precio nuevo en la tienda pública.

### Fase 3: Finanzas
**Objetivo**: funciones `finance_*` y API (D1–D8, D10), componentes de gráficos (D9), pantallas Resumen, Margen,
Inventario, Desglose (y Gastos), exportación a Excel; medir con 20 000 órdenes sintéticas (D5).
**Validación**: E2E «los informes cuadran con las órdenes» (CUP/USD/EUR, pagos parciales, reembolsos,
cancelaciones, descuentos, envío, cambio de tasa posterior); staff → 403; tiempos medidos anotados en este PRP.

### Fase 4: Dominio propio
**Objetivo**: `resolve_store_domain` y proxy con caché (D19), redirecciones y origen público único (D21, D22),
alta y verificación con la Vercel API en `dry_run` (D20, D24), pantallas del admin y del superadmin, módulo
apagado/suspensión (D23).
**Validación**: E2E y QA con `mitienda.localhost:3000` (tienda en el dominio, 308 desde el subdominio, `/admin`
al subdominio, enlaces de aviso/sitemap/canonical, módulo apagado → vuelve al subdominio); `parseHost`/
`storePublicOrigin` con tests unitarios. Prueba con un dominio real **solo con permiso** (pregunta 7).

### Fase 5: Validación final
**Objetivo**: sistema funcionando end-to-end.
**Validación**:
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pasan
- [ ] `pnpm test:rls` (01–08) y `pnpm e2e:{api,catalog,orders,discounts,notifications,billing,pro}` en verde
- [ ] `pnpm qa:{orders,discounts,notifications,billing,pro}` en verde; capturas en `.titan/qa/fase-6/`
- [ ] `demo:seed` deja la Tienda Demo con dos almacenes con zonas, USD con historial de tasas, costos y un dominio
      de prueba `demo-tienda.localhost`
- [ ] Criterios de éxito cumplidos; memoria, `arranque-y-fases.md` y este PRP actualizados

---

## Decisiones de Roberto (2026-10-26)

Sustituyen a la propuesta donde chocan.

1. **D1**: «Vendido» (no cancelados, como «Ventas de hoy») y «Cobrado» juntos. OK.
2. **D7**: **sí** a los gastos manuales (ganancia neta = margen − gastos, por moneda). **Sin** cierre por método de
   pago; el **cierre del día** muestra todas las monedas (vendido, cobrado y gastos del día, una fila por moneda).
3. **D2**: la moneda del «Equivalente» la **elige el dueño** entre las monedas de la tienda (por defecto la base).
   Conversión: importe × tasa de la orden → moneda base → ÷ tasa de la moneda elegida **en la fecha de la orden**
   (último `currency_rate_history` anterior; si no hay, la tasa actual). Así cambiar la tasa hoy no altera el pasado.
4. **D9**: gráficos simples propios en SVG, sin librería.
5. **D10**: el staff no ve Finanzas.
6. **D12**: un pedido puede salir de varios almacenes (se mantiene el reparto).
7. **D14**: transferencias inmediatas.
8. **D18**: sí, columnas «Precio {moneda}» y «Stock {almacén}» en el Excel (solo con el módulo correspondiente).
9. **Tasa de referencia**: sí, Monedas muestra la tasa de **elTOQUE** como sugerencia (el dueño decide; nunca se
   aplica sola). Una consulta por día de La Habana para toda la plataforma, cacheada; token en `ELTOQUE_API_TOKEN`
   (servidor, `.env.local`/Vercel; en LensSpace es un secreto de Edge Function y no se puede leer de vuelta, así que
   Roberto lo pone). Sin token, no se muestra la sugerencia.
10. **D20**: la conexión con Vercel se deja **preparada y sin probar** (modo `dry_run` sin token). `kshop.fullkod.com`
    y los subdominios ya funcionan en Vercel (delegación hecha y probada).
11. **D21/D22**: el dueño pide el dominio desde su admin; la tienda compra y paga su dominio; el admin solo en el
    subdominio. OK.

## Preguntas para Roberto (respondidas arriba)

1. **«Vendido»** (D1): ¿te vale ver juntos «Vendido» (pedidos no cancelados, como «Ventas de hoy») y «Cobrado»
   (dinero recibido)? ¿O para ti «vendido» es solo lo **pagado**, o lo **confirmado**?
2. **Gastos y cierre de caja** (D7): ¿entran los **gastos manuales** (para ver ganancia neta)? ¿Y el **cierre de caja
   diario** por método de pago, o lo dejamos para después?
3. **Moneda del «Equivalente»** (D2): ¿en la moneda base de la tienda (casi siempre CUP) o que el dueño elija (p. ej.
   verlo todo en USD)?
4. **Pedido en varios almacenes** (D12): hoy un pedido ya se reparte entre almacenes si uno solo no tiene todo. ¿Lo
   mantenemos, o prefieres **un solo almacén por pedido** (más simple para preparar el envío, pero rechaza pedidos
   que sí se podrían servir)?
5. **Transferencias** (D14): ¿inmediatas (proponemos) o con estado «en camino» hasta que el otro almacén confirme?
6. **Excel** (D18): ¿columnas de precio por moneda y de stock por almacén en la plantilla y la exportación?
7. **Dominio propio con Vercel** (D20) — necesita tu permiso porque toca servicios externos:
   - ¿Automático (Kshop añade el dominio en Vercel con un token) o seguimos **a mano** desde el panel de Vercel?
   - El proyecto está en la **cuenta Hobby de Claudia**, que **no permite uso comercial** y limita los dominios por
     proyecto: ¿pasamos a Vercel Pro (o a una cuenta de Fullkod) antes de vender dominios propios?
   - Sigue pendiente delegar `kshop.fullkod.com` a Vercel para el wildcard (pregunta abierta en `decisiones.md`).
   - ¿Quién pide el dominio: el **dueño** desde su admin (proponemos) o solo el superadmin? ¿El dominio lo compra y
     lo paga siempre la tienda?
8. **Admin en el dominio propio** (D22): ¿OK que el admin siga solo en `{slug}.kshop.fullkod.com/admin`?
9. **Tasa de referencia**: ¿quieres que la pantalla de Monedas muestre la tasa informal del día (p. ej. elTOQUE)
   como **sugerencia** (servicio externo), o la tasa siempre la escribe el dueño sin ayuda (decisión 4)?
10. **Gráficos** (D9): ¿barras simples propias (ligero) o una librería con tooltips (Recharts, más peso)?
11. **Staff** (D10): ¿el empleado no ve Finanzas en absoluto (proponemos), o ve el Resumen sin costos ni márgenes?

---

## Progreso

| Fase | Estado | Commit |
|------|--------|--------|
| 6.1 Esquema y aislamiento | Hecha: `20261101100000_pro_schema.sql` (`warehouse_shipping_zones`, `stock_movements.transfer_id`, `order_line_costs.cost_rate_to_base` con trigger y relleno de las 42 líneas existentes, `expenses`, `private.market_rates`, columnas de `store_domains` con un dominio propio por tienda). Suite 08; romper la política de gastos hace fallar 4 tests | `82da209` |
| 6.2 Multi-almacén y multimoneda | Hecha: `…100100_warehouse_engine` (disponible y reserva solo del almacén principal sin el módulo, D13; reserva por punto de recogida / zona / resto con reparto, D12; `set_zone_warehouses`; `transfer_stock` con el mismo orden de bloqueo que el checkout; caché de elTOQUE), `…100200_pro_readers`, `…100300_import_variant_extras`. API `/stores/{id}/warehouses{,/zones/{id},/{id}/stock,/transfers,/movements}` y `/currencies/rates`; pantallas Almacenes (Resumen con zonas, Traspasar, Movimientos) y Monedas (tasa, sugerencia elTOQUE, historial, precios fijos); Excel con «Precio {moneda}» y «Stock {almacén}». `test:rls` 512/512, `e2e:pro` 30/30 (incluye carrera por la última unidad e import del Excel), `qa:pro` 7/7, `e2e:{orders,catalog,excel,discounts}` en verde | ver git |
| 6.3 Finanzas | Hecha: `…100400_finance_engine` (`finance_summary`, `finance_daily` = cierre del día con todas las monedas, `finance_margin` por producto/categoría/marca, `finance_breakdown`, `finance_inventory`; `private.rate_at`) + `…100500_finance_rate_periods` (la tasa de la moneda elegida como tramos unidos por fecha: con 20 000 pedidos/30 días el resumen bajó de 1,8–2,6 s a ~200 ms; diario 72 ms, margen 152 ms, desglose 63 ms; sin tabla resumen, D5). API `/stores/{id}/finance/{summary,daily,margin,breakdown,inventory,expenses[/{id}],export}` (owner/admin + `finance`); `@kshop/ui` `BarChart` en SVG; pantallas Resumen (KPIs, gráfico, cierre del día), Margen, Inventario, Desglose, Gastos; «Ver todo en» la moneda que elija el dueño; exportar a Excel (una hoja por vista). Suite 08: «los informes cuadran» con CUP/USD, cancelado, envío a convenir, pagos, devolución, gastos y cambio de tasa posterior; `test:rls` 526/526, `e2e:pro` 49/49 (informes = sumas directas de la BD de pedidos hechos por la API), `qa:pro` 14/14 | ver git |
| 6.4 Dominio propio | **Pendiente** (siguiente) | — |
| 6.5 Validación final | Pendiente | — |

## 🧠 Aprendizajes (Self-Annealing / Neural Network)

> Esta sección CRECE con cada error encontrado durante la implementación.

### 2026-10-26: El trigger de borrado no admite `NEW` en su `WHEN`
- **Error**: `DELETE trigger's WHEN condition cannot reference NEW values` al crear un trigger `insert or update or delete` con `when (coalesce(new.x, old.x) = …)`.
- **Fix**: sin `WHEN`; la función mira `tg_op` y compara `old`/`new` dentro.
- **Aplicar en**: cualquier trigger de fila que cubra borrados.

### 2026-10-26: `insert … returning` no va dentro de un subselect
- **Error**: `syntax error at or near "into"` con `insert into fixtures select … from (insert … returning id) z`.
- **Fix**: CTE: `with z as (insert … returning id) insert into fixtures select … from z`.
- **Aplicar en**: fixtures de los tests SQL.

### 2026-10-26: Una función escalar por fila hunde los informes
- **Error**: `private.rate_at` (subconsultas) llamada por pedido y por suma: 1,8–2,6 s con 20 000 pedidos.
- **Fix**: `private.rate_periods` (tramos `[from_at, to_at)` de la moneda destino) unido por fecha una vez por consulta; un factor por pedido.
- **Aplicar en**: cualquier informe que convierta monedas por fecha.

### 2026-10-26: `->>` y `||` tienen la misma precedencia
- **Error**: `s ->> 'a' || s ->> 'b'` → `operator does not exist: text ->> unknown`.
- **Fix**: paréntesis: `(s ->> 'a') || (s ->> 'b')`.
- **Aplicar en**: tests SQL que arman cadenas desde jsonb.

### 2026-10-26: Una actualización que rompe un `check` falla entera sin avisar en los scripts
- **Error**: la QA ponía `total = null` con envío 0 (check «los dos o ninguno»); supabase-js devuelve el error y el script no lo miraba: los pedidos quedaron todos «hoy».
- **Fix**: una sola actualización válida y `if (error) throw error` en la siembra.
- **Aplicar en**: siembras de QA/E2E.

### 2026-10-26: Recrear una tienda con el mismo slug enseguida
- **Error**: la ficha de la tienda está en caché unos minutos por slug; borrar y recrear «qa-pro» daba «No tienes acceso» (id anterior).
- **Fix**: slug distinto por pasada (`qa-pro-xxxxx`) y limpieza por prefijo.
- **Aplicar en**: scripts de QA que crean tiendas temporales.

### 2026-10-26: Datos viejos sin aviso al cambiar el periodo
- **Error**: al pulsar «7 días» seguían los números del mes hasta llegar el informe nuevo (la QA llegó a capturarlos).
- **Fix**: `useReport` devuelve `loading` por clave de petición; el informe se atenúa con `aria-busy` y la QA espera a `aria-busy="false"`.
- **Aplicar en**: pantallas con filtros que recargan datos.

### 2026-10-26: El token de elTOQUE de LensSpace no se puede copiar
- **Error**: está guardado como secreto de Edge Function en el Supabase de LensSpace (solo se ve su huella).
- **Fix**: Kshop lo lee de `ELTOQUE_API_TOKEN` (servidor); sin él la pantalla funciona sin sugerencia. Roberto lo pone en `.env.local` y en Vercel.
- **Aplicar en**: cualquier secreto compartido entre proyectos.

---

## Gotchas

- [ ] `checkout_create_order` tiene varias versiones (Fases 3–5: `checkout_multi_warehouse`, `pricing_engine`,
      `checkout_notify_customer`): partir **siempre de la última** (`20261030100300…` o posterior) al reescribirla.
- [ ] El checkout reserva hoy de **todos** los almacenes activos aunque `multi_warehouse` esté apagado, y
      `stock_available` (tienda pública) suma todos: cerrar el hueco en las dos cosas a la vez (D13) o el carrito y el
      checkout se contradicen (error ya visto en la Fase 3).
- [ ] `order_line_costs` no tiene tasa: el relleno de órdenes viejas es aproximado (última tasa del historial antes
      de la orden); decirlo en la pantalla si hay órdenes anteriores al cambio.
- [ ] Los días se cortan en `America/Havana` (como `sales_today`), nunca en UTC; Cuba tiene horario de verano.
- [ ] `private.store_public_url` ya usa `is_primary` **sin** comprobar `verified_at` ni el módulo: un dominio a medio
      configurar mandaría enlaces rotos por WhatsApp.
- [ ] El proxy de Next 16 corre en cada petición: la consulta del dominio necesita caché (también de los «no existe»)
      y un timeout corto; nunca bloquear `/api/*` (las apps no tienen host).
- [ ] Vercel: el apex necesita registro A (`76.76.21.21`) y `www` un CNAME; algunos proveedores cubanos/baratos no
      permiten CNAME en el apex. El certificado no se emite hasta que el DNS apunta bien.
- [ ] Dev = prod en Supabase: las pruebas crean tiendas temporales y las borran; nunca tocar la Tienda Demo salvo con
      `demo:seed`. Las pruebas que editan apariencia en una tienda Base deben regalarle `themes`.
- [ ] Tras cada migración que toque tablas o funciones públicas: `pnpm test:rls`, `pnpm db:graphql-schema && pnpm codegen`.

## Anti-Patrones

- NO crear una tabla resumen (`daily_sales`) antes de medir que hace falta.
- NO mezclar monedas en un total sin decir que es un equivalente y con qué tasa.
- NO convertir costos ni ventas pasadas con la tasa de hoy.
- NO borrar almacenes, zonas, tasas, overrides ni dominios al apagar un módulo.
- NO llamar a la API de Vercel ni tocar DNS sin permiso explícito de Roberto (usar `dry_run`).
- NO exponer costos, márgenes ni el detalle por almacén en lecturas públicas.
- NO omitir validación Zod en las entradas ni `requireModule` + `requireStoreRole` en cada endpoint.

---

*PRP pendiente de aprobación. No se ha modificado código.*
