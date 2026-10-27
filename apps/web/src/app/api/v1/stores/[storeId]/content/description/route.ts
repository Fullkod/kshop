import { storeDescriptionSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireContentAccess } from "@/server/content/resources";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, readJson } from "@/server/http";
import { storeCacheTag } from "@/server/stores";
import { getServiceClient } from "@/server/supabase";

// PUT /api/v1/stores/{storeId}/content/description  { description }  (footer text; "" or null clears it)
export const PUT = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/content/description">) => {
    const { storeId } = await requireContentAccess(request, (await ctx.params).storeId);
    const { description } = storeDescriptionSchema.parse(await readJson(request));

    const { data, error } = await getServiceClient()
      .from("stores")
      .update({ description })
      .eq("id", storeId)
      .select("slug")
      .single<{ slug: string }>();
    if (error) mapDbError(error, "La tienda");

    // Part of the cached store card (by slug), shown in every storefront page.
    revalidateTag(storeCacheTag(data.slug), { expire: 0 });
    return NextResponse.json({ description });
  },
);
