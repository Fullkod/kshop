> Sembrado el 2026-10-24 desde `_materiales/kshop/08-modulos-y-planes.md`. Las referencias "ver 0X" apuntan a las
> entradas hermanas de `project/` (ver índice en `MEMORY.md`). Desde ahora la memoria viva es esta.

# Módulos por plan (requisito desde el día 1)

> 2026-10-24, Roberto: un plan **base** y funcionalidades que se cobran aparte como **plus**. El código
> se programa desde el inicio pensando en módulos activables por tienda.

## Principio
- **El esquema de BD existe para todas las tiendas** (no hay tablas "opcionales"). Lo que se activa o
  desactiva es la **funcionalidad**: pantallas, endpoints y procesos.
- Activar/desactivar un módulo **nunca borra datos**: si la tienda baja de plan, los datos quedan y vuelven al reactivar.
- Un módulo se puede tener por el plan, por compra suelta (add-on) o por regalo del superadmin (con o sin fecha de fin).

## Tablas (plataforma)
| Tabla | Campos clave |
|-------|--------------|
| `modules` | code (`finance`, `multi_warehouse`…), name, description, depends_on text[], is_core |
| `plan_modules` | plan_id, module_code, limits jsonb |
| `store_modules` | store_id, module_code, source (`plan`/`addon`/`grant`), enabled, limits jsonb, starts_at, ends_at, granted_by |
| `plan_limits` | plan_id, key (`max_products`, `max_staff`, `max_warehouses`, `max_currencies`…), value |

Vista/función `store_entitlements(store_id)` = módulos + límites efectivos (plan + add-ons + grants vigentes).

## Dónde se comprueba (las tres capas)
1. **UI**: el menú del admin y las pantallas se generan desde los entitlements; un módulo no activo se
   muestra como "Disponible en el plan X" (venta cruzada), no desaparece sin explicación.
2. **API**: `requireModule(storeId, 'finance')` en cada endpoint del módulo; límites al crear
   (`max_products`…) comprobados en servidor.
3. **BD**: para lo sensible, la función `private.store_has_module(store_id, code)` dentro de RLS o de
   las funciones SQL (así ni pg_graphql ni la app móvil se saltan el control).
- Entitlements cacheados por tienda (tag `store:{id}:entitlements`), invalidados al cambiar plan/add-on.
- Los mismos entitlements viajan a la app móvil para mostrar/ocultar secciones.

## Organización del código
Cada módulo vive en su carpeta (`features/finance`, `features/warehouses`…) con su `module.ts`
(code, rutas del admin, items de menú, permisos) y se registra en un único registro de módulos.
El core no importa nada de un módulo opcional; los módulos sí pueden usar el core.

## Reparto (v2 — 2026-10-24, ajustado por Roberto: "el inicial estaba un poco fuerte")
Dos planes + módulos sueltos:

| Base | Pro (incluye todo lo de Base +) | Módulos sueltos |
|------|--------------------------------|-----------------|
| Catálogo completo (tipos, atributos, variantes, categorías, colecciones, marcas) | **Finanzas** | Cualquier módulo del Pro se puede **comprar suelto** sobre el Base, con **precio por módulo** |
| Carrito + checkout por WhatsApp, órdenes y estados | **Multi-almacén** | |
| Zonas y métodos de entrega | **Multimoneda** | |
| **Descuentos y cupones** (enganchan) | **Avisos automáticos por WhatsApp** | |
| **App móvil de la tienda** (engancha) | **Dominio propio** | |
| Importar/exportar productos por Excel | Más productos y staff (límites más altos) | |
| Dashboard básico: **ventas de hoy** (gratis) | | |
| Tema (tokens, logo, banners, home sections, menús, páginas) | | |
| Subdominio, 1 almacén, 1 moneda | | |
| **Límite de productos** (y de staff) | | |

Más adelante: "gestores", WhatsApp propio de la tienda, temas avanzados.

Para los módulos sueltos: `modules.addon_price` + `addon_currency` (o `module_prices` si cambia por
plan/periodo); la factura mensual = plan + add-ons activos − grants (ver `06-suscripciones.md`).
Límites: **Base = 2 usuarios de staff** (decidido 2026-10-24). Nº de productos por plan y staff del Pro: por definir.
Reparto v2 aprobado por Roberto el 2026-10-24.

## Multi-almacén (opinión Claude)
No es demasiado **si se separa esquema de funcionalidad**:
- El esquema ya lo trae (`warehouses`, `stocks` por almacén, `warehouse_shipping_zones`, `stock_movements`):
  hacerlo desde el inicio cuesta poco; añadirlo después obliga a migrar todo el stock y las reservas.
- La mayoría de tiendas tendrá **un solo almacén** y no lo verá nunca: el stock se edita "plano".
- Con el módulo activo: varios almacenes (tienda física + depósito, o un punto por municipio),
  qué almacén sirve cada zona, puntos de recogida, transferencias entre almacenes, stock por almacén.
- Asignación al reservar (MVP): almacén que sirve la zona del pedido con stock suficiente; si ninguno
  tiene todo, el de prioridad más alta + aviso al admin. Sin dividir pedidos entre almacenes en el MVP.

## Módulo Finanzas
Roberto (2026-10-24): "cuánto se ha vendido en el día **por cada moneda**, cuánto queda en almacén, y
cosas así de finanzas de negocios". Propuesta:
- **Ventas por moneda**: por día, semana, mes y rango, **separadas por la moneda en que se cobró**
  (ej. hoy: 45 000 CUP + 120 USD + 50 EUR) y además un total equivalente en moneda base. Nº de órdenes,
  ticket medio, comparación con el periodo anterior.
- **Inventario**: cuánto queda por producto/variante y **por almacén**, unidades reservadas vs disponibles,
  **valor del inventario** (a costo y a precio de venta), productos agotados o bajo mínimo
  (`stocks.low_stock_threshold`), productos sin movimiento en N días. Historial desde `stock_movements`.
- **Desglose**: por producto, categoría, marca, método de pago, moneda, zona de entrega y canal.
- **Margen**: precio de venta − precio de costo (ambos guardados en la línea de la orden al comprar).
- **Cobros**: pagos registrados vs pendientes, reembolsos.
- **Gastos manuales** (opcional): `expenses` (store_id, date, category, amount, currency, note) → ganancia neta.
- **Cierre de caja diario** (opcional): `cash_closures` por día y método de pago.
- **Exportar** a Excel/CSV (klauShop ya tiene `dashboard/export`).
- Totales "equivalentes" en moneda base con la tasa guardada en cada orden (no la tasa de hoy); los
  importes por moneda se muestran siempre tal como se cobraron.
- Rendimiento: tabla resumen `daily_sales` (store_id, date, currency, orders, gross, discounts,
  shipping, refunds, cost) actualizada por trigger/cron al pagar o reembolsar; los gráficos leen de ahí.
- El dashboard básico (ventas de hoy, pedidos pendientes) podría quedar en la base y el módulo dar el detalle.
