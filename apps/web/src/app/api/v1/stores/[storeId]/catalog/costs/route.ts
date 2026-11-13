import { variantCostsInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, readJson } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

// PUT /api/v1/stores/{storeId}/catalog/costs  { costs: [{ variantId, cost: { price, currency } | null }] }
// KSH0022: only the private costs, from Catálogo › Productos. Owner and admins (the staff never see costs). The
// storefront never shows costs, so its cache stays as it is.
export const PUT = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/catalog/costs">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin");
    const input = variantCostsInputSchema.parse(await readJson(request));

    const { data, error } = await getServiceClient().rpc("set_variant_costs", {
      p_store_id: storeId,
      p_costs: input.costs.map((c) => ({ variant_id: c.variantId, cost: c.cost })),
    });
    if (error) mapDbError(error, "El costo");

    return NextResponse.json({ updated: data as number });
  },
);
