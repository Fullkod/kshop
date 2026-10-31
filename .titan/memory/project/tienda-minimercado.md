# Tienda Minimercado (cliente real)

Fecha: 2026-10-30. Tienda `minimercado` (Pro · Cortesía), abierta al público en físico; aún sin envíos ni métodos
de pago. Materiales: `_materiales/kshop/clients/minimercado/` (`images/`, `brand/kit/`, valores de apariencia en
`brand/kit/tienda/apariencia-kshop.md`).

## Catálogo
Importado el 2026-10-30 con la sesión del dueño (entonces el superadmin no podía; ya puede, ver `pendiente-superadmin-importar-excel.md`):
174 productos de tipo «General», SKU `MM-0001`…, precios en CUP. Sale de cruzar `LEO.xlsx` con las fotos de la tienda; el
archivo, las imágenes y lo que falta confirmar están en `catalogo/` de los materiales (`catalogo.md`). En Borrador quedaron
los productos sin foto, el tabaco, los de precio dudoso y los que no están en el Excel.

## Portada montada
- Tema del kit (Fresco + 12 colores, Poppins + DM Sans) y logo `minimercado-logo-tienda.png`.
- Barra de anuncio, carrusel (fachada e interior), beneficios, Categorías y Novedades (encendidas: se muestran solas al
  cargar catálogo), banner doble y «Sobre nosotros». Las categorías del texto salen de las que hay pintadas en la fachada.
- No se promete domicilio ni pago al recibir hasta que Roberto o el cliente lo confirmen y se configure.
- La fachada lleva recortes propios (escritorio y móvil) para que se lea el letrero: el carrusel recorta por el centro.

## Superadmin y store-media
Las imágenes se suben directo a `store-media` con el token de la sesión, y la política solo admitía miembros de la tienda:
el superadmin recibía 403. Arreglado en `20261108100900_store_media_superadmin_upload.sql` (solo INSERT, solo dentro de
`stores/{id}/`). Sigue sin poder listar, actualizar ni borrar archivos de otra tienda desde el cliente.

La sesión del superadmin no pasa a `{slug}.kshop…` (cada host guarda la suya): para trabajar en una tienda sin su login,
la API `/api/v1/stores/{id}/content/*` acepta el token del superadmin desde `kshop.fullkod.com`.
