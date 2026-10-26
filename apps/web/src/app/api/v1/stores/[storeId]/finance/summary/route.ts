import { financePeriodSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { getSummary } from "@/server/finance";
import { apiHandler } from "@/server/http";

// GET /api/v1/stores/{storeId}/finance/summary?from&to&currency  (owner/admin, finance)
//   -> sold / collected / expenses per currency, totals in `currency`, previous period.
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/finance/summary">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "finance");
    const period = financePeriodSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(await getSummary(storeId, period));
  },
);
