# SKU automático al crear un producto (2026-11-01)

Pedido por Roberto en la sesión («haz q si se deja vacío se genere solo siguiendo las reglas de los excel»), sin tarea de
Tasknic. Commit `9f2779a`, subido por Roberto el mismo día y desplegado en Vercel.

## Qué hace
- Una variante guardada con el SKU vacío recibe uno en el servidor (`withSkus` en `apps/web/src/server/catalog/products.ts`),
  antes de `save_product`. Usa `skuBase(nombre del producto, nombre de la variante)` de `packages/core/src/catalog/variants.ts`,
  con el mismo formato de `suggestSku` («VESTIDO-NANDU-S-ROJO», «GORRA»), y añade `-2`, `-3`… si la tienda ya lo usa
  (`fillMissingSkus`, sin distinguir mayúsculas). Cumple la regla del Excel (`^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$`).
- Una variante **ya guardada** que llega con el SKU vacío conserva el suyo (si no, cada guardado le daría otro código).
- `variantInputSchema` acepta `sku: ""`; la comprobación de SKU repetidos del producto ignora los vacíos.
- Editor de producto (web y Kshop Admin): el campo dice «Vacío: se crea solo» y, al guardar un producto existente con
  algún SKU vacío, lo vuelve a leer para enseñar el código generado.
- El **Excel sigue exigiendo SKU** por fila: es la clave para actualizar productos al reimportar.
- Glosario de la ayuda («SKU») actualizado y PDF regenerado.

## Pruebas
Tests de `core` (101) y prueba contra la API local en la base de prueba: vacío → del nombre, mismo nombre → `-2`,
variante guardada conserva su SKU. Casos añadidos a `pnpm e2e:catalog`, **sin correr entero** por el reloj del PC
(ver `reference/trucos-entorno-y-next.md`).

## Ya existía (no se tocó)
La base acepta SKU que solo cambian en mayúsculas (`unique (store_id, sku)` distingue): `qa-gorra` y `QA-GORRA` conviven.
