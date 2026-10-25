import "server-only";
import {
  orderCode,
  orderWhatsappText,
  whatsappLink,
  type CheckoutInput,
  type OrderChannel,
  type OrderStatus,
  type PaymentStatus,
  type ShippingType,
} from "@kshop/core";
import type { CheckoutOptions, CheckoutResponse, PublicOrder } from "@kshop/data";
import { hasModule } from "../auth";
import { invalidateCatalog } from "../catalog/access";
import { mapDbError } from "../db-errors";
import { HttpError, notFound } from "../http";
import { storeUrl } from "../storefront/page-helpers";
import { getServiceClient } from "../supabase";

// Checkout options, order creation (D9) and the public order page (/order/{token}).

export async function checkoutOptions(storeId: string): Promise<CheckoutOptions> {
  const service = getServiceClient();
  const shippingEnabled = await hasModule(storeId, "shipping");
  const [zones, methods, payments] = await Promise.all([
    shippingEnabled
      ? service
          .from("shipping_zones")
          .select("id, name, description")
          .eq("store_id", storeId)
          .eq("is_active", true)
          .order("sort_order")
          .order("name")
      : Promise.resolve({ data: [], error: null }),
    shippingEnabled
      ? service
          .from("shipping_methods")
          .select("id, zone_id, type, name, price, free_over_subtotal, min_days, max_days, warehouses (name, address)")
          .eq("store_id", storeId)
          .eq("is_active", true)
          .order("sort_order")
          .order("name")
      : Promise.resolve({ data: [], error: null }),
    service
      .from("payment_methods")
      .select("id, name, currencies, instructions")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);
  if (zones.error) throw zones.error;
  if (methods.error) throw methods.error;
  if (payments.error) throw payments.error;

  type MethodRow = {
    id: string;
    zone_id: string | null;
    type: ShippingType;
    name: string;
    price: number;
    free_over_subtotal: number | null;
    min_days: number | null;
    max_days: number | null;
    warehouses: { name: string; address: string | null } | null;
  };
  return {
    shippingEnabled: shippingEnabled && (methods.data as MethodRow[]).length > 0,
    zones: (zones.data as { id: string; name: string; description: string | null }[]).map((z) => ({
      id: z.id,
      name: z.name,
      description: z.description,
    })),
    methods: (methods.data as MethodRow[]).map((m) => ({
      id: m.id,
      zoneId: m.zone_id,
      type: m.type,
      name: m.name,
      price: Number(m.price),
      freeOverSubtotal: m.free_over_subtotal == null ? null : Number(m.free_over_subtotal),
      minDays: m.min_days,
      maxDays: m.max_days,
      pickupPoint: m.warehouses ? { name: m.warehouses.name, address: m.warehouses.address } : null,
    })),
    paymentMethods: (payments.data as { id: string; name: string; currencies: string[]; instructions: string | null }[]).map(
      (p) => ({ id: p.id, name: p.name, currencies: p.currencies, instructions: p.instructions }),
    ),
  };
}

type OrderRow = {
  id: string;
  number: number;
  public_token: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  channel: OrderChannel;
  currency: string;
  subtotal: number;
  shipping_total: number | null;
  discount_total: number;
  total: number | null;
  paid_total: number;
  customer_name: string;
  customer_note: string | null;
  shipping_type: ShippingType | null;
  shipping_snapshot: Record<string, unknown>;
  payment_snapshot: { name?: string; instructions?: string | null };
  created_at: string;
  stores: { name: string; slug: string; order_prefix: string; whatsapp_phone: string | null } | null;
  order_lines: {
    product_name: string;
    variant_name: string;
    sku: string;
    attributes: { name: string; value: string }[];
    image_url: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
    sort_order: number;
  }[];
  order_events: { type: string; payload: Record<string, unknown>; created_at: string; is_internal: boolean }[];
};

const num = (v: number | null) => (v == null ? null : Number(v));

function toPublicOrder(row: OrderRow): PublicOrder {
  const store = row.stores!;
  const code = orderCode(store.order_prefix, row.number);
  const url = `${storeUrl(store)}/order/${row.public_token}`;
  const lines = [...row.order_lines]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => ({
      productName: l.product_name,
      variantName: l.variant_name,
      sku: l.sku,
      attributes: l.attributes,
      imageUrl: l.image_url,
      quantity: l.quantity,
      unitPrice: Number(l.unit_price),
      lineTotal: Number(l.line_total),
    }));
  const shipping = row.shipping_snapshot as PublicOrder["shipping"];
  const text = orderWhatsappText({
    code,
    storeName: store.name,
    customerName: row.customer_name,
    currency: row.currency,
    lines: lines.map((l) => ({
      name: `${l.productName}${l.variantName ? ` (${l.variantName})` : ""}`,
      quantity: l.quantity,
      lineTotal: l.lineTotal,
    })),
    subtotal: Number(row.subtotal),
    shippingType: row.shipping_type ?? "to_agree",
    shippingTotal: num(row.shipping_total),
    total: num(row.total),
    shippingLabel: shipping.method ?? null,
    address: shipping.address ?? shipping.pickup_point?.name ?? null,
    paymentMethod: row.payment_snapshot.name ?? null,
    note: row.customer_note,
    url,
  });
  return {
    code,
    publicToken: row.public_token,
    status: row.status,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
    currency: row.currency,
    subtotal: Number(row.subtotal),
    shippingTotal: num(row.shipping_total),
    discountTotal: Number(row.discount_total),
    total: num(row.total),
    paidTotal: Number(row.paid_total),
    customerName: row.customer_name,
    note: row.customer_note,
    shippingType: row.shipping_type ?? "to_agree",
    shipping,
    paymentMethod: row.payment_snapshot.name
      ? { name: row.payment_snapshot.name, instructions: row.payment_snapshot.instructions ?? null }
      : null,
    lines,
    events: row.order_events
      .filter((e) => !e.is_internal && (e.type === "created" || e.type === "status_changed"))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e) => ({ type: e.type, to: (e.payload.to as OrderStatus | undefined) ?? null, createdAt: e.created_at })),
    storeName: store.name,
    whatsappUrl: store.whatsapp_phone ? whatsappLink(store.whatsapp_phone, text) : null,
  };
}

