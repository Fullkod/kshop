import { posCatalogQuerySchema } from "@kshop/core";
import type { PosCatalogPage } from "@kshop/data";
import { NextResponse } from "next/server";
import { getStoreGuard } from "@/server/auth";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

// GET /api/v1/stores/{storeId}/pos/catalog?after=&limit=  (staff+, module pos). What the phone keeps to sell offline,
// one page at a time. The first page also brings the currency and the payment methods. Costs (in the base currency)
// only for owner, admin and superadmin: «Al costo» and the below-cost warning (KSH0011); staff never get them.
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/pos/catalog">) => {
    const { storeId, user } = await requireCatalogAccess(request, (await ctx.params).storeId, "staff", "pos");
    const { role } = await getStoreGuard(user, storeId);
    const withCosts = user.isSuperadmin || role === "owner" || role === "admin";
    const query = posCatalogQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { data, error } = await getServiceClient().rpc("pos_catalog", {
      p_store_id: storeId,
      p_after: query.after ?? null,
      p_limit: query.limit ?? 500,
      p_with_costs: withCosts,
    });
    if (error) throw error;
    return NextResponse.json(data as PosCatalogPage, { headers: { "Cache-Control": "no-store" } });
  },
);
