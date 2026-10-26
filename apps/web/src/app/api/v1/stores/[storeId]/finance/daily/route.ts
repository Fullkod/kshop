import { financePeriodSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { getDaily } from "@/server/finance";
import { apiHandler } from "@/server/http";

// GET /api/v1/stores/{storeId}/finance/daily?from&to&currency  (owner/admin, finance)
// Daily close: sold, collected and expenses of every Havana day in each currency + equivalent.
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/finance/daily">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "finance");
    const period = financePeriodSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(await getDaily(storeId, period));
  },
);
