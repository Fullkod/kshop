import { financePeriodSchema, MARGIN_GROUPS } from "@kshop/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCatalogAccess } from "@/server/catalog/access";
import { getMargin } from "@/server/finance";
import { apiHandler } from "@/server/http";

// GET /api/v1/stores/{storeId}/finance/margin?from&to&currency&group=product|category|brand  (owner/admin, finance)
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/finance/margin">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "finance");
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const period = financePeriodSchema.parse(params);
    const group = z.enum(MARGIN_GROUPS).default("product").parse(params.group);
    return NextResponse.json(await getMargin(storeId, period, group));
  },
);
