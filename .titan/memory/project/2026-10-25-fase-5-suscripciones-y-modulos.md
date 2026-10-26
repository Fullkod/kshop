# Fase 5 — Suscripciones y módulos (en curso: 5.1–5.5 hechas, falta la validación final 5.6)

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

## Pruebas (última pasada)
`test:rls` 475/475, `e2e:billing` 52/52, `qa:billing` 16/16 (capturas `.titan/qa/fase-5/`), `e2e:discounts` 35/35;
typecheck y lint OK.

## Falta (5.6, pausado por Roberto)
- `pnpm test`, `pnpm build`, reiniciar `pnpm dev` después del build, y repasar `e2e:{catalog,orders,discounts,
  notifications,billing}` y `qa:{orders,discounts,notifications,billing}`.
- Quitar `.titan/qa/fase-5/console-errors.txt` (resto de una pasada fallida, ya commiteado).
- Opcional: reiniciar el contador de facturas (`private.platform_invoice_counters`) que gastaron los E2E/QA
  (la primera factura real saldría con un número > 0001).
- Cerrar PRP, `arranque-y-fases.md` y esta entrada.
