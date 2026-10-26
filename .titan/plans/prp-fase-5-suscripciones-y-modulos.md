# PRP-5: Suscripciones y módulos en Kshop

> **Estado**: APROBADO (2026-10-25) con las respuestas de Roberto (ver «Decisiones de Roberto»); en implementación
> **Fecha**: 2026-10-25
> **Proyecto**: Kshop
> **Fase**: 5 (ver `arranque-y-fases.md`). Código de partida: commit `72e440a` (Fase 4 cerrada salvo OpenWA real)

---

## Objetivo

Que la plataforma **cobre a las tiendas** con planes Base/Pro, módulos sueltos (add-ons), regalos del superadmin
(días gratis, descuentos, precio congelado de fundador, módulos de cortesía) y **facturas manuales** cobradas en
efectivo; que el ciclo trial → factura → vencida → suspendida → reactivada corra solo, y que **subir o bajar de
plan active o desactive funciones en UI, API y BD sin perder datos**, con los límites (productos, staff) aplicados
en el servidor.

## Por Qué

| Problema | Solución |
|----------|----------|
| `subscriptions` es mínima (Fase 0b, D5): plan, estado y fin del trial; no hay periodos, precio propio, grants ni facturas | `subscriptions` completa + `subscription_grants` + `platform_invoices` con líneas (modelo de `suscripciones.md`) |
| Los módulos de una tienda solo se copian del plan **al crearla** (`create_store`); cambiar de plan o vender un módulo suelto exige SQL a mano | Funciones transaccionales `change_plan`, `set_store_addon`, `grant_store_module` que recalculan `store_modules` (nunca borran datos) |
| Los límites solo leen `plan_limits` (`private.store_limit`): no hay forma de dar «50 productos más» a una tienda ni de que un add-on traiga límites; `max_staff` no se aplica en ningún sitio (no hay gestión de equipo) | Límites efectivos = plan + add-ons + override por tienda, una sola función SQL; pantalla «Equipo» con el límite `max_staff` |
| Suspender es un botón manual del superadmin; nadie avisa al dueño de que debe pagar | Tarea diaria `pg_cron`: emite facturas, marca vencidas, suspende tras la gracia y avisa al dueño por el WhatsApp de la plataforma (Fase 4) |
| El dueño no sabe qué plan tiene, cuánto paga ni cómo pagar; el menú dice «Pro» aunque el módulo se venda suelto | Pantalla «Plan y facturación» en el admin: plan, uso vs límites, facturas, instrucciones de pago, subir comprobante; venta cruzada con el precio real |
| Precios de planes y módulos están a 0 en una migración | El superadmin edita planes, precios, límites y módulos de cada plan desde su panel |

**Valor de negocio**: es la fase que convierte Kshop en un negocio (decisión 8: cobro por suscripción, trials
variables, socios fundadores, pago manual). Sin ella no se puede abrir la plataforma a tiendas de pago ni migrar
klauShop (Fase 8) con condiciones de fundador.

## Qué

