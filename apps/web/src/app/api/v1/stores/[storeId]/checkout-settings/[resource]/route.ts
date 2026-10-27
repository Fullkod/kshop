import { NextResponse } from "next/server";
import { invalidateCatalog, requireCatalogAccess } from "@/server/catalog/access";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, notFound, readJson } from "@/server/http";
import { getCheckoutSetting } from "@/server/orders/settings";
import { getServiceClient } from "@/server/supabase";

// POST /api/v1/stores/{storeId}/checkout-settings/{zones|methods|payment-methods}  (admin+, module of the resource)
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/checkout-settings/[resource]">) => {
    const params = await ctx.params;
    const resource = getCheckoutSetting(params.resource);
    if (!resource) throw notFound("Recurso");
    const { storeId } = await requireCatalogAccess(request, params.storeId, "admin", resource.module);
    const input = resource.schema.parse(await readJson(request));

    const { data, error } = await getServiceClient()
      .from(resource.table)
      .insert({ ...resource.toRow(input), store_id: storeId })
      .select("id")
      .single<{ id: string }>();
    if (error) mapDbError(error, resource.entity);
    // The storefront shell shows the free-shipping threshold of the methods.
    invalidateCatalog(storeId);
    return NextResponse.json({ id: data!.id }, { status: 201 });
  },
);
