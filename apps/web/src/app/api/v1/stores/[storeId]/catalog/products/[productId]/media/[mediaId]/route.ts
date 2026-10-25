import { NextResponse } from "next/server";
import { invalidateCatalog, requireCatalogAccess } from "@/server/catalog/access";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, notFound, uuidParam } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

// DELETE: removes the image row and its files (full size and thumbnail).
export const DELETE = apiHandler(
  async (
    request: Request,
    ctx: RouteContext<"/api/v1/stores/[storeId]/catalog/products/[productId]/media/[mediaId]">,
  ) => {
    const params = await ctx.params;
    const { storeId } = await requireCatalogAccess(request, params.storeId, "staff");
    const productId = uuidParam.parse(params.productId);
    const mediaId = uuidParam.parse(params.mediaId);

    const db = getServiceClient();
    const { data, error } = await db
      .from("product_media")
      .delete()
      .eq("store_id", storeId)
      .eq("product_id", productId)
      .eq("id", mediaId)
      .select("storage_key");
    if (error) mapDbError(error, "La imagen");
    const key = data?.[0]?.storage_key;
    if (!data?.length) throw notFound("Imagen");

    if (key) await db.storage.from("store-media").remove([key, key.replace(/-1600\.webp$/, "-480.webp")]);

    invalidateCatalog(storeId);
    return new NextResponse(null, { status: 204 });
  },
);
