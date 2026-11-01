# PRP KSH0004: plan «Caja» (vender en el mostrador sin tienda online)

> **Estado**: HECHO (2026-11-01). Roberto aprobó P1–P7 como se proponían («Caja», 3 USD/30, catálogo + caja + pedidos +
> ventas de hoy + Excel, 300 productos y 2 de equipo, página del local, tienda online solo subiendo al Base, ya).
> Migraciones en prueba y producción (`test:rls` 775/775 en las dos); `e2e:plan-caja` 23/23, `qa:plan-caja` 30/30.
> **Pendiente de Roberto**: deploy en Vercel y, después, marcar el plan Caja «Visible» en Superadmin › Planes
> (está oculto en producción hasta entonces). Memoria: `project/2026-11-01-ksh0004-plan-caja.md`.
> **Proyecto**: Kshop · **Sigue a**: Fase 5 (`prp-fase-5-suscripciones-y-modulos.md`), POS (`prp-pos-offline.md`).
> Memoria: `project/modulos-y-planes.md`, `project/2026-10-25-estudio-precios-cuba.md`. Tarea: Tasknic **KSH0004**.

---

## Objetivo

Un tercer plan, más barato que el Base, para el negocio que **solo quiere llevar su inventario y vender físicamente
con la caja** (Kshop Admin sin conexión, o Admin › Caja › Vender desde el navegador), **sin tienda online**. Quien lo
tenga puede subir a Base o Pro en cualquier momento sin perder nada: el catálogo, el stock y las ventas ya están.

## Por qué (lo que creo)

Roberto preguntó «¿qué crees?». Sí, tiene sentido, con tres matices:

| Lo que veo | Qué implica |
|------------|-------------|
| En Cuba hay muchos más mostradores que tiendas online. Un plan de entrada por debajo de los 5 USD del Base (y de Plaza Cubana) abre un segmento que hoy no entra, y el Base/Pro se venden luego por lo que ya tienen dentro («Disponible en el plan Base») | Plan nuevo, ordenado **antes** del Base en Superadmin › Planes y en la landing |
| La caja ya vende, descuenta stock al subir y anota faltantes; pero «llevar su inventario» pide la etapa 2 del POS (entradas de mercancía, conteos, mermas), que está en su propio PRP pendiente | Se puede lanzar ya con «inventario básico» (stock por variante, movimientos, Excel) y vender la etapa 2 como mejora para todos los planes |
| Lo que falta no es el plan (son datos) sino **el interruptor de la tienda online**: hoy toda tienda tiene web pública en su subdominio y no hay módulo que la apague | Módulo nuevo `storefront` («Tienda online»), en Base y Pro, fuera de Caja, comprobado en las tres capas como el resto |

## Qué

### Reparto propuesto

| | **Caja** (nuevo) | Base (5 USD) | Pro (12 USD) |
|---|---|---|---|
| Catálogo completo, Excel, stock, movimientos | ✓ | ✓ | ✓ |
| Caja (Kshop Admin sin conexión y web), Mostrador, Ventas de hoy | ✓ | ✓ | ✓ |
| Pedidos (ventas de mostrador y pedidos manuales) | ✓ | ✓ | ✓ |
| **Tienda online** (`storefront`): web pública, carrito, checkout por WhatsApp, cuentas de clientes, favoritos | — | ✓ | ✓ |
| Entregas, Ofertas visibles, App móvil de la tienda | — | ✓ | ✓ |
| Cupones, Avisos WhatsApp, Multimoneda, Multi-almacén, Finanzas, Dominio propio, Apariencia | — | sueltos | ✓ |
| Límites | 300 productos · 2 de equipo | 300 · 2 | sin límite · 10 |
| Precio propuesto | **3 USD/mes · 30/año** | 5 · 50 | 12 · 120 |

Módulos del plan: `catalog`, `orders`, `pos`, `sales_today`, `excel_import`. Todo lo demás se enseña con candado
«Disponible en el plan Base/Pro», como hoy.

### Qué ve quien entra al subdominio de una tienda Caja

Una página sencilla con el logo, el nombre, «Este negocio vende en su local», el WhatsApp y la dirección (de
`stores.settings`), en vez de la tienda. No un 404: el enlace sigue sirviendo de tarjeta de presentación y el día
que suba a Base la tienda aparece ahí mismo.

### Criterios de éxito

- Una tienda en Caja: `/` de su subdominio enseña la página del local; `GET /api/v1/stores/{id}/storefront|cart|checkout|
  customer-auth` responden 403 `module_not_enabled`; la caja vende (app y web), el stock baja, Pedidos y Ventas de hoy
  funcionan; Entregas, Ofertas y App móvil salen con candado.
- Subirla a Base enciende la web pública con el catálogo que ya tenía; bajarla de Base a Caja la apaga sin borrar nada
  (clientes, pedidos, zonas quedan).
- Las tres tiendas de hoy (Pro) no cambian: `sync_plan_modules` les añade `storefront` al meterlo en el Pro.
- Superadmin › Planes edita el tercer plan; Superadmin › Nueva tienda lo ofrece; la landing enseña tres tarjetas y el
  Base dice «Todo lo del Caja» + tienda online, entregas, ofertas, app.
- `e2e:billing`, `qa:billing`, `test:rls` siguen en verde y un `e2e:plan-caja` nuevo cubre lo de arriba con una
  tienda temporal.

### Inventario (código actual, 2026-11-01)

- Planes: filas `plans` (`base`, `pro`), `plan_modules`, `plan_limits`; `PLAN_CODES = ["base","pro"]` en
  `packages/core/src/platform.ts` (y el `planCode` de crear tienda); `public.plan_update` solo edita planes que existen
  (no crea); Superadmin › Planes y la landing leen la lista completa (`BillingPlan`), ordenada por `sort_order`.
