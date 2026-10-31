import { posSalesSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler, readJson } from "@/server/http";
import { recordPosSales } from "@/server/pos";

// POST /api/v1/stores/{storeId}/pos/sales  (staff+, module pos). The queue of a phone, in small batches.
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/pos/sales">) => {
    const { storeId, user } = await requireCatalogAccess(request, (await ctx.params).storeId, "staff", "pos");
    const { sales } = posSalesSchema.parse(await readJson(request));
    return NextResponse.json({ results: await recordPosSales(storeId, user.id, sales) });
  },
);
