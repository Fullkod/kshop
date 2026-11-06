# PRP KSH0012: Cierre de caja

> **Estado**: PENDIENTE (falta el OK de Roberto y la pregunta P1)
> **Fecha**: 2026-11-06
> **Proyecto**: Kshop · Tasknic KSH0012

---

## Objetivo

Que un empleado cierre el día de la caja desde Kshop Admin (o la caja web): cuenta el efectivo y Kshop lo compara
con lo esperado. El cierre queda guardado y le llega al dueño por WhatsApp, para que sepa cuánto debe encontrar al
llegar aunque no estuviera.

## Por qué

Hoy el jefe solo ve el total de la tienda (Inicio, «Por método»). Con dos teléfonos vendiendo, o con pedidos de la
web, no puede separar lo de un empleado. Cuadrar se hace de palabra y no queda registro. El sistema ya guarda quién
hizo cada venta de caja (`pos_sales.cashier_id`) y en qué teléfono (`device_id`), pero no hay pantalla que lo use.

## Decisiones de Roberto (2026-11-06)

| # | Decisión |
|---|----------|
| D1 | **Un cierre por día** por empleado (día de Cuba, como «Ventas de hoy»). |
| D2 | **Hay fondo de caja** (el cambio con el que se abre). Cómo se registra: ver P1. |
| D3 | El empleado **ve lo esperado** antes de contar (no cuenta «a ciegas»). |
| D4 | Al cerrar, **WhatsApp al dueño** con el cuadre: lo esperado por moneda y método, lo contado y la diferencia. |

## Pregunta abierta

- **P1 — Fondo de caja.** Propuesta: un ajuste fijo por tienda, «Fondo de caja» (por moneda, normalmente solo CUP),
  que el dueño pone una vez en Admin › Caja. El cierre lo da por hecho y el empleado puede corregirlo ese día, y queda
  anotado. Alternativa: un paso «Abrir caja» cada mañana con el fondo contado (más exacto, pero es un paso más que
  se olvida).

## Qué

### Comportamiento esperado

**El empleado (Kshop Admin › Caja › «⋯» › «Cerrar el día»)**
1. Si hay ventas sin subir, primero se suben. Sin conexión no se puede cerrar: el cierre es del servidor.
2. Ve lo esperado de **sus** ventas de caja de hoy, por moneda:
   `fondo + efectivo cobrado − vueltos − ventas anuladas`. Aparte, lo cobrado por cada método que no es efectivo
   (Transferencia…), «a comprobar en el banco».
3. Escribe el **efectivo contado** por moneda y, si quiere, una nota.
4. Kshop enseña la diferencia («Sobran 20 CUP», «Faltan 150 CUP») y pide confirmar. El cierre **no se edita después**.
5. Si vende algo después de cerrar, esa venta va a un «segundo cierre» del mismo día (no se reabre el primero).

**El dueño**
- Recibe por WhatsApp (a los contactos de avisos con «Cierre de caja» marcado):
  > Cierre de caja · Tienda · jueves 6 nov · Ana
  > Debe haber en efectivo: 12 450 CUP (fondo 500) y 20 USD
  > Contado: 12 300 CUP y 20 USD → **faltan 150 CUP**
  > Transferencias a comprobar: 3 200 CUP
  > 14 ventas · 1 anulada · Nota: «…»
- En Admin › Caja › **Cierres** (web y Kshop Admin): la lista por día y empleado (esperado, contado, diferencia), y
  cada cierre abre sus ventas.

### Criterios de éxito
- [ ] Un empleado cierra el día desde el teléfono y el dueño recibe el WhatsApp (o queda «Simulado» en dry_run).
- [ ] Con dos empleados vendiendo el mismo día, cada cierre cuenta solo las ventas de quien cierra.
- [ ] Lo esperado coincide con las ventas: efectivo − vueltos, por moneda; anuladas fuera; métodos aparte.
- [ ] Un cierre no se edita ni se borra; otro cierre del mismo día recoge solo las ventas posteriores.
- [ ] Aislamiento: un usuario de la tienda B no lee ni crea cierres de A; un empleado ve sus cierres y el dueño todos.
- [ ] Ayuda: guía «Quiero cerrar la caja» y su «?».

## Modelo de datos (propuesta)

```sql
-- Un cierre: el empleado, el día de Cuba, lo esperado y lo contado (jsonb por moneda), la nota.
create table public.pos_closings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  cashier_id uuid references auth.users (id) on delete set null,
  day date not null,                 -- America/Havana
  sequence int not null default 1,   -- 2.º cierre del mismo día si vende después
  float jsonb not null default '{}', -- fondo usado {CUP: 500}
  expected jsonb not null,           -- {cash: {CUP: 12450, USD: 20}, methods: [{name, currency, amount}], sales, voided}
  counted jsonb not null,            -- {CUP: 12300, USD: 20}
  note text check (char_length(note) <= 500),
  closed_at timestamptz not null default now(),
  unique (store_id, cashier_id, day, sequence)
);
alter table public.pos_sales add column closing_id uuid references public.pos_closings (id);
-- Ajuste de la tienda (si P1 = ajuste fijo): stores.pos_float jsonb default '{}'.
-- Contactos: store_notification_contacts.notify_cash_closing boolean default true.
```

- Escritura por `POST /api/v1/stores/{id}/pos/closings` → función SQL transaccional (`for update` sobre las
  `pos_sales` del empleado sin cierre) con `execute` solo para `service_role`. Nueva ruta en `SECTION_WRITES` (sección
  Caja).
- Lecturas: `admin_pos_closings(store, days)` y la vista previa `pos_closing_preview` (lo esperado antes de contar).
- Aviso: evento nuevo `cash_closing` (audiencia tienda) en `NOTIFICATION_EVENTS`, con plantilla editable como los demás.

## Blueprint

1. **BD**: tabla, columnas, funciones (preview, cerrar, listar), evento de WhatsApp y suite de aislamiento
   `22_pos_closings_isolation` → prueba y producción.
2. **API**: rutas preview/cerrar/listar con Zod, `requireModule(pos)`, `SECTION_WRITES`.
3. **Caja (Kshop Admin y web)**: «Cerrar el día» en la hoja «⋯» (subir pendientes → esperado → contar → confirmar).
4. **Dueño**: Admin › Caja › Cierres (web y Kshop Admin); «Fondo de caja» si P1 = ajuste; casilla «Cierre de caja»
   en los contactos de avisos.
5. **Validación**: e2e de la API (dos empleados, segundo cierre, anuladas, otra tienda), QA en navegador a 390 px,
   ayuda (guía, capturas, PDF), APK.

## Ojo

- **Minimercado no tiene ningún contacto de avisos**: sin el teléfono del dueño ahí, el WhatsApp del cierre no sale.
  Hay que añadirlo (Admin › Avisos WhatsApp) antes de usarlo.
- WhatsApp está en «Real» en producción: los `e2e`/`qa` de esta fase van a la base de prueba (dry_run).
- Ventas de la caja **web** (sin teléfono) también tienen `cashier_id`: entran en el cierre de quien las hizo.
