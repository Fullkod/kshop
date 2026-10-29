# R12: panel del superadmin v3 (2026-10-28)

Roberto quería poder montarle cosas a dueños que no saben personalizar y decidir qué menús ve cada tienda: quitar un
menú para que nos lo pidan a nosotros (soporte), u ocultar lo que no usan. PRP: `.titan/plans/prp-r12-superadmin-v3.md`.

## Decisiones de Roberto
- Tres estados por sección: **Visible**, **«Gestionado por admin»** (lo ven, solo el superadmin lo cambia), **Oculto**.
- Las básicas **nunca** se configuran: Inicio, Pedidos, Clientes, Catálogo, Plan y facturación, Equipo.
- Bloqueo real en la API (solo escrituras; las lecturas siguen). «Gestionado» no regala el módulo (salvo Apariencia).
- Lista de tiendas con todo: por cobrar, vence, pedidos 30 d, último pedido, productos, último acceso del dueño.
- Enlace de entrada de un solo uso superadmin → tienda: **otra fase** (hoy cada subdominio pide iniciar sesión).

## Dónde está
- BD: `store_section_settings` (migración `20261108100800`), `sections` en `admin_bootstrap` y `api_guard`,
  `platform_stores_overview()`; test RLS 18.
- API: `server/section-guard.ts` (ruta → sección, con test), `server/store-writable.ts` (403), `server/store-sections.ts`,
  `GET/PUT /api/v1/platform/stores/{id}/sections`.
- Core: `packages/core/src/admin-sections.ts`. Admin: `menuSection()` en `@kshop/admin` (web `AdminShell.tsx`, app `App.tsx`).
- Superadmin: `superadmin/page.tsx` (lista v3), `superadmin/OwnerAccess.tsx`, `stores/[storeId]/StoreMenu.tsx`.
- Pruebas: `pnpm e2e:sections`, `pnpm qa:sections`.

## Estado
- Hecho y verificado; migración en prueba y producción (RLS 692/692). Subido a `main` por Roberto (2026-10-29).
- Hueco conocido: «Monedas» gestionada se puede tocar desde Catálogo › Monedas (misma ruta `catalog/currencies`).