const ORDER_SELECT = `id, number, public_token, status, payment_status, channel, currency, subtotal, shipping_total,
  discount_total, total, paid_total, customer_name, customer_note, shipping_type, shipping_snapshot, payment_snapshot,
  created_at, stores (name, slug, order_prefix, whatsapp_phone),
  order_lines (product_name, variant_name, sku, attributes, image_url, quantity, unit_price, line_total, sort_order),
  order_events (type, payload, created_at, is_internal)`;

/** Public order page by its unguessable token (no costs, no internal events, no phone). */
export async function getPublicOrder(storeId: string, token: string): Promise<PublicOrder> {
  const { data, error } = await getServiceClient()
    .from("orders")
    .select(ORDER_SELECT)
    .eq("store_id", storeId)
    .eq("public_token", token)
    .maybeSingle<OrderRow>();
  if (error) throw error;
  if (!data) throw notFound("Pedido");
  return toPublicOrder(data);
}

export type PlaceOrderParams = {
  channel: OrderChannel;
  customerId: string | null;
  cartId: string | null;
  lines: { variant_id: string; quantity: number }[];
  input: Pick<CheckoutInput, "idempotencyKey" | "currency" | "customer" | "shipping" | "paymentMethodId" | "note">;
  createdBy?: string | null;
};

/** Calls checkout_create_order (one transaction) and expires the storefront cache only if availability flipped. */
export async function placeOrder(storeId: string, params: PlaceOrderParams): Promise<CheckoutResponse> {
  const { input } = params;
  const { data, error } = await getServiceClient().rpc("checkout_create_order", {
    p_store_id: storeId,
    p_input: {
      idempotency_key: input.idempotencyKey,
      channel: params.channel,
      customer_id: params.customerId,
      cart_id: params.cartId,
      currency: input.currency ?? null,
      lines: params.lines,
      customer: input.customer,
      shipping: {
        zone_id: input.shipping.zoneId ?? null,
        ...(input.shipping.methodId && { method_id: input.shipping.methodId }),
        recipient: input.shipping.recipient ?? null,
        address: input.shipping.address ?? null,
        reference: input.shipping.reference ?? null,
      },
      payment_method_id: input.paymentMethodId ?? null,
      note: input.note ?? null,
      created_by: params.createdBy ?? null,
    },
  });
  if (error) mapDbError(error, "El pedido");
  const result = data as { order_id: string; public_token: string; created: boolean; flipped_product_ids: string[] };
  if (result.flipped_product_ids.length) invalidateCatalog(storeId);
  return { orderId: result.order_id, order: await getPublicOrder(storeId, result.public_token), created: result.created };
}

export function emptyCartError(): HttpError {
  return new HttpError(409, "empty_cart", "Tu carrito está vacío.");
}
