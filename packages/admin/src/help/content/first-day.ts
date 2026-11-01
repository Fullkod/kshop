import type { FirstDayStep } from "../types";

/** «Tu primer día»: what a new store owner does on day one. Progress is kept per browser. */
export const firstDay: FirstDayStep[] = [
  {
    id: "look-around",
    title: "Date una vuelta por Inicio",
    detail:
      "Inicio resume el día: ventas de hoy, pedidos por confirmar y accesos directos. El menú de la izquierda (o el botón de menú en el teléfono) agrupa todo en Ventas, Catálogo, Tienda y Negocio.",
    audiences: ["owner", "staff"],
    link: "/admin",
    screenshot: "admin-home",
  },
  {
    id: "product-type",
    title: "Crea tu primer tipo de producto",
    detail:
      "Antes de subir productos, Kshop necesita saber cómo son: «Ropa» con talla y color, «Comida» sin variantes… Se hace una vez en Productos, pestaña «Tipos de producto».",
    audiences: ["owner"],
    link: "/admin/catalog/product-types",
    screenshot: "product-types",
  },
  {
    id: "first-product",
    title: "Sube tu primer producto",
    detail:
      "En Productos pulsa «Nuevo producto», ponle nombre, precio y stock, guárdalo y añade las fotos. Si lo dejas «Publicado», ya sale en tu tienda.",
    audiences: ["owner"],
    link: "/admin/catalog/products/new",
  },
  {
    id: "payment-methods",
    title: "Di cómo te pueden pagar",
    detail:
      "En Pedidos › Métodos de pago añade efectivo, transferencia o lo que uses, con las instrucciones que verá el cliente al hacer el pedido.",
    audiences: ["owner"],
    link: "/admin/orders/payment-methods",
  },
  {
    id: "share-link",
    title: "Comparte el enlace de tu tienda",
    detail:
      "Pulsa «Ver tienda» arriba, copia la dirección y pásala por WhatsApp, en tus estados o en tus grupos. Los pedidos te llegarán a Pedidos y por WhatsApp.",
    audiences: ["owner"],
  },
  {
    id: "team",
    title: "Invita a quien te ayuda",
    detail:
      "En Equipo invita a tus empleados con su email: Kshop te da un enlace para mandárselo por WhatsApp y con él crean su contraseña.",
    audiences: ["owner"],
    link: "/admin/team",
    screenshot: "team",
  },
];
