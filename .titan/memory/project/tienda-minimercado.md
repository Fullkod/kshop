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

## Pie y «Sobre nosotros» (2026-11-01)
Pedido por Roberto: un pie como el de Klau's Shop, solo con lo que le encaja. Escrito en producción con `SUPABASE_SECRET_KEY`
(como el de Klau); la caché de la tienda lo mostró en menos de un minuto.
- Página `/page/sobre-nosotros`: el texto de su sección «Sobre nosotros» de la portada (sin inventar nada), resumen «Tu
  tienda de barrio, en tu móvil.» y los botones «Ver productos» y WhatsApp.
- Menú del pie: «Categorías» (Salsas y condimentos, Galletas y snacks, Dulces y confituras, Conservas, Granos y pastas,
  Limpieza, Hogar y «Todas las categorías»; fuera Bebidas y Tabaco, sin productos publicados), «Tu cuenta» (Mis pedidos,
  Favoritos) e «Información» (Sobre nosotros, Descargar la app; su APK está publicada).
- No se copió «Encargos» (no lo ofrecen) ni zonas de entrega (aún sin envíos configurados). Sin envíos, el checkout
  sigue funcionando con la entrega «a convenir».
- Se edita en Admin › Apariencia › Menús y Páginas.

## Agenda de precios y equipo (2026-11-04)
- **Equipo:** dos empleados (`staff`) creados en producción con correo ya confirmado y contraseña elegida por el negocio
  (Auth admin + `store_member_add` con el dueño como actor). Las credenciales las tiene Roberto, no van aquí.
- **Agenda:** fotos de la libreta y la pizarra de la nevera en `products/04-11-26/` (solo nombre y precio; la columna
  «Costo» de la libreta está vacía). Generador `catalogo/_build/agenda_2026_11_04.py` → `catalogo/minimercado-agenda-2026-11-04.xlsx`:
  hoja «Productos» para importar con «Actualizarlos con los datos del Excel» (cambios de precio, 27 nuevos en Borrador,
  categoría a los 17 productos creados a mano que no tenían) y hoja «Revisión» con cada línea, su producto en Kshop y las
  dudas. 2026-11-05: Roberto revisó «Productos» y respondió en «Revisión» (`_build/agenda_2026_11_04_casar.py` y
  `_respuestas.py`): 106 filas (98 publicados, 6 archivados —duplicados—, 2 en borrador). Luego publicó también los 25
  borradores que no salían en la agenda (`_publicar.py`): 130 filas, 126 publicados y 4 archivados, todas con categoría;
  «Revisión» vacía. «La Florida (paquete blanco)» (MM-0172, duplicado de la levadura) se borró de la BD el 2026-11-05 con
  sus imágenes. Falta importar con «Actualizarlos con los datos del Excel».
- En la tienda hay duplicados creados a mano (café espresso, levadura La Florida, toallitas húmedas) y un SKU «1.» (Roberto lo cambió a `MM-0202`).
