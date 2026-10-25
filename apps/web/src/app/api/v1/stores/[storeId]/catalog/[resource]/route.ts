import { NextResponse } from "next/server";
import { invalidateCatalog, requireCatalogAccess } from "@/server/catalog/access";
import { getCatalogResource } from "@/server/catalog/resources";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, notFound, readJson } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

// POST /api/v1/stores/{storeId}/catalog/{attributes|product-types|categories|brands|collections|warehouses}
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/catalog/[resource]">) => {
    const { storeId: rawStoreId, resource: name } = await ctx.params;
    const resource = getCatalogResource(name);
    if (!resource) throw notFound("Recurso");

    const { storeId } = await requireCatalogAccess(request, rawStoreId, resource.minRole);
    const input = resource.schema.parse(await readJson(request));

    const { data, error } = await getServiceClient()
      .from(resource.table)
      .insert({ ...resource.toRow(input), store_id: storeId })
      .select("id")
      .single<{ id: string }>();
    if (error) mapDbError(error, resource.entity);

    if (resource.saveChildren) {
      try {
        await resource.saveChildren(storeId, data.id, input);
      } catch (childError) {
        // Not one transaction: do not leave a half-created entity behind.
        await getServiceClient().from(resource.table).delete().eq("store_id", storeId).eq("id", data.id);
        throw childError;
      }
    }

    invalidateCatalog(storeId);
    return NextResponse.json({ id: data.id }, { status: 201 });
  },
);
