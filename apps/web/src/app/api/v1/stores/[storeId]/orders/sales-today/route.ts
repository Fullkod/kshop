import type { SalesToday } from "@kshop/data";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

type Row = {
  day_start: string;
  orders: { currency: string; orders: number; amount: number }[];
  received: { currency: string; amount: number }[];
  pending: number;
};

// GET /api/v1/stores/{storeId}/orders/sales-today  (staff+, module sales_today). Day in America/Havana.
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/orders/sales-today">) => {
    const { storeId } = await requireCatalogAccess(
      request,
      (await ctx.params).storeId,
      "staff",
      "sales_today",
    );
    const { data, error } = await getServiceClient().rpc("sales_today", { p_store_id: storeId });
    if (error) throw error;
    const row = data as Row;
    const body: SalesToday = {
      dayStart: row.day_start,
      orders: row.orders.map((o) => ({ currency: o.currency, orders: o.orders, amount: Number(o.amount) })),
      received: row.received.map((r) => ({ currency: r.currency, amount: Number(r.amount) })),
      pending: row.pending,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  },
);
