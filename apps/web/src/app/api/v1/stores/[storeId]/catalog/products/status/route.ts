import { productStatusBulkInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { invalidateCatalog, requireCatalogAccess } from "@/server/catalog/access";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, readJson } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

// POST /api/v1/stores/{storeId}/catalog/products/status  { productIds, status } -> publish / archive in bulk
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/catalog/products/status">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "staff");
    const input = productStatusBulkInputSchema.parse(await readJson(request));

    const { data, error } = await getServiceClient().rpc("set_products_status", {
      p_store_id: storeId,
      p_product_ids: input.productIds,
      p_status: input.status,
    });
    if (error) mapDbError(error, "El producto");

    invalidateCatalog(storeId);
    return NextResponse.json({ updated: data as number });
  },
);
