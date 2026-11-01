import type { ScreenshotSpec } from "../types";

/**
 * Every screenshot the help uses, as a contract for `scripts/help-shots.mjs`: it opens `route` in the Tienda Demo
 * (as the owner) or the superadmin panel, runs `setup` and saves `apps/web/public/help/screens/<slug>.png`.
 */
export const screenshots: ScreenshotSpec[] = [
  {
    slug: "admin-home",
    description: "Inicio del admin con la tarjeta de ventas de hoy y el menú lateral",
    route: "/admin",
    viewport: "desktop",
  },
  {
    slug: "product-types",
    description: "Catálogo › Tipos de producto con un tipo con variantes y otro sin variantes",
    route: "/admin/catalog/product-types",
    viewport: "desktop",
  },
  {
    slug: "product-editor",
    description: "Editor de un producto con variantes: precio, costo, stock y «Generar variantes»",
    route: "/admin/catalog",
    viewport: "desktop",
    setup: ["Abrir el primer producto con variantes de la lista"],
  },
  {
    slug: "excel-import",
    description: "Importar Excel con el tipo de producto elegido y «Descargar plantilla»",
    route: "/admin/excel-import",
    viewport: "desktop",
  },
  {
    slug: "orders-list",
    description: "Pedidos en la pestaña Pendientes, con el filtro y el buscador",
    route: "/admin/orders",
    viewport: "desktop",
  },
  {
    slug: "order-detail",
    description: "Ficha de un pedido con los botones de estado, «WhatsApp al cliente» y «Registrar pago»",
    route: "/admin/orders",
    viewport: "desktop",
    setup: ["Abrir el primer pedido de la lista que no sea de mostrador"],
  },
  {
    slug: "order-new",
    description: "Pedidos › Nuevo pedido con un producto añadido y el resumen",
    route: "/admin/orders/new",
    viewport: "desktop",
    setup: ["Buscar «a» y pulsar «Añadir» en el primer producto"],
  },
  {
    slug: "pos-sell-mobile",
    description: "Caja › Vender en el teléfono con productos en el ticket y el botón «Cobrar»",
    route: "/admin/pos",
    viewport: "mobile",
    setup: ["Tocar el primer producto dos veces"],
  },
  {
    slug: "team",
    description: "Equipo con el diálogo «Invitar al equipo» abierto",
    route: "/admin/team",
    viewport: "desktop",
    setup: ["Pulsar «Invitar persona»"],
  },
  {
    slug: "billing",
    description: "Plan y facturación: plan actual, próxima factura y «Cómo pagar»",
    route: "/admin/billing",
    viewport: "desktop",
  },
  {
    slug: "superadmin-store-new",
    description: "Superadmin › Nueva tienda con el formulario vacío",
    route: "/superadmin/stores/new",
    viewport: "desktop",
  },
];
