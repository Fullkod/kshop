# Acompañar a un negocio nuevo: qué pedirle, qué hacemos y qué trae cada plan

Date: 2026-11-08

Fuente: conversación con Roberto del 2026-11-08 (cliente nuevo, un mercado parecido a Minimercado, plan Caja; aún sin
nombre de tienda), módulos leídos de `plan_modules` en producción y código de cierres y de `App móvil`.

## Qué se le pide al cliente
Mensaje por WhatsApp, sin términos técnicos:
- **Negocio:** nombre, logo (si tiene), una frase corta, dirección y horario, WhatsApp del negocio; nombre, correo y
  WhatsApp del dueño para su usuario.
- **Productos, en una sola lista sin repetir:** nombre, precio y moneda, costo, si se vende por unidad o por peso,
  cuánto tiene ahora y, si quiere, categoría. Vale un Excel o fotos claras de la libreta o la pizarra.
- **Cobros:** monedas que acepta y a qué tasa cambia, formas de pago.
- **Caja:** con cuánto cambio abre cada día (fondo).
- **Quién vende:** nombre, correo y WhatsApp de cada persona.

No se piden fotos de productos en el plan Caja: sin tienda online valen poco y en Minimercado fueron lo más trabajoso.

## Lo que hacemos en la carga
Crear la tienda en su plan y moneda base, el tipo «General» sin variantes, pasar su lista a la plantilla de Excel
(el Excel exige SKU: lo generamos, como `MM-0001` en Minimercado), importar con «crear lo que falte», y configurar
métodos de pago, fondo de caja y empleados.

Lo aprendido con Minimercado: suele faltar el costo (se carga sin él y se completa con el filtro «Sin costo»), hay que
aclarar qué precio vale si hay dos, y conviene contar la existencia el mismo día en que empieza a vender.

## Qué trae cada plan (producción, 2026-11-08)
| Plan | Módulos | Productos | Equipo |
|------|---------|-----------|--------|
| Caja | catalog, excel_import, orders, pos, sales_today | 300 | 2 |
| Base | Caja + storefront, shipping, discounts, mobile_app | 300 | 2 |
| Pro | Base + vouchers, themes, finance, multi_warehouse, multi_currency, whatsapp_notifications, custom_domain | sin límite | 10 |

## Ojo antes de prometer algo
- **El cierre de caja por WhatsApp al dueño es del módulo `whatsapp_notifications`:** solo Pro, o suelto a 3 USD/mes en
  Caja y Base (`private.store_has_module` en la función de cierre). Sin el módulo, el cierre funciona y se ve en la app.
- **El botón «Descargar Kshop Admin» está en App móvil (`mobile_app`), que Caja no trae.** A un cliente de Caja hay que
  mandarle el enlace del APK (Superadmin › Apps).
- **La caja cobra en CUP, USD y EUR en todos los planes** (`CURRENCY_CODES` en `PosScreen`). Lo que es de Pro es vender
  con precios en otras monedas (`multi_currency`).
- La tarjeta del local (plan Caja) enseña logo, nombre, la descripción del pie y WhatsApp; la dirección y el horario
  no tienen campo propio.

## Cobro de la puesta en marcha
Decisiones 31 y 32 de `decisiones.md`. En el landing de producción desde el 2026-11-08 (commit `e515051`, comprobado en
`kshop.fullkod.com`): 15 días de prueba, 5 USD una sola vez y «desde 8 USD/mes» el inventario.
