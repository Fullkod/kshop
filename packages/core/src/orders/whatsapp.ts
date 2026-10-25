import { formatMoney } from "../catalog/pricing";
import { SHIPPING_TYPE_LABELS, type ShippingType } from "./status";

// Text of the order sent to the store over WhatsApp (D17). Some clients cut wa.me texts around 2 000
// characters: long orders are summarized and the order link always goes last.

export type WhatsappOrder = {
  code: string;
  storeName: string;
  customerName: string;
  currency: string;
  lines: { name: string; quantity: number; lineTotal: number }[];
  subtotal: number;
  shippingType: ShippingType;
  shippingTotal: number | null;
  total: number | null;
  shippingLabel?: string | null;
  address?: string | null;
  paymentMethod?: string | null;
  note?: string | null;
  url: string;
};

const MAX_TEXT = 1800;

export function orderWhatsappText(order: WhatsappOrder): string {
  const money = (v: number) => formatMoney(v, order.currency);
  const head = [`Hola, ${order.storeName}. Acabo de hacer el pedido *${order.code}*:`, ""];
  const lines = order.lines.map((l) => `• ${l.quantity} × ${l.name} — ${money(l.lineTotal)}`);
  const shipping =
    order.shippingTotal === null
      ? "A convenir"
      : order.shippingTotal === 0
        ? "Gratis"
        : money(order.shippingTotal);
  const tail = [
    "",
    `Subtotal: ${money(order.subtotal)}`,
    `Entrega: ${order.shippingLabel ?? SHIPPING_TYPE_LABELS[order.shippingType]} (${shipping})`,
    order.total === null ? "Total: a confirmar con la tienda" : `*Total: ${money(order.total)}*`,
    order.address ? `Dirección: ${order.address}` : null,
    order.paymentMethod ? `Pago: ${order.paymentMethod}` : null,
    order.note ? `Nota: ${order.note}` : null,
    `A nombre de: ${order.customerName}`,
    "",
    `Ver pedido: ${order.url}`,
  ].filter((l): l is string => l !== null);

  let body = lines;
  const size = (b: string[]) => [...head, ...b, ...tail].join("\n").length;
  while (body.length > 1 && size(body) > MAX_TEXT) {
    const rest = order.lines.length - body.length + 2;
    body = [...lines.slice(0, body.length - 2), `• … y ${rest} productos más`];
  }
  return [...head, ...body, ...tail].join("\n");
}

/** wa.me link with an optional prefilled message. */
export const whatsappLink = (phone: string, text?: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
