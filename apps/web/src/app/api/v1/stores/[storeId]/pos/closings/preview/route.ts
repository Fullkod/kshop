import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler } from "@/server/http";
import { closingPreview } from "@/server/pos-closings";

// GET /api/v1/stores/{storeId}/pos/closings/preview  (staff+, module pos). What the signed-in cashier should have
// today, before counting (KSH0012).
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/pos/closings/preview">) => {
    const { storeId, user } = await requireCatalogAccess(request, (await ctx.params).storeId, "staff", "pos");
    return NextResponse.json(await closingPreview(storeId, user.id), {
      headers: { "Cache-Control": "no-store" },
    });
  },
);
