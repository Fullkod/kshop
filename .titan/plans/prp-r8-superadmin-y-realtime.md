# PRP: R8 · Panel del superadmin v2 y Realtime

> **Estado**: HECHO (2026-10-27), pendiente de la revisión de Roberto. Roberto lo pidió el 2026-10-27 («terminar el rediseño y lo del realtime, y después reviso
> todo»): se implementa y él revisa al final, sin aprobación previa del plan.
> **Sigue a**: `prp-rediseno-v2.md` (R0–R7 hechas). Memoria: `project/pendiente-realtime.md`.

## Objetivo
1. **R8**: el panel del superadmin (`kshop.fullkod.com/superadmin`) con el mismo lenguaje que el admin de tienda de R6
   (`docs/design-v2/04-ADMIN.md`): barra lateral `night` agrupada, barra superior, cabeceras, tarjetas y tablas v2.
2. **Realtime**: que los datos con sesión se actualicen solos: pedidos (lista, detalle, Inicio, contador y campana),
   avisos de WhatsApp, cola de WhatsApp y cobros del superadmin, y la página pública del pedido del cliente.

## Decisiones técnicas (tomadas; Roberto revisa)
| # | Decisión | Por qué |
|---|----------|---------|
| T1 | **Señales por `realtime.send`** desde triggers, sin datos de la fila (`{table, op}`), y el cliente vuelve a leer por la API de siempre | `postgres_changes` mandaría la fila entera (costes, teléfonos) a quien escuche: Realtime no añade ninguna vía de lectura |
| T2 | Temas: `store:{id}` privado (staff de la tienda y superadmin, RLS en `realtime.messages`), `platform` privado (superadmin), `order:{public_token}` público con solo el estado | El token ya es el secreto de la página pública del pedido; sirve a invitados sin cuenta |
| T3 | Un canal por tema y cliente, compartido con contador; ráfagas agrupadas (400 ms); al reconectar se vuelve a leer | supabase-js reutiliza el canal del mismo tema; las señales perdidas sin conexión se recuperan |
| T4 | Kshop Admin deja el sondeo de 60 s de la lista de pedidos | Lo sustituye Realtime |
| T5 | Sin cambios de BD para R8 | Es solo presentación |

## Fases
### Realtime — Hecha (2026-10-27)
- Migración `20261106100100_realtime_signals.sql`: `private.realtime_signal()` (security definer; un fallo nunca
  rompe la escritura) en `orders`, `order_events`, `notification_log`, `platform_invoices` y `stores`; política de
  lectura en `realtime.messages` (sin política de escritura: nadie emite en temas privados).
- Tests `12_realtime_isolation` (10): señales sin datos, tema público con solo el estado, staff A no recibe B ni
  `platform`, cliente y anon sin temas privados, superadmin todo, nadie emite.
- Cliente: `subscribeToChanges` (`@kshop/data`), `useRealtimeVersion`/`useStoreVersion` (`@kshop/admin`),
  `useOrderVersion` (`@kshop/storefront`). Conectado en Inicio, lista y detalle de pedidos, contador y campana del
  admin, registro de avisos, Kshop Admin (mismos componentes), cola de WhatsApp y Cobros del superadmin y la página
  del pedido del cliente.
- **Validación**: 595/595 RLS; en navegador, tocar un pedido desde el servidor hace que la lista, el detalle y la
  página pública vuelvan a leer solos (4/4, sin errores de consola).

### R8 — Panel del superadmin — Hecha (2026-10-27)
**Resultado**: `SuperadminShell` nuevo (barra `night` con Kshop + «Superadmin», grupos Tiendas · Cobros · Plataforma,
activo en violeta de marca fijo, tarjeta de usuario, menú lateral en móvil, barra superior con «Ver la web» y «Nueva
tienda»). «Tiendas» sigue en `/superadmin` (no hay «Inicio» aparte: las QA entran ahí) con 4 KPIs (activas, en
prueba, suspendidas, por cobrar) y tabla v2 con inicial. **Todo el admin** (tienda y superadmin) gana el estilo v2
desde el contenedor (`components/admin-content.ts`: títulos Outfit 26, cabeceras de tabla en versalitas, tarjetas 14)
y las 7 barras de secciones pasan a **pestañas subrayadas** (activa 700 violeta con barra de 2 px, como pide 04 para
Apariencia). Arreglado también en el admin de tienda: el ítem activo de la barra lateral era ilegible en modo oscuro
(`bg-primary` es lila claro en oscuro). Evidencia en `.titan/qa/rediseno-v2/R8/` (8 páginas del superadmin y 5 del
admin, 1280/390, claro y oscuro; sin errores ni scroll horizontal). QA con WhatsApp en «Simulado»: `qa:billing`
16/16, `qa:orders` 14/14, `qa:pro` 18/18, `qa:discounts` 9/9, `qa:apps` 27/28 (un 500 de la portada en frío, ver
abajo).

