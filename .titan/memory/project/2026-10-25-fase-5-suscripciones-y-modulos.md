# Fase 5 — Suscripciones y módulos (hecha, 2026-10-25)

PRP con progreso, decisiones y aprendizajes: `.titan/plans/prp-fase-5-suscripciones-y-modulos.md`.
Precios: `2026-10-25-estudio-precios-cuba.md`. Decisión 25 en `decisiones.md`.

## Decisiones de Roberto
- USD siempre; cobro en persona y en efectivo, sin comprobantes; sin prorrateo; equipo en esta fase; avisos de cobro
  al WhatsApp de la tienda; número de soporte configurable (Superadmin › Cobros); dominio propio vendible ya.
- Base 5 USD/mes (50/año), Pro 12 (120/año); sueltos: Cupones 2, el resto 3. Prueba por defecto 30 días.
- Base **sin cupones**: solo ofertas visibles (`discounts`); cupones y descuento manual = módulo `vouchers`.
- **Apariencia la configura la plataforma**: `themes` fuera del Base, en Pro, no se vende suelto (se puede regalar);
  el superadmin la edita en cualquier tienda.

## Dónde está cada pieza
- BD: `20261031100000…100600` (esquema de cobro, motor de módulos/límites/equipo, motor de facturación con
  `billing_tick` diario 11:00 UTC, lectores invoker, admin de planes, apariencia Pro). Suite `07_billing_isolation`.
- Server: `server/billing/index.ts`, `server/team.ts`, `server/store-writable.ts` (tienda suspendida = solo lectura,
  enganchado en `apiHandler`), `content/resources.ts` (superadmin edita la apariencia).
- API: `/api/v1/platform/{plans,modules,billing/settings,invoices,stores/{id}/subscription/*}`,
  `/api/v1/stores/{id}/{billing,team}`.
- Web: Superadmin › Cobros, Planes, Tienda › Suscripción; Admin › Plan y facturación, Equipo; `AccountBanner`;
  candados «Pro · N USD».
- Tienda Demo: cortesía (no se factura); `demo:seed` la deja así.

## Pruebas (validación final 5.6)
`test`, `typecheck`, `lint`, `build` OK; `test:rls` 475/475; `e2e:catalog` 46/46, `e2e:orders` 94/94,
`e2e:discounts` 35/35, `e2e:notifications` 29/29, `e2e:billing` 52/52; `qa:orders` 14/14, `qa:discounts` 9/9,
`qa:notifications` 8/8, `qa:billing` 16/16 (capturas `.titan/qa/fase-5/`).
Las pruebas que editan contenido en una tienda Base deben regalarle antes `themes` (`set_store_module_grant`).

## Pendiente
- Antes de la primera factura real: poner a cero `private.platform_invoice_counters` (las pruebas gastan números
  porque dev = prod; hacerlo solo si `platform_invoices` está vacía).
- Configurar el WhatsApp de soporte en Superadmin › Cobros.