- Landing: `planLines(plan, previous)` enseña en cada plan solo lo que añade al anterior; la prueba y el destacado son
  el último plan (`plans.at(-1)` = Pro): un Caja en primer lugar encaja sin tocar esa lógica.
- Tienda pública: `(front)/layout.tsx` solo distingue `status = suspended`; `storefront_features` usa
  `private.store_is_public`; las rutas públicas (`storefront`, `cart`, `checkout`, `customer-auth`, `customer`) no
  piden módulo; los lectores `sf_*` tampoco.
- Entitlements: `store_modules` se sincroniza desde `plan_modules` (`private.sync_plan_modules`) al cambiar el plan o
  al editar un plan; UI por `useEntitlements`/`has()`, API por `requireModule`, BD por `private.store_has_module`.
- POS: `pos` depende de `orders` y `catalog`; las ventas de mostrador no usan zona de entrega.

## Decisiones para Roberto

| # | Pregunta | Propuesta |
|---|----------|-----------|
| P1 | Nombre del plan | **«Caja»** (como el módulo). Alternativas: «Mostrador», «Local» |
| P2 | Precio | **3 USD/mes, 30/año**. Por debajo del Base (5) y de la competencia; un solo módulo suelto cuesta lo mismo, así que el salto al Base (+2) se ve barato |
| P3 | Qué incluye | catálogo, caja (app y web), pedidos (mostrador y manuales), ventas de hoy, Excel. **Finanzas no** (suelto a 3 o Pro) |
| P4 | Límites | **300 productos y 2 de equipo**, como el Base. Alternativa: 1 de equipo |
| P5 | El subdominio de una tienda Caja | **Página del local** (logo, nombre, WhatsApp, dirección). Alternativa: no responder |
| P6 | ¿La tienda online se vende suelta sobre Caja? | **No**: se sube al Base (si no, el Base sobra) |
| P7 | ¿Cuándo? | **Ya**, con el inventario básico; la etapa 2 del POS (entradas, conteos, mermas) como siguiente PRP, para todos los planes |

### Decisiones técnicas

- Módulo `storefront` («Tienda online»): `is_core = false`, `depends_on = ['catalog']`, sin `addon_price` (P6), en Base y
  Pro. Nunca «básico» del menú (R12): no es una sección del admin, es la web.
- Las tres capas: `(front)/layout.tsx` y la página `/app` (UI); `requireModule(storeId, "storefront")` en las rutas
  públicas (API); `private.store_is_public(store_id)` pasa a exigir también el módulo, con lo que `storefront_features`
  y todo lector `sf_*` que ya la use quedan cubiertos (BD). Comprobar que el proxy de dominio propio no necesita nada.
- Plan `caja` por migración (fila + módulos + límites), `PLAN_CODES` con `"caja"`, `sort_order` antes del Base.
- `MODULE_PITCH` de la landing y el candado del admin ganan el texto de `storefront`.

## Blueprint (fases)

1. **BD**: migración (módulo `storefront`, plan `caja`, `plan_modules` de base/pro/caja, `store_is_public` con módulo),
   resync de las tiendas existentes; `test:rls` y aislamiento (una tienda Caja no lee nada de otra; la pública 403).
2. **Server/API**: `PLAN_CODES`, `requireModule("storefront")` en `storefront`, `cart`, `checkout`, `customer-auth`,
   `customer`; `create_store` acepta `caja`.
3. **Web**: página del local en `(front)`, candados «Disponible en el plan Base» en Entregas/Ofertas/App, Superadmin ›
   Planes y Nueva tienda con el tercer plan, landing con tres tarjetas.
4. **Kshop Admin**: nada propio (entitlements); comprobar en navegador que una tienda Caja vende y sube ventas.
5. **Validación**: `e2e:plan-caja` nuevo, `e2e:billing`, `qa:billing`, `test:rls`, `typecheck`, `lint`, `build`.

## 🧠 Aprendizajes (Self-Annealing)

- **Lo público vive en cuatro helpers, no en uno**: `store_is_public`, `public_store_ids` y también `public_product_ids`
  y `public_variant_ids` (R10/R11) tenían inlined «la tienda está activa». El test 20 lo cazó (anon veía las variantes
  de una tienda Caja). Al cambiar qué es público, buscar `s.status = 'active'` en todos los helpers de `private`.
- **Cada módulo nuevo mueve los conteos** de `01_platform_isolation` y `07_billing_isolation` (8 → 9, 15 → 16) y el test
  de `MODULE_CODES` contra las migraciones (`insert into public.modules … values ('<code>'` en su propia línea).
- **Un módulo sin pantalla** rompía el test del registro del admin: `HEADLESS_MODULES` en core es la lista de los que no
  tienen sección.
- **`fetch` de Node tira la cabecera `Host`** (lo prohíbe la especificación): para pedir el subdominio de una tienda
  desde un e2e hay que usar `node:http`, o Chromium (que resuelve `*.localhost`).
- **`$$` dentro de comillas dobles en bash es el PID**: un `do $$ … $$` o un `create function` pasado por `pnpm
  db:query "…"` llega roto. Pasar el SQL por un archivo (o por un script de Python con `subprocess`, sin shell), y
  `->` sin comillas es una redirección (creó un archivo `upgrades` en la raíz).
- **Migrar producción antes del deploy** dejaba la landing vieja pintando mal el plan nuevo: ocultarlo (`is_public`)
  hasta desplegar es el interruptor limpio.
- **El candado «PRO» era un texto fijo** en los dos admins: con tres planes el boot tiene que decir qué plan desbloquea
  cada módulo (`admin_bootstrap.upgrades`).
