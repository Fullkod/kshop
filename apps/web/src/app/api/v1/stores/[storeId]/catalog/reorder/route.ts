import { reorderInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidateCatalog, requireCatalogAccess } from "@/server/catalog/access";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, readJson } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

const bodySchema = reorderInputSchema.extend({
  table: z.enum(["categories", "collections", "attributes", "attribute_values", "product_media"]),
});

// POST /api/v1/stores/{storeId}/catalog/reorder  { table, ids } -> sort_order = position in ids
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/catalog/reorder">) => {
    const input = bodySchema.parse(await readJson(request));
    const minRole = input.table === "product_media" ? "staff" : "admin";
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, minRole);

    const { error } = await getServiceClient().rpc("reorder_catalog", {
      p_store_id: storeId,
      p_table: input.table,
      p_ids: input.ids,
    });
    if (error) mapDbError(error);

    invalidateCatalog(storeId);
    return new NextResponse(null, { status: 204 });
  },
);
