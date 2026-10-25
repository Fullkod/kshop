import { NextResponse } from "next/server";
import { getContentResource, invalidateContent, requireContentAccess } from "@/server/content/resources";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, notFound, readJson } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

// POST /api/v1/stores/{storeId}/content/{banners|sections|pages}
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/content/[resource]">) => {
    const { storeId: rawStoreId, resource: name } = await ctx.params;
    const resource = getContentResource(name);
    if (!resource) throw notFound("Recurso");
    const { storeId } = await requireContentAccess(request, rawStoreId);
    const input = resource.schema.parse(await readJson(request));

    const db = getServiceClient();
    // New rows go last.
    const { count } = await db
      .from(resource.table)
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId);
    const sortable = resource.table !== "pages";
    const { data, error } = await db
      .from(resource.table)
      .insert({
        ...resource.toRow(input, storeId),
        store_id: storeId,
        ...(sortable && { sort_order: count ?? 0 }),
      })
      .select("id")
      .single<{ id: string }>();
    if (error) mapDbError(error, resource.entity);

    if (resource.saveChildren) {
      try {
        await resource.saveChildren(storeId, data.id, input);
      } catch (childError) {
        await db.from(resource.table).delete().eq("store_id", storeId).eq("id", data.id);
        throw childError;
      }
    }

    invalidateContent(storeId);
    return NextResponse.json({ id: data.id }, { status: 201 });
  },
);
