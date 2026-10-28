import { storeLogoSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { publicEnv } from "@/env";
import { storeMediaPrefix } from "@/server/catalog/products";
import { requireContentAccess } from "@/server/content/resources";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, HttpError, readJson } from "@/server/http";
import { storeCacheTag } from "@/server/stores";
import { getServiceClient } from "@/server/supabase";

// PUT /api/v1/stores/{storeId}/content/logo  { logoUrl }  (header logo and app icon; null removes it)
export const PUT = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/content/logo">) => {
    const { storeId } = await requireContentAccess(request, (await ctx.params).storeId);
    const { logoUrl } = storeLogoSchema.parse(await readJson(request));
    // Only a file of this store in store-media (uploaded from Apariencia).
    if (logoUrl && !logoUrl.startsWith(storeMediaPrefix(publicEnv.supabaseUrl, storeId))) {
      throw new HttpError(400, "invalid_media", "La imagen no pertenece a esta tienda.");
    }

    const { data, error } = await getServiceClient()
      .from("stores")
      .update({ logo_url: logoUrl })
      .eq("id", storeId)
      .select("slug")
      .single<{ slug: string }>();
    if (error) mapDbError(error, "La tienda");

    // Part of the cached store card (by slug), shown in the header of every storefront page.
    revalidateTag(storeCacheTag(data.slug), { expire: 0 });
    return NextResponse.json({ logoUrl });
  },
);
