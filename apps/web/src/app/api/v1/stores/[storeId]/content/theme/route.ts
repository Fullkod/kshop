import { themeInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { invalidateContent, requireContentAccess } from "@/server/content/resources";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, readJson } from "@/server/http";
import { storeCacheTag } from "@/server/stores";
import { getServiceClient } from "@/server/supabase";

// PUT /api/v1/stores/{storeId}/content/theme  { preset, colors?, headingFont?, bodyFont?, radius? }
export const PUT = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/content/theme">) => {
    const { storeId } = await requireContentAccess(request, (await ctx.params).storeId);
    const theme = themeInputSchema.parse(await readJson(request));

    const { data, error } = await getServiceClient()
      .from("stores")
      .update({ theme })
      .eq("id", storeId)
      .select("slug")
      .single<{ slug: string }>();
    if (error) mapDbError(error, "La tienda");

    // The theme is part of the cached store card (by slug) and of every storefront page.
    revalidateTag(storeCacheTag(data.slug), { expire: 0 });
    invalidateContent(storeId);
    return NextResponse.json({ theme });
  },
);
