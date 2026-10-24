> Sembrado el 2026-10-24 desde `_materiales/kshop/06-suscripciones.md`. Las referencias "ver 0X" apuntan a las
> entradas hermanas de `project/` (ver índice en `MEMORY.md`). Desde ahora la memoria viva es esta.

# Suscripciones de las tiendas (borrador)

## Requisitos (Roberto, 2026-10-24)
- Las tiendas pagan suscripción.
- Poder dar **tiempo gratis variable** (1 mes a una, 6 meses a otra…).
- **Socios fundadores** y "esas cosas" (condiciones especiales).

## Modelo propuesto
| Tabla | Campos clave |
|-------|--------------|
| `plans` | code, name, price, currency, interval (`month`/`year`), is_public, sort_order — módulos y límites en `plan_modules` / `plan_limits` (ver `08-modulos-y-planes.md`) |
| `subscriptions` | store_id, plan_id, status (`trialing`/`active`/`past_due`/`suspended`/`cancelled`/`comped`), current_period_start/end, trial_ends_at, price_override, currency, notes |
| `subscription_grants` | store_id, type (`free_days`, `discount_percent`, `price_lock`, `founder`), value, reason, starts_at, ends_at (null = de por vida), granted_by |
| `platform_invoices` | store_id, subscription_id, period, amount, currency, status (`pending`/`paid`/`void`), paid_at, method, reference, evidence_url |

- **Trial variable**: el superadmin fija `trial_ends_at` al crear la tienda o añade un grant `free_days`.
- **Socio fundador**: grant `founder` (badge + precio congelado `price_lock` de por vida o descuento %).
- **Cortesía** (`comped`): tienda gratis indefinidamente (p. ej. la de un socio).
- Precio efectivo = `price_override` ?? precio del plan, aplicando grants vigentes.
- Al vencer sin pago: `past_due` → aviso por WhatsApp/email → periodo de gracia → `suspended`
  (tienda pública muestra "tienda temporalmente no disponible"; admin entra solo a pagar/exportar).
- Límites del plan se comprueban en servidor al crear productos/staff/dominios.

## Cobro
**Decidido (2026-10-24): cobro manual al inicio** (transferencia/efectivo) registrado por
el superadmin en `platform_invoices` con comprobante, igual que los pagos de órdenes. Una pasarela
(Stripe/Polar/otra) se puede añadir después sin cambiar el modelo.
