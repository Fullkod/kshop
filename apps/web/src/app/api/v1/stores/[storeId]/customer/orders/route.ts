import { orderCode, type OrderStatus, type PaymentStatus } from "@kshop/core";
import type { CustomerOrderSummary } from "@kshop/data";
import { NextResponse } from "next/server";
import { requireCustomer } from "@/server/customers/accounts";
import { apiHandler, uuidParam } from "@/server/http";
import { getServiceClient, getUserClient } from "@/server/supabase";

type Row = {
  number: number;
  public_token: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  currency: string;
  total: number | null;
  created_at: string;
  order_lines: { quantity: number }[];
};

// GET /api/v1/stores/{storeId}/customer/orders  -> "Mis pedidos"
// Read as the customer, so RLS returns only its own orders; order_prefix is server-only (service client).
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/customer/orders">) => {
    const storeId = uuidParam.parse((await ctx.params).storeId);
    const { user } = await requireCustomer(request, storeId);

    const [orders, store] = await Promise.all([
      getUserClient(user.accessToken)
        .from("orders")
        .select(
          "number, public_token, status, payment_status, currency, total, created_at, order_lines (quantity)",
        )
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<Row[]>(),
      getServiceClient()
        .from("stores")
        .select("order_prefix")
        .eq("id", storeId)
        .single<{ order_prefix: string }>(),
    ]);
    if (orders.error) throw orders.error;
    if (store.error) throw store.error;

    const body: CustomerOrderSummary[] = orders.data.map((o) => ({
      code: orderCode(store.data.order_prefix, o.number),
      publicToken: o.public_token,
      status: o.status,
      paymentStatus: o.payment_status,
      currency: o.currency,
      total: o.total == null ? null : Number(o.total),
      itemCount: o.order_lines.reduce((sum, l) => sum + l.quantity, 0),
      createdAt: o.created_at,
    }));
    return NextResponse.json({ orders: body });
  },
);
