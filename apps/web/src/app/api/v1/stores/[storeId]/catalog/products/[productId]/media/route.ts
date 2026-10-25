import { productMediaInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { publicEnv } from "@/env";
import { invalidateCatalog, requireCatalogAccess } from "@/server/catalog/access";
import { storeMediaPrefix } from "@/server/catalog/products";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, HttpError, readJson, uuidParam } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

// POST: registers an image the client already uploaded to store-media (decision D3).
export const POST = apiHandler(
  async (
    request: Request,
    ctx: RouteContext<"/api/v1/stores/[storeId]/catalog/products/[productId]/media">,
  ) => {
    const params = await ctx.params;
    const { storeId } = await requireCatalogAccess(request, params.storeId, "staff");
    const productId = uuidParam.parse(params.productId);
    const input = productMediaInputSchema.parse(await readJson(request));

    // Only files of this store's product folder in our bucket: never arbitrary URLs.
    const prefix = storeMediaPrefix(publicEnv.supabaseUrl, storeId);
    const keyPrefix = `stores/${storeId}/products/`;
    if (
      !input.storageKey.startsWith(keyPrefix) ||
      input.url !== `${prefix}${input.storageKey.slice(`stores/${storeId}/`.length)}` ||
      (input.thumbUrl && !input.thumbUrl.startsWith(`${prefix}products/`))
    ) {
      throw new HttpError(400, "invalid_media", "La imagen no pertenece a esta tienda.");
    }

    const db = getServiceClient();
    const { count } = await db
      .from("product_media")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("product_id", productId);

    const { data, error } = await db
      .from("product_media")
      .insert({
        store_id: storeId,
        product_id: productId,
        storage_key: input.storageKey,
        url: input.url,
        thumb_url: input.thumbUrl ?? null,
        alt: input.alt ?? null,
        sort_order: count ?? 0,
      })
      .select("id, url, thumb_url, alt, sort_order")
      .single();
    if (error) mapDbError(error, "La imagen");

    invalidateCatalog(storeId);
    return NextResponse.json(
      { id: data.id, url: data.url, thumbUrl: data.thumb_url, alt: data.alt, sortOrder: data.sort_order },
      { status: 201 },
    );
  },
);
