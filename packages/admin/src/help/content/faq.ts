import type { FaqEntry } from "../types";

/** What owners ask Kshop by WhatsApp most often. */
export const faq: FaqEntry[] = [
  {
    question: "Subí un producto y no sale en la tienda. ¿Por qué?",
    answer:
      "Revisa que su estado sea «Publicado» (no «Borrador» ni «Archivado») y que tenga stock o «No controlar stock» marcado. La tienda puede tardar unos segundos en mostrar los cambios.",
    audiences: ["owner", "staff"],
    related: ["first-product"],
  },
  {
    question: "¿El cliente ve lo que me costó el producto?",
    answer:
      "No. El costo solo lo ve el personal de la tienda en el admin; la tienda pública nunca lo muestra.",
    audiences: ["owner", "staff"],
  },
  {
    question: "¿Puedo vender si se va la conexión?",
    answer:
      "Sí, desde Kshop Admin (la app del admin en el teléfono): las ventas de la Caja se guardan en el teléfono y se suben solas cuando vuelve la conexión. En la web hace falta internet.",
    audiences: ["owner", "staff"],
    related: ["counter-sale"],
  },
  {
    question: "Me equivoqué en una venta del mostrador. ¿Cómo la deshago?",
    answer:
      "Ábrela en Pedidos (filtro «Mostrador») y cancélala. El stock vuelve y la venta queda como cancelada para el dueño.",
    audiences: ["owner", "staff"],
    related: ["counter-sale"],
  },
  {
    question: "¿Cómo pago Kshop?",
    answer:
      "Kshop cobra a mano, sin tarjeta. En Plan y facturación tienes la próxima factura y «Cómo pagar»; si tienes dudas, «Escribir a Kshop por WhatsApp».",
    audiences: ["owner"],
    related: ["my-plan"],
  },
  {
    question: "¿Cómo hago envío gratis?",
    answer:
      "Crea un cupón que se descuente del envío con porcentaje 100, o un método de entrega con precio 0 para la zona que quieras.",
    audiences: ["owner"],
    related: ["voucher", "shipping"],
  },
  {
    question: "No me llegan los avisos de pedidos nuevos por WhatsApp.",
    answer:
      "Revisa que tu teléfono esté en Avisos WhatsApp › Contactos y que el aviso «Pedido nuevo» no esté desactivado en «Mensajes». En «Historial» ves si se envió o falló.",
    audiences: ["owner"],
    related: ["whatsapp-notices"],
  },
  {
    question: "¿Puedo cobrar en USD aunque mis precios estén en CUP?",
    answer:
      "Sí, con el plan Pro: activa «Vender en USD» en Monedas y pon la tasa. Al cobrar eliges la moneda que entrega el cliente y Kshop convierte.",
    audiences: ["owner", "staff"],
    related: ["multi-currency", "counter-sale"],
  },
  {
    question: "Mi empleado no puede entrar a Equipo ni a Plan y facturación.",
    answer: "Es lo normal: esas secciones son solo del dueño y los administradores.",
    audiences: ["owner", "staff"],
    related: ["my-team", "missing-section"],
  },
];
