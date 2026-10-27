import { HOME_PERIODS, type HomePeriod, type HomeSummary } from "@kshop/data";
import { NextResponse } from "next/server";
import { hasModule } from "@/server/auth";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

type Row = {
  todo: { to_confirm: number; to_deliver: number; low_stock: number };
  week: { day: string; orders: number; amount: number }[];
  to_collect: number;
  periods: Record<
    HomePeriod,
    Record<"orders" | "sold" | "received" | `prev_${"orders" | "sold" | "received"}`, number>
  >;
};

// GET /api/v1/stores/{storeId}/orders/summary  (staff+, module orders): «Por hacer» of the admin home; the week's
// sales, what is still owed and the KPIs per period (Hoy · 7 días · Mes) only with the sales_today module (redesign).
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/orders/summary">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "staff", "orders");
    const [{ data, error }, money] = await Promise.all([
      getServiceClient().rpc("admin_home_summary", { p_store_id: storeId }),
      hasModule(storeId, "sales_today"),
    ]);
    if (error) throw error;
    const row = data as Row;
    const body: HomeSummary = {
      todo: { toConfirm: row.todo.to_confirm, toDeliver: row.todo.to_deliver, lowStock: row.todo.low_stock },
      week: money ? row.week.map((d) => ({ day: d.day, orders: d.orders, amount: Number(d.amount) })) : null,
      toCollect: money ? Number(row.to_collect) : null,
      periods: money
        ? (Object.fromEntries(
            HOME_PERIODS.map((p) => {
              const f = row.periods[p];
              return [
                p,
                {
                  orders: Number(f.orders),
                  sold: Number(f.sold),
                  received: Number(f.received),
                  previous: {
                    orders: Number(f.prev_orders),
                    sold: Number(f.prev_sold),
                    received: Number(f.prev_received),
                  },
                },
              ];
            }),
          ) as HomeSummary["periods"])
        : null,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  },
);