### Criterios de Éxito
- [ ] `pnpm db:migrate` aplica las migraciones sin errores; advisors sin avisos nuevos; `pnpm db:graphql-schema && pnpm codegen` OK.
- [ ] `pnpm test:rls` en verde con la suite nueva `07_billing_isolation`: el staff de B no ve suscripción, grants, facturas, líneas ni comprobantes de A; el **staff** (no owner/admin) de una tienda no ve importes ni facturas de su tienda; anon y clientes no ven nada de facturación; solo `service_role` escribe; los comprobantes (bucket privado) solo los leen el owner/admin de esa tienda y el superadmin.
- [ ] **Subir/bajar de plan sin perder datos** (criterio de la fase): en una tienda temporal Pro con 2 almacenes, 2 monedas de venta, 350 productos, plantillas y contactos de WhatsApp → bajar a Base: los módulos Pro quedan inactivos en las tres capas (menú «bloqueado» con venta cruzada, API 403 `module_not_enabled`, BD rechaza escribir), la tienda sigue vendiendo en su moneda base desde el almacén por defecto, no se crean productos nuevos (`limit_reached`) pero los 350 siguen ahí y editables; volver a Pro → todo reaparece igual (mismos almacenes, precios por moneda, plantillas). Mismo resultado comprando solo `multi_currency` como add-on sobre Base.
- [ ] **Ciclo de cobro** (con el reloj simulado de la función diaria): una tienda con trial de 14 días recibe su primera factura N días antes del fin, pasa a `past_due` al vencer sin pago, a `suspended` tras los días de gracia (tienda pública «temporalmente no disponible», checkout cerrado, admin solo lectura + facturación), y al registrar el pago vuelve a `active` al momento con el siguiente periodo calculado. Cada paso deja un aviso al dueño en `notification_log` (`dry_run`) sin duplicados aunque la tarea corra dos veces.
- [ ] **Importes**: precio efectivo = `price_override` ?? precio del plan + add-ons activos − grants vigentes; un fundador con `price_lock` sigue pagando su precio aunque suba el del plan; un grant `free_days` de 30 días mueve la siguiente factura 30 días; `comped` nunca factura. Las líneas de la factura (snapshot) cuadran con el total y no cambian si luego cambia el plan.
- [ ] `pnpm e2e:billing` en verde (401/403/404/409/422 en español; superadmin vs owner vs staff); `pnpm qa:billing` con capturas en `.titan/qa/fase-5/` (superadmin y admin, 390 px y escritorio); `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pasan; suites RLS y E2E de las fases 0b–4 siguen en verde.

### Comportamiento Esperado (Happy Path)

1. **Superadmin › Planes y módulos**: Roberto fija el precio de Base y Pro (USD/mes), qué módulos incluye cada plan,
   sus límites (`max_products`, `max_staff`) y el precio de cada módulo suelto. Los cambios valen para facturas
   futuras; quien tenga precio congelado no se ve afectado.
2. **Alta de tienda** (pantalla existente, ampliada): plan, días de prueba y, opcional, «Socio fundador» (precio
   congelado de por vida o % de descuento) o «Cortesía» (gratis indefinida).
3. **Superadmin › Tienda › Suscripción**: ve plan, estado, periodo actual, precio efectivo desglosado, uso vs
   límites, módulos (de plan / suelto / regalo, con fechas), grants y facturas. Acciones: cambiar de plan (efecto
   inmediato), añadir/quitar módulo suelto, regalar un módulo hasta una fecha, dar días gratis o descuento, fijar
   precio propio o límites extra, anotar notas, suspender/reactivar a mano.
4. **Factura**: la tarea diaria (≈ 06:00 La Habana) emite la factura del siguiente periodo `invoice_lead_days`
   antes de que empiece (líneas: plan, cada módulo suelto, cada descuento/grant) y avisa al dueño por WhatsApp
   («Tu factura KS-2026-0012 de 25 USD vence el 1 de diciembre…» + instrucciones de pago de la plataforma).
5. **Pago**: el dueño paga por transferencia/efectivo y, desde **Admin › Plan y facturación**, sube el comprobante
   (la factura pasa a «En revisión»). El superadmin, en **Cobros**, abre el comprobante, registra el pago (método,
   referencia, fecha) → factura `paid`, suscripción `active`, periodo siguiente, aviso «Pago recibido».
6. **Impago**: al vencer sin pago → `past_due` + aviso con los días de gracia y un banner en el admin; al acabar la
   gracia → `suspended`: la tienda pública muestra «Tienda temporalmente no disponible», el checkout se cierra, el
   admin solo permite ver, exportar y pagar. Al registrar el pago se reactiva sola.
7. **Admin › Plan y facturación** (owner/admin): plan y estado, próxima factura, uso (`Productos 280 / 300`,
   `Equipo 2 / 2`), módulos activos y disponibles con su precio («Multimoneda: incluida en Pro o 5 USD/mes
   suelta») y el botón «Solicitar» (abre WhatsApp a soporte de la plataforma con el texto listo), historial de
   facturas con estado y comprobante.
8. **Admin › Equipo** (owner/admin): lista de usuarios (dueño, admins, empleados), invitar por email con rol
   (enlace de acceso de un solo uso para mandar por WhatsApp, igual que el alta del dueño), cambiar rol, quitar.
   Al llegar a `max_staff`: «Tu plan permite 2 usuarios de equipo».
9. **Bajar de plan** Pro → Base: lo que excede queda guardado y visible pero no se puede ampliar (productos por
   encima del límite, almacenes extra, monedas extra, plantillas de WhatsApp); el admin explica qué quedó en pausa.

---

## Contexto

### Referencias
- `.titan/memory/project/suscripciones.md` — tablas `subscriptions`, `subscription_grants`, `platform_invoices`; trial variable, fundador, cortesía, precio efectivo, `past_due` → gracia → `suspended`, cobro manual.
- `.titan/memory/project/modulos-y-planes.md` — principio «el esquema existe, se activa la funcionalidad», `store_modules` con `source` plan/addon/grant, tres capas, reparto v2 Base/Pro, add-ons con precio por módulo, factura = plan + add-ons − grants.
- `.titan/memory/project/decisiones.md` — 8 (suscripción, trials, fundadores, pago manual), 16 (Base/Pro + sueltos), 20–21 (Base: 2 staff, 300 productos provisional; Pro sin límite de productos), 24 (avisos de plataforma).
- `.titan/plans/prp-fase-0b-cimientos.md` D5 (suscripción mínima; grants, facturas y suspensión en la Fase 5).
- Código actual (commit `72e440a`):
  - `supabase/migrations/20261024120000_platform_schema.sql` — `stores.status` (`active`/`suspended`/`archived`), `modules` (`addon_price`, `addon_currency`, `depends_on`), `plans`, `plan_modules` (`limits jsonb`), `plan_limits`, `store_modules` (pk `store_id, module_code, source`; `enabled`, `starts_at`, `ends_at`, `granted_by`), `subscriptions` mínima, enum `subscription_status` ya con los 6 estados, `private.store_has_module`.
  - `supabase/migrations/20261024120100_platform_functions.sql` — `create_store` (copia `plan_modules` a `store_modules` con `source = plan`; trial por días).
  - `supabase/migrations/20261024120200_seed_modules_and_plans.sql` — 13 módulos; Base/Pro a 0 USD; `max_staff = 2` en Base.
  - `supabase/migrations/20261024120300_entitlements_security_invoker.sql` — `store_entitlements` (grant > addon > plan) y `store_limits` (solo `plan_limits`).
  - `supabase/migrations/20261025100000_catalog_schema.sql` — `private.store_limit`, trigger `enforce_product_limit` (`hint = max_products`), triggers de módulo en `warehouses`, `store_currencies`, `variant_prices`; `private.store_is_public` (= `status = 'active'`); `max_products = 300` en Base.
  - `supabase/migrations/20261030100000_notifications_schema.sql` / `…100200_notifications_engine.sql` — `private.platform_config`, `whatsapp_templates` de plataforma, `notification_log` (dedupe solo por `order_id`), `private.queue_notification`, despachador `pg_cron`.
  - `apps/web/src/server/auth.ts` — `requireSuperadmin`, `requireStoreRole`, `hasModule`/`requireModule` (RPC `store_entitlements`).
  - `apps/web/src/server/platform-stores.ts` + `app/api/v1/platform/stores/**` + `app/(platform)/superadmin/**` — lista, alta y suspender/reactivar a mano (invalida `storeCacheTag`).
  - `apps/web/src/app/s/[storeSlug]/admin/AdminShell.tsx` — menú desde `ADMIN_MODULES` + entitlements; los bloqueados muestran siempre «Pro».
  - `apps/web/src/app/s/[storeSlug]/(front)/layout.tsx` — aviso «Tienda temporalmente no disponible» si `status = suspended`.
  - `apps/web/src/server/db-errors.ts` — mapea `hint = max_products` → 422 `limit_reached`.
  - `scripts/demo-seed.mjs` crea el empleado de la Tienda Demo a mano (no hay gestión de equipo en la app).
- Datos hoy: una sola tienda (`demo`, Pro, `active`, sin trial); cron `kshop-whatsapp-dispatch` cada minuto.
- Skills: `tf-supabase`, `supabase`, `supabase-postgres-best-practices`, `tf-playwright-cli`.

### Decisiones técnicas propuestas (Roberto confirma o cambia)

**Planes, módulos y límites**

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D1 | **Fuente de verdad de los módulos** | `store_modules` sigue siendo la tabla efectiva (la leen `store_has_module`, `store_entitlements`, RLS y triggers ya existentes). Las filas `source = plan` se **recalculan** desde `plan_modules` con `private.sync_plan_modules(store_id)` al cambiar de plan o al editar un plan (todas sus tiendas). Un módulo que sale del plan queda `enabled = false` (la fila no se borra, por historial); los datos de la tienda nunca se tocan | Calcular los módulos en vivo desde `subscriptions.plan_id` + add-ons (habría que reescribir `store_has_module` y todos sus usos) |
| D2 | **Módulo suelto (add-on)** | Fila `source = addon` con **precio congelado** (`price`, `currency` nuevas en `store_modules`, copiadas de `modules.addon_price` al contratarlo) y `starts_at`/`ends_at`. Si el plan ya incluye el módulo, el add-on no se cobra (aviso al superadmin). Se respetan `depends_on` | Precio del add-on siempre el de catálogo (subir el precio afectaría a quien ya lo tiene) |
| D3 | **Módulo regalado** | Fila `source = grant` (`granted_by`, `ends_at` opcional, motivo); no se factura; al vencer deja de contar sola (ya lo hace `store_has_module`) | Grant como descuento del 100 % sobre un add-on (más líneas confusas en la factura) |
| D4 | **Límites efectivos** | `private.store_limit(store_id, key)` pasa a: override de la tienda (`subscriptions.limit_overrides jsonb`) ?? máximo entre el plan y los `limits` de los módulos activos; sin fila = sin límite. `store_limits()` devuelve lo mismo + el uso actual (`{max_products: {limit: 300, used: 280}}`) para la UI. Claves: `max_products`, `max_staff` (otras, como almacenes o monedas, ya las gobierna su módulo) | Tabla `store_limit_overrides` aparte (más tablas para lo mismo) |
| D5 | **Exceso tras bajar de plan** | Nada se archiva ni se borra: productos por encima del límite siguen publicados y editables, solo se bloquea crear/publicar más (el trigger actual ya hace eso); con más staff que `max_staff` se bloquea invitar. Banner en el admin con lo que quedó en pausa | Archivar automáticamente lo que exceda (pierde ventas y es irreversible para el dueño) |
| D6 | **Comportamiento de cada módulo apagado** (auditar y cerrar huecos) | `multi_warehouse`: se vende y reserva solo del almacén por defecto, los otros se ven en solo lectura; `multi_currency`: solo moneda base en tienda y checkout, los precios por moneda se conservan y no se pueden editar; `whatsapp_notifications`: no se encola nada, contactos/plantillas/historial visibles en solo lectura; `discounts`, `shipping`, `themes`, `excel_import`, `sales_today`: lo ya implementado en sus fases. Un test por módulo «apagar → sigue funcionando el resto, encender → vuelve igual» | Ocultar solo la UI |
| D7 | **Edición de planes por el superadmin** | Pantalla y API para precio, moneda, intervalo, `is_public`, módulos del plan, límites y precio de cada módulo suelto. Cambiar módulos de un plan llama a `sync_plan_modules` de todas sus tiendas (en la misma transacción) e invalida su caché | Seguir cambiando precios por migración |

**Suscripción, grants y facturación**

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D8 | **Periodo** | `subscriptions` + `current_period_start/end`, `billing_anchor` (día del mes), `price_override`, `currency`, `limit_overrides`, `cancel_at`, `notes`, `suspended_at`, `founder boolean` (badge). Periodo mensual (o anual si el plan es `year`) que empieza al acabar el trial | Facturar todas las tiendas el día 1 de cada mes (prorrateos desde el primer mes) |
| D9 | **Grants** | `subscription_grants` (store_id, type `free_days` / `discount_percent` / `price_lock` / `founder`, value, reason, starts_at, ends_at null = de por vida, granted_by, revoked_at). `free_days` corre el fin del periodo (o del trial) al aplicarse; `discount_percent` y `price_lock` se aplican al calcular cada factura mientras estén vigentes; `founder` = badge + uno de los dos anteriores (se crean juntos) | Solo `price_override` (sin historial ni motivo del regalo) |
| D10 | **Precio efectivo y cotización** | Una función `public.subscription_quote(store_id, period_start)` (`service_role`) devuelve las líneas: plan (`price_lock` ?? `price_override` ?? precio del plan), cada add-on activo en el periodo (precio congelado), cada descuento (`discount_percent` sobre el subtotal; nunca < 0) y el total. La usan la factura, la pantalla del superadmin y la del dueño (un solo cálculo, como `price_lines` en la Fase 4) | Calcular en TS |
| D11 | **Facturas** | `platform_invoices` (store_id, number global `KS-AAAA-NNNN`, period_start/end, currency, subtotal, discount, total, status `draft`/`pending`/`in_review`/`paid`/`void`, issued_at, due_at, paid_at, method, reference, evidence_path, recorded_by, notes) + `platform_invoice_lines` (kind `plan`/`addon`/`discount`/`adjustment`, description, quantity, unit_amount, amount) como **snapshot**. Una factura por tienda y periodo (`unique (store_id, period_start)`). El superadmin puede anular y reemitir, o añadir un ajuste manual antes de emitir | Una sola fila sin líneas (no explica al dueño qué paga) |
| D12 | **Moneda y forma de pago** | La factura va en la moneda del plan (USD). Al registrar el pago el superadmin anota **lo cobrado realmente** (importe, moneda, tasa usada si fue en CUP/EUR, método, referencia, fecha) en `platform_payments` (una factura puede tener varios pagos; `paid` cuando la suma cubre el total) | Solo marcar «pagada» con un campo de método (no deja rastro de cobros en CUP) |
| D13 | **Comprobante del dueño** | El owner/admin sube la imagen a un bucket privado nuevo `platform-private` (`stores/{store_id}/invoices/{invoice_id}/…`), la factura pasa a `in_review` y se avisa al superadmin en su panel (contador «En revisión»). Solo el superadmin cambia el estado a `paid` | Solo el superadmin sube comprobantes (el dueño se los manda por WhatsApp) |
| D14 | **Ciclo automático** | `private.billing_tick(p_now timestamptz default now())` diario por `pg_cron` (≈ 11:00 UTC = 06:00 La Habana), idempotente y con `for update` por suscripción: (a) emite factura `invoice_lead_days` antes del inicio del periodo; (b) fin de trial → `active` si la primera factura está pagada o `past_due`; (c) vencida sin pago → `past_due`; (d) `past_due` + `grace_days` → `suspended` + `stores.status = suspended`; (e) `cancel_at` cumplido → `cancelled` + suspendida; (f) recordatorios. El parámetro `p_now` permite probar el ciclo sin esperar días | Todo a mano desde el superadmin (no escala y depende de acordarse) |
| D15 | **Suspensión por impago vs manual** | `stores.suspended_reason` (`billing` / `manual`). Registrar el pago reactiva solo lo suspendido por `billing`; una suspensión manual la levanta el superadmin. `comped` y `cancelled` no generan facturas | Un solo estado (pagar reactivaría también una suspensión por abuso) |
| D16 | **Tienda suspendida** | Pública: el aviso actual (ya existe) + checkout y APIs públicas cerradas (`store_is_public` ya lo hace en BD). Admin: entra, ve todo en **solo lectura**, puede exportar (Excel si tiene el módulo) y pagar; toda escritura de `/api/v1/stores/{id}/…` devuelve 403 `store_suspended` con un helper `requireStoreWritable(storeId)` en el mismo punto que `requireStoreRole` | Bloquear también el admin (el dueño no podría ni pagar ni sacar sus datos) |
| D17 | **Cambio de plan a mitad de periodo** | Efecto inmediato en módulos y límites; **sin prorrateo** en el MVP: la factura siguiente ya va con el plan nuevo; si Roberto quiere cobrar la diferencia añade una línea de ajuste | Prorrateo automático por días (más lógica y más difícil de explicar en una factura manual) |
| D18 | **Avisos de cobro** | Eventos de plataforma `invoice_issued`, `invoice_reminder`, `subscription_past_due`, `store_suspended`, `payment_received`, `trial_ending` (audiencia `store`), plantillas **solo de plataforma** (la tienda no puede editarlas), destinatario = `stores.whatsapp_phone` (o un teléfono de facturación opcional en la suscripción). Se envían **sin** el módulo `whatsapp_notifications` (como el código de recuperación, D20 de la Fase 4). Dedupe con una columna nueva `notification_log.dedupe_key` (p. ej. `invoice:{id}:issued`) | Avisar solo por el panel (el dueño no entra a diario) |
| D19 | **Config de facturación** | Claves nuevas en `private.platform_config`: `invoice_lead_days` (5), `invoice_due_days` (7), `grace_days` (7), `trial_reminder_days` (3), `billing_instructions` (texto con cómo pagar), `support_whatsapp`. Editables en Superadmin › Facturación | Constantes en el código |

**Equipo, UI y API**

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D20 | **Gestión de equipo** (necesaria para `max_staff`) | Admin › Equipo (owner/admin): invitar por email con rol `admin`/`staff` usando el mismo `generateLink` del alta del dueño (enlace para mandar por WhatsApp, sin proveedor de email), cambiar rol, quitar. Solo el owner nombra admins o quita admins; nunca se quita el último owner. `max_staff` cuenta admins + staff (no el dueño) y se comprueba en una función SQL con `for update` | Dejar el equipo para otra fase y no aplicar `max_staff` todavía |
| D21 | **Venta cruzada en el menú** | El candado del menú dice «Incluido en Pro» y, si el módulo se vende suelto, «o N USD/mes»; la página bloqueada explica el módulo y lleva a «Plan y facturación» (sustituye el «Pro» fijo de `AdminShell`) | Mantener el texto fijo |
| D22 | **Visibilidad** | Owner/admin ven plan, facturas e importes; el rol `staff` solo ve el banner de suspensión/impago (sin importes). Facturas por pg_graphql con RLS para owner/admin; escrituras siempre por `/api/v1` + funciones `service_role` | Solo el owner |
| D23 | **Caché de entitlements** | Cada función que cambie módulos, plan o estado devuelve el `store_id` afectado y la API invalida `storeCacheTag(slug)` y `store:{id}:catalog` (multimoneda y almacenes cambian lo que ve la tienda pública). `hasModule` sigue sin caché (RPC por petición, como hoy) | Tag nuevo `store:{id}:entitlements` en un `cache` de Next (el registro de módulos se lee en cliente vía pg_graphql, así que no hay nada cacheado que invalidar en el admin) |

### Arquitectura Propuesta

```
supabase/
├── migrations/
│   ├── 20261031100000_billing_schema.sql        columnas nuevas en subscriptions, store_modules (price, currency,
│   │                                             reason), stores (suspended_reason); subscription_grants,
│   │                                             platform_invoices (+ lines, payments), numeración, bucket
│   │                                             platform-private, notification_log.dedupe_key; RLS y grants
│   ├── 20261031100100_entitlements_engine.sql   sync_plan_modules, change_plan, set_store_addon, grant_store_module,
│   │                                             store_limit/store_limits con override y uso, staff limit
│   ├── 20261031100200_billing_engine.sql        subscription_quote, issue_invoice, record_platform_payment,
│   │                                             void_invoice, submit_invoice_evidence, billing_tick + pg_cron,
│   │                                             avisos de cobro (plantillas de plataforma)
│   └── 20261031100300_store_team.sql            store_member_add/update/remove con max_staff y reglas de owner
└── tests/07_billing_isolation.test.sql (+ casos de módulo apagado en las suites existentes)

packages/core/src/billing/     Zod de planes, grants, facturas, pagos; etiquetas de estado; formateo de periodo
packages/core/src/team.ts      Zod de invitación y roles
packages/data/src/billing-queries.ts   lecturas GraphQL (suscripción, facturas, uso) para admin y superadmin

apps/web/src/
├── app/(platform)/superadmin/plans/        Planes y módulos (D7)
├── app/(platform)/superadmin/stores/[id]/  Suscripción de la tienda (plan, módulos, grants, límites, facturas)
├── app/(platform)/superadmin/billing/      Cobros (pendientes, en revisión, vencidas) + config de facturación
├── app/s/[storeSlug]/admin/billing/        Plan y facturación (dueño)
├── app/s/[storeSlug]/admin/team/           Equipo
├── app/s/[storeSlug]/admin/AdminShell.tsx  banners de trial/impago/suspensión, candados con precio (D21)
├── server/billing/ · server/team/          servicios que llaman a las funciones SQL
└── app/api/v1/platform/{plans,modules,billing,stores/[id]/{subscription,addons,grants,invoices}}/…
    app/api/v1/stores/[storeId]/{billing,billing/invoices/[id]/evidence,team}/…
scripts/e2e-billing.mjs · scripts/qa-billing.mjs   (pnpm e2e:billing · pnpm qa:billing)
```

### Modelo de Datos

```sql
create type public.grant_type as enum ('free_days', 'discount_percent', 'price_lock', 'founder');
create type public.invoice_status as enum ('draft', 'pending', 'in_review', 'paid', 'void');
create type public.invoice_line_kind as enum ('plan', 'addon', 'discount', 'adjustment');
create type public.suspension_reason as enum ('billing', 'manual');

-- columnas nuevas
subscriptions  + current_period_start, current_period_end (ya existe), billing_anchor smallint, currency,
                 price_override numeric(12,2) null, limit_overrides jsonb default '{}', founder bool,
                 cancel_at null, suspended_at null, billing_phone null, notes
store_modules  + price numeric(12,2) null, currency null   -- precio congelado del add-on
               + reason text null                           -- motivo del regalo
stores         + suspended_reason public.suspension_reason null
notification_log + dedupe_key text null, unique (dedupe_key) where dedupe_key is not null

subscription_grants (id, store_id, type, value numeric(12,2) null, reason, starts_at, ends_at null,
                     granted_by, revoked_at null, created_at)
platform_invoices   (id, store_id, number unique, period_start, period_end, currency, subtotal, discount, total,
                     status, issued_at, due_at, paid_at, evidence_path, notes, created_by, created_at, updated_at)
                     unique (store_id, period_start) where status <> 'void'
platform_invoice_lines (id, store_id, invoice_id, kind, module_code null, grant_id null, description,
                     quantity, unit_amount, amount, sort_order)
platform_payments   (id, store_id, invoice_id, amount, currency, rate_to_invoice numeric(14,6) null,
                     amount_in_invoice_currency, method, reference, paid_at, recorded_by, created_at)
-- bucket privado platform-private: stores/{store_id}/invoices/{invoice_id}/…
```

RLS (patrón de las fases 0b–4: `revoke all`, conceder lo justo; escrituras solo por funciones `service_role`):

| Tabla | anon / cliente | staff de la tienda | owner/admin de la tienda | superadmin |
|-------|----------------|--------------------|--------------------------|------------|
| `subscriptions` | — | estado y fechas (para el banner), sin importes | todo lo suyo | todo |
| `store_modules` | — | lo suyo (como hoy) | lo suyo | todo |
| `subscription_grants` | — | — | lo suyo (sin `granted_by`) | todo |
| `platform_invoices`, `…_lines`, `platform_payments` | — | — | lo suyo | todo |
| `plans`, `plan_modules`, `plan_limits`, `modules` | públicos (como hoy) | ídem | ídem | todo |
| bucket `platform-private` | — | — | leer y subir en `stores/{su id}/invoices/` | todo |

---

## Blueprint (Assembly Line)

> IMPORTANTE: Solo se definen FASES. Las subtareas se generan al entrar a cada fase
> siguiendo el bucle agéntico (mapear contexto → generar subtareas → ejecutar).

### Fase 1: Esquema de facturación y tests de aislamiento
**Objetivo**: columnas nuevas en `subscriptions`, `store_modules`, `stores` y `notification_log`; tablas de
grants, facturas, líneas y pagos; bucket `platform-private`; RLS y grants por rol (D22); suite
`07_billing_isolation.test.sql`; migrar la Tienda Demo (suscripción con periodo y moneda).
**Validación**: `pnpm db:migrate` sin errores; advisors limpios; `pnpm test:rls` en verde (01–07); romper una
política a propósito hace fallar un test; `pnpm db:graphql-schema && pnpm codegen` OK.

### Fase 2: Motor de módulos, límites y equipo
**Objetivo**: `sync_plan_modules`, `change_plan`, `set_store_addon`, `grant_store_module` (D1–D3, D7, D23);
límites efectivos con override y uso (D4, D5); funciones de equipo con `max_staff` (D20); auditoría de cada
módulo apagado y cierre de los huecos encontrados (D6).
**Validación**: tests SQL: subir/bajar de plan conserva todos los datos y vuelve igual; add-on y grant con fechas;
`depends_on`; límites con override; `max_staff` con dos invitaciones simultáneas (una gana); para cada módulo
opcional, apagarlo bloquea escribir en BD y el resto de la tienda sigue vendiendo.

### Fase 3: Motor de facturación y ciclo automático
**Objetivo**: `subscription_quote` (D10), emisión, anulación, ajuste y pagos (D11, D12), comprobante del dueño
(D13), `billing_tick` con `p_now` + `pg_cron` (D8, D9, D14, D15, D17), avisos de cobro con dedupe (D18), config
de facturación (D19).
**Validación**: tests SQL con reloj simulado: trial → factura → `past_due` → `suspended` → pago → `active`;
fundador con `price_lock` tras subir el precio del plan; `free_days`; `comped` sin facturas; correr el tick dos
veces no duplica facturas ni avisos; los totales de las líneas cuadran.

### Fase 4: Superadmin
**Objetivo**: API `/api/v1/platform/…` y pantallas Planes y módulos, Suscripción de la tienda (plan, módulos,
grants, límites, notas, facturas, registrar pago, suspender/reactivar), Cobros (pendientes, en revisión,
vencidas) y Facturación (config); alta de tienda con fundador/cortesía.
**Validación**: pasos 1–5 del happy path en el navegador (escritorio y 390 px); E2E de API (solo superadmin;
422 en español; invalidación de caché al cambiar de plan o suspender).

### Fase 5: Admin de la tienda
**Objetivo**: Plan y facturación (uso, módulos con precio, facturas, comprobante, «Solicitar» por WhatsApp),
Equipo, banners de trial/impago/suspensión, candados con precio (D21), modo solo lectura de la tienda suspendida
(`requireStoreWritable`, D16); `demo:seed` con plan y una factura; scripts `pnpm e2e:billing` y `pnpm qa:billing`.
**Validación**: pasos 6–9 del happy path en el navegador; E2E (owner/admin vs staff, 403 `store_suspended`,
`limit_reached`, `module_not_enabled`); el criterio «bajar/subir de plan sin perder datos» pasa de punta a punta.

### Fase 6: Validación final
**Objetivo**: sistema funcionando end-to-end.
**Validación**:
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pasan
- [ ] `pnpm test:rls` (01–07) y `pnpm e2e:{api,catalog,orders,discounts,notifications,billing}` en verde
- [ ] `pnpm qa:{orders,discounts,notifications,billing}` en verde; capturas en `.titan/qa/fase-5/`
- [ ] Criterios de éxito cumplidos; memoria, `arranque-y-fases.md` y este PRP actualizados

---

## Decisiones de Roberto (2026-10-25)

1. **Precios**: estudio en `.titan/memory/project/2026-10-25-estudio-precios-cuba.md` («que entren clientes antes
   que todo»). Valores iniciales (editables en Superadmin › Planes): Base 5 USD/mes, Pro 12 USD/mes; planes anuales
   Base 50 y Pro 120 (2 meses gratis); sueltos: Cupones 2, Avisos WhatsApp 3, Multimoneda 3, Multi-almacén 3,
   Finanzas 3, Dominio propio 3. Prueba por defecto de 30 días.
   **Cambio de reparto**: los cupones y el descuento manual **no** van en el Base. El módulo `discounts` pasa a ser
   «Ofertas» (promociones automáticas con badge y precio tachado: Base y Pro) y nace `vouchers` «Cupones» (cupones y
   descuento manual en pedidos: Pro y suelto). Los datos de cupones existentes se conservan.
2. **Límites**: Base 300 productos y 2 de equipo; Pro sin límite de productos y 10 de equipo.
3. **Plazos**: factura 5 días antes, vence a los 7, 7 días de gracia, aviso de fin de prueba 3 días antes.
4. **Moneda**: siempre USD.
5. **Cobro**: en persona y en efectivo; **sin comprobantes**. Se eliminan D13 (subida del dueño), el bucket
   `platform-private` y el estado `in_review`. El superadmin registra el pago (importe en USD, método: efectivo por
   defecto / transferencia / otro, referencia y nota opcionales). D12 queda en USD sin tasa.
6. **Equipo**: sí, en esta fase (D20).
7. **Prorrateo**: Roberto lo deja a criterio → **sin prorrateo** (D17): el cambio de plan vale al momento y la
   factura siguiente ya va con el plan nuevo; si hace falta cobrar una diferencia, línea de ajuste manual.
8. **Avisos de cobro**: al WhatsApp de la tienda (`stores.whatsapp_phone`). Número de soporte de la plataforma
   (`support_whatsapp`) configurable en el superadmin.
9. **Dominio propio**: se vende ya; el superadmin lo configura a mano hasta la Fase 6.

---

## Progreso

| Fase | Estado | Commit |
|------|--------|--------|
| 5.1 Esquema y aislamiento | Hecha: `20261031100000_billing_schema.sql` (tipos, columnas en plans/stores/store_modules/subscriptions, `subscription_grants`, `platform_invoices` + líneas + pagos en USD, contador de numeración, `notification_log.dedupe_key`, config de cobro, RLS: owner/admin leen lo suyo, staff solo el estado, avisos `billing_*` ocultos al staff; catálogo: Base 5/50, Pro 12/120, módulo `vouchers` en Pro + suelto 2 USD, sueltos a 3 USD, Pro 10 de equipo; Tienda Demo `comped`). Suite 07 (24 tests); `test:rls` 394/394; romper la política de facturas hace fallar 6 tests | ver git |
| 5.2 Módulos, límites y equipo | Hecha: `20261031100100_entitlements_engine.sql` (`sync_plan_modules`, `change_plan`, `set_store_addon` con precio congelado y dependencias, `set_store_module_grant`, `store_limit` con override y límites de módulos, `store_limits`, `store_usage`, `storefront_features`, `store_member_add/update/remove` con `max_staff` y reglas de rol, `create_store` v3 con periodo; cupones y descuento manual tras el módulo `vouchers`: `voucher_evaluate`, `price_lines.vouchers_enabled`, trigger en `order_discounts`) + `…100200` (`store_limits` definer). App: módulo `vouchers` en el registro («Cupones», «Ofertas»), pestañas por módulo, API de cupones con `vouchers`, campo de cupón y descuento manual solo con el módulo, `Cart.vouchersEnabled`, tienda pública sin monedas extra sin `multi_currency`, errores `max_staff`/`module_dependency`/`forbidden`/`conflict`. Suite 07: 58 tests; `test:rls` 428/428; `e2e:discounts` 35/35 (Base sin cupones → 403 y sin campo; con el suelto sí), `e2e:orders` 94/94, `e2e:notifications` 29/29, `e2e:catalog` 45/45 | ver git |
