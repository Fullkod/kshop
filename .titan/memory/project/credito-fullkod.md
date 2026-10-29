# Crédito de Fullkod en Kshop (CREA0004)

Fecha: 2026-10-29.

## Dónde está
- **Plataforma** (`apps/web/src/app/(platform)/page.tsx`): pie «© · Un producto de ◆ Fullkod · dominio».
- **Superadmin y admin de cada tienda** (`apps/web/src/components/FullkodCredit.tsx`): «Kshop · Un producto de ◆ Fullkod».
  - Va fijo abajo en los logins, en las pantallas de contraseña y en la de sin acceso.
  - En el resto, es una línea a la derecha al final del contenido (`SuperadminShell`, `AdminShell`).
- **Tiendas públicas** (`packages/storefront/src/components/StoreFooter.tsx`): «Tienda creada con Kshop · un producto
  de ◆ Fullkod».
  - Usa la URL absoluta del símbolo (`https://fullkod.com/brand/…`), porque el mismo pie lo pintan la app
    `store-app` y los dominios propios.
  - Lo ven todas las tiendas, sin excepción.
- Las apps nativas (`admin-app`, `store-app`) no llevan crédito propio, salvo el pie de tienda compartido.

## Próximo paso (decidido por Roberto, 2026-10-29)
Poner en el admin un ajuste para **decidir si la tienda muestra o no el crédito** «Tienda creada con Kshop · un
producto de Fullkod» en su pie. Lo más natural es en el superadmin o por plan, por ejemplo quitarlo en Pro. Hoy se
muestra siempre.

Convención general de Fullkod (licencia, firma, crédito): memoria del hub `memoria/project/licencia-y-credito-fullkod.md`.
