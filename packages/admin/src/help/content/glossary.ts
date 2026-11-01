import type { GlossaryEntry } from "../types";

/** Words of the app that a new owner or employee may not know. */
export const glossary: GlossaryEntry[] = [
  {
    term: "Por confirmar",
    badge: "Por confirmar",
    definition:
      "Estado de un pedido recién llegado de la tienda: aún no lo has hablado con el cliente. Después vienen Pendiente de pago, Pagado, En preparación, Enviado y Entregado.",
    audiences: ["owner", "staff"],
    related: ["new-order-arrived"],
  },
  {
    term: "Mostrador",
    badge: "Mostrador",
    definition:
      "Venta hecha en persona desde la Caja. Nace pagada y entregada; la única forma de deshacerla es cancelarla.",
    audiences: ["owner", "staff"],
    related: ["counter-sale"],
  },
  {
    term: "Canal",
    definition:
      "Por dónde entró un pedido: Tienda web, App (la app de tu tienda), Admin (creado a mano) o Mostrador (la Caja).",
    audiences: ["owner", "staff"],
  },
  {
    term: "Variante",
    definition:
      "Cada combinación de opciones de un producto (por ejemplo, talla M y color negro). Tiene su propio SKU, precio y stock.",
    audiences: ["owner", "staff"],
    related: ["first-product"],
  },
  {
    term: "SKU",
    definition:
      "Código único de cada variante en tu tienda. Sirve para buscar en la Caja y para que el Excel sepa qué producto actualizar.",
    audiences: ["owner", "staff"],
    related: ["excel-catalog"],
  },
  {
    term: "Costo",
    definition:
      "Lo que te costó el producto. Solo lo ve el personal de la tienda, nunca el cliente; Finanzas lo usa para calcular el margen.",
    audiences: ["owner"],
  },
  {
    term: "Reservadas",
    definition:
      "Unidades apartadas por pedidos que aún no se han entregado. No se pueden vender a otro cliente; vuelven al stock si el pedido se cancela.",
    audiences: ["owner", "staff"],
    related: ["warehouses"],
  },
  {
    term: "Punto de recogida",
    definition:
      "Almacén o local donde el cliente puede pasar a recoger su pedido en vez de recibirlo en casa.",
    audiences: ["owner", "staff"],
    related: ["shipping"],
  },
  {
    term: "A convenir",
    definition:
      "Método de entrega sin precio fijo: lo hablas con el cliente y lo pones en el pedido antes de confirmarlo.",
    audiences: ["owner", "staff"],
    related: ["shipping", "new-order-arrived"],
  },
  {
    term: "Promoción y cupón",
    definition:
      "La promoción baja el precio sola (precio tachado); el cupón es un código que el cliente escribe en el carrito.",
    audiences: ["owner", "staff"],
    related: ["promotion", "voucher"],
  },
  {
    term: "Tasa",
    definition:
      "Cuántos CUP (o tu moneda principal) vale una unidad de otra moneda. La pones tú y Kshop la usa para convertir precios y pagos.",
    audiences: ["owner", "staff"],
    related: ["multi-currency"],
  },
  {
    term: "Simulado",
    badge: "Simulado",
    definition:
      "Modo del WhatsApp de la plataforma en que los avisos se generan y se ven en el historial, pero no se envían.",
    audiences: ["superadmin"],
    related: ["superadmin-whatsapp"],
  },
  {
    term: "Gestionado por admin",
    badge: "Admin",
    definition: "Sección que Kshop configura por ti: tu equipo puede consultarla pero no cambiarla.",
    audiences: ["owner", "staff"],
    related: ["missing-section"],
  },
  {
    term: "Candado BASE / PRO",
    badge: "PRO",
    definition: "La sección no está en tu plan. Al tocarla te lleva a Plan y facturación para pedirla.",
    audiences: ["owner", "staff"],
    related: ["missing-section", "my-plan"],
  },
  {
    term: "Socio fundador",
    definition:
      "Tienda de las primeras, con un precio del plan congelado que no sube con la lista de precios.",
    audiences: ["owner", "superadmin"],
  },
  {
    term: "Cortesía",
    definition: "Tienda que Kshop no factura nunca. En Plan y facturación no aparecen facturas.",
    audiences: ["owner", "superadmin"],
  },
];
