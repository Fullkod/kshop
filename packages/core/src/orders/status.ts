// Order life cycle (D11, from klauShop). Same transitions as private.order_transition_allowed in SQL:
// the database is the authority, this copy drives the UI (buttons, labels).

export const ORDER_STATUSES = [
  "pending_confirmation",
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["unpaid", "partially_paid", "paid", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SHIPPING_TYPES = ["delivery", "pickup", "to_agree"] as const;
export type ShippingType = (typeof SHIPPING_TYPES)[number];

export const ORDER_CHANNELS = ["web", "app", "admin", "pos"] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_confirmation: "Por confirmar",
  pending_payment: "Pendiente de pago",
  paid: "Pagado",
  processing: "En preparación",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Sin pagar",
  partially_paid: "Pago parcial",
  paid: "Pagado",
  refunded: "Reembolsado",
};

export const SHIPPING_TYPE_LABELS: Record<ShippingType, string> = {
  delivery: "Entrega a domicilio",
  pickup: "Recogida",
  to_agree: "A convenir",
};

/** Transitions done with order_transition (cancelling has its own action). */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_confirmation: ["pending_payment", "paid"],
  pending_payment: ["paid"],
  paid: ["processing", "shipped", "delivered"],
  processing: ["shipped", "delivered"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export const CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  "pending_confirmation",
  "pending_payment",
  "paid",
  "processing",
];

/** A counter sale is born delivered, and cancelling it is the only way to undo it. */
export function canCancelOrder(status: OrderStatus, channel: string): boolean {
  return CANCELLABLE_STATUSES.includes(status) || (channel === "pos" && status === "delivered");
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Confirming or marking paid needs a defined shipping cost ("to agree" orders first get one). */
export function needsShippingCost(to: OrderStatus, shippingTotal: number | null): boolean {
  return (to === "pending_payment" || to === "paid") && shippingTotal === null;
}

/** Quick action labels for the admin (the target status of each button). */
export const ORDER_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  pending_payment: "Confirmar",
  paid: "Marcar pagado",
  processing: "Preparar",
  shipped: "Enviar",
  delivered: "Entregado",
};

/** Admin list tabs. */
export const ORDER_TABS = [
  { key: "pending", label: "Pendientes", statuses: ["pending_confirmation", "pending_payment"] },
  { key: "paid", label: "Pagados", statuses: ["paid"] },
  { key: "processing", label: "En preparación", statuses: ["processing"] },
  { key: "shipped", label: "Enviados", statuses: ["shipped"] },
  { key: "delivered", label: "Entregados", statuses: ["delivered"] },
  { key: "cancelled", label: "Cancelados", statuses: ["cancelled"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly OrderStatus[] }[];
export type OrderTabKey = (typeof ORDER_TABS)[number]["key"];

/** Pending orders older than this are flagged in the admin (klauShop: 48 h, decision 23: no expiry). */
export const STALE_PENDING_HOURS = 48;

export function isStalePending(status: OrderStatus, createdAt: Date, now = new Date()): boolean {
  return (
    (status === "pending_confirmation" || status === "pending_payment") &&
    now.getTime() - createdAt.getTime() > STALE_PENDING_HOURS * 3_600_000
  );
}

/** "DEMO-1001" */
export const orderCode = (prefix: string, number: number) => `${prefix}-${number}`;