### Lo que faltaba de v2 (2026-10-27, segunda tanda: «implementemos todo lo que falta»)
- **Búsqueda global** (`admin/AdminSearch.tsx`): pedidos (número con o sin prefijo, nombre, teléfono), productos
  (`adminSearchProducts`), clientes (abre sus pedidos con `?q=`) y secciones del menú; Ctrl/⌘ K, flechas y Enter; en
  móvil un icono abre el campo sobre la barra. La lista de pedidos con texto busca en todos los estados.
- **Hoy · 7 días · Mes** en Inicio: migración `20261106100300_admin_home_periods.sql` (`periods` en
  `admin_home_summary`: vendido, pedidos y cobrado en moneda base con la tasa del pedido, y el periodo anterior) +
  tests en `11_home_v2_isolation`; el «vs» dice ayer / 7 días antes / mes pasado.
- **Arreglos visuales** (captura de Roberto en Cupones, 1920 oscuro): las pestañas subrayadas sacaban una barrita de
  scroll (el subrayado con `-mb-px` desbordaba): ahora la línea es una sombra interior; el contenido del admin va en
  una columna centrada de `max-w-6xl` y las páginas estrechas se centran en ella; los importes de los KPIs caben en
  móvil; el panel reintenta 3 veces antes de «No se pudo cargar» y ofrece «Reintentar». Barrido automático de 40
  pantallas × (1920 oscuro, 1280 claro, 390 claro): sin scroll horizontal, barritas ni desbordes.
- **Landing móvil**: la tienda de ejemplo (`_landing/DemoStore.tsx`) se carga con `next/dynamic` al acercarse, los
  presets llegan resueltos del servidor y `CurrentYear` por subruta (`@kshop/storefront/current-year`); JetBrains Mono
  sin precarga. Lighthouse móvil (mediana de 3): **87** (antes 76); el login del superadmin, la página más simple, da
  84: lo que falta hasta 90 es común a todo el sitio (LCP simulado de 3,3–4 s). Escritorio 100.
- QA con WhatsApp en «Simulado»: `qa:orders` 14/14, `qa:pro` 18/18, `qa:apps` 28/28; RLS 597/597.

### Build de Vercel (2026-10-27) — Arreglado
El despliegue del push falló en el prerender de `/s/demo` por `57014`. Causa: Supabase en la instancia más pequeña
(`max_connections` 60, CPU compartida); cada consulta de la tienda gasta 0,4–0,6 s de CPU en `graphql.resolve` y el
build lanzaba un worker por CPU con 2 páginas cada uno: las consultas llegaban a 10–12 s. Arreglo: migración
`20261106100200_anon_statement_timeout.sql` (anon a 8 s, como `authenticated`) y `next.config.ts` con `cpus: 1`
(un solo worker). Build local: 230 páginas en 19 s con 0 reintentos (antes 6).
- `SuperadminShell`: barra lateral de 248 px (marca Kshop + «Superadmin»; Inicio · **Tiendas**: Tiendas, Dominios,
  Apps · **Cobros**: Facturación, Planes · **Plataforma**: WhatsApp; tarjeta de usuario con salir; menú lateral en
  móvil), barra superior con «Ver la web» y «Nueva tienda».
- Inicio (`/superadmin`): KPIs (tiendas activas, en prueba, suspendidas, por cobrar) y la tabla de tiendas v2.
- Resto de páginas: cabecera v2 (título 26 px Outfit + subtítulo), tarjetas `rounded-[14px]`, tablas con cabecera
  `bg-surface` en mayúsculas. Sin cambios de comportamiento.
- **Validación**: capturas 1280 y 390 (claro y oscuro) en `.titan/qa/rediseno-v2/R8/`; `qa:billing` y `qa:apps`
  (que recorren el superadmin) en verde **con el WhatsApp en «Simulado»**.

## Aprendizajes
- **La CPU de Supabase es el cuello de botella**: en reposo una lectura de tienda tarda 0,4–0,6 s en la base, con carga
  (build, QA, varios pedidos seguidos) pasa de 8 s. Cada pedido invalida la caché de la tienda y la portada se vuelve a
  calcular en frío (~10 consultas). Opciones: subir la instancia (coste, decide Roberto) o juntar consultas de
  `fetchHome`/ficha en menos llamadas.
- `staticGenerationMinPagesPerWorker` no limitó los workers (seguían 7); `experimental.cpus: 1` sí.
- **Realtime necesita particiones de `realtime.messages`**: las crea el servicio Realtime al conectarse alguien; en un
  proyecto donde nunca se usó no hay ninguna y `realtime.send` falla en silencio (lo envuelve en un `WARNING`). Se
  crearon al abrir la primera conexión.
- `realtime.send` añade un `id` propio al payload.
- Los avisos «instant navigation» de Next en dev también salen en la consola del navegador (solo dev).
