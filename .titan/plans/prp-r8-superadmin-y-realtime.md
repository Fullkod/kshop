# PRP: R8 · Panel del superadmin v2 y Realtime

> **Estado**: EN CURSO. Roberto lo pidió el 2026-10-27 («terminar el rediseño y lo del realtime, y después reviso
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

### R8 — Panel del superadmin
- `SuperadminShell`: barra lateral de 248 px (marca Kshop + «Superadmin»; Inicio · **Tiendas**: Tiendas, Dominios,
  Apps · **Cobros**: Facturación, Planes · **Plataforma**: WhatsApp; tarjeta de usuario con salir; menú lateral en
  móvil), barra superior con «Ver la web» y «Nueva tienda».
- Inicio (`/superadmin`): KPIs (tiendas activas, en prueba, suspendidas, por cobrar) y la tabla de tiendas v2.
- Resto de páginas: cabecera v2 (título 26 px Outfit + subtítulo), tarjetas `rounded-[14px]`, tablas con cabecera
  `bg-surface` en mayúsculas. Sin cambios de comportamiento.
- **Validación**: capturas 1280 y 390 (claro y oscuro) en `.titan/qa/rediseno-v2/R8/`; `qa:billing` y `qa:apps`
  (que recorren el superadmin) en verde **con el WhatsApp en «Simulado»**.

## Aprendizajes
- **Realtime necesita particiones de `realtime.messages`**: las crea el servicio Realtime al conectarse alguien; en un
  proyecto donde nunca se usó no hay ninguna y `realtime.send` falla en silencio (lo envuelve en un `WARNING`). Se
  crearon al abrir la primera conexión.
- `realtime.send` añade un `id` propio al payload.
- Los avisos «instant navigation» de Next en dev también salen en la consola del navegador (solo dev).
