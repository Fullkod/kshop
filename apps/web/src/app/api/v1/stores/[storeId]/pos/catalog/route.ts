import { posCatalogQuerySchema } from "@kshop/core";
import type { PosCatalogPage } from "@kshop/data";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

// GET /api/v1/stores/{storeId}/pos/catalog?after=&limit=  (staff+, module pos). What the phone keeps to sell offline,
// one page at a time and never with costs. The first page also brings the currency and the payment methods.
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/pos/catalog">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "staff", "pos");
    const query = posCatalogQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { data, error } = await getServiceClient().rpc("pos_catalog", {
      p_store_id: storeId,
      p_after: query.after ?? null,
      p_limit: query.limit ?? 500,
    });
    if (error) throw error;
    return NextResponse.json(data as PosCatalogPage, { headers: { "Cache-Control": "no-store" } });
  },
);
