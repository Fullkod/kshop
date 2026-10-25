import { productInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { invalidateCatalog, requireCatalogAccess } from "@/server/catalog/access";
import { saveProduct } from "@/server/catalog/products";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, notFound, readJson, uuidParam } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/catalog/products/[productId]">;

// PUT: replaces the product (variants missing from the list are deleted).
export const PUT = apiHandler(async (request: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const { storeId, user } = await requireCatalogAccess(request, params.storeId, "staff");
  const productId = uuidParam.parse(params.productId);
  const input = productInputSchema.parse(await readJson(request));
  await saveProduct(storeId, user.id, input, productId);
  invalidateCatalog(storeId);
  return NextResponse.json({ id: productId });
});

// DELETE: permanent (variants, stock and media rows go with it). Archiving is the usual way out.
export const DELETE = apiHandler(async (request: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const { storeId } = await requireCatalogAccess(request, params.storeId, "admin");
  const productId = uuidParam.parse(params.productId);

  const db = getServiceClient();
  const { data: media } = await db
    .from("product_media")
    .select("storage_key")
    .eq("store_id", storeId)
    .eq("product_id", productId);

  const { data, error } = await db
    .from("products")
    .delete()
    .eq("store_id", storeId)
    .eq("id", productId)
    .select("id");
  if (error) mapDbError(error, "El producto");
  if (!data?.length) throw notFound("Producto");

  const keys = (media ?? []).flatMap((m) => (m.storage_key ? [m.storage_key, thumbKey(m.storage_key)] : []));
  if (keys.length) await db.storage.from("store-media").remove(keys);

  invalidateCatalog(storeId);
  return new NextResponse(null, { status: 204 });
});

// Thumbnails are stored next to the image: {name}-1600.webp -> {name}-480.webp (see lib/images.ts).
function thumbKey(key: string): string {
  return key.replace(/-1600\.webp$/, "-480.webp");
}
