import { NextResponse } from "next/server";
import { apiHandler, uuidParam } from "@/server/http";
import { getPublicOrder } from "@/server/orders/checkout";

// GET /api/v1/stores/{storeId}/checkout/orders/{token}
// Public order page: whoever has the link sees the order (no costs, no internal notes, no phone).
export const GET = apiHandler(
  async (_request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/checkout/orders/[token]">) => {
    const params = await ctx.params;
    const order = await getPublicOrder(uuidParam.parse(params.storeId), uuidParam.parse(params.token));
    return NextResponse.json({ order }, { headers: { "Cache-Control": "no-store" } });
  },
);
