import { financePeriodSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { getBreakdown } from "@/server/finance";
import { apiHandler } from "@/server/http";

// GET /api/v1/stores/{storeId}/finance/breakdown?from&to&currency  (owner/admin, finance)
// Sold by payment method, delivery zone, channel and currency.
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/finance/breakdown">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "finance");
    const period = financePeriodSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(await getBreakdown(storeId, period));
  },
);
