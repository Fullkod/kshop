import { NextResponse } from "next/server";
import { invalidateCatalog, requireCatalogAccess } from "@/server/catalog/access";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, notFound, readJson, uuidParam } from "@/server/http";
import { getCheckoutSetting } from "@/server/orders/settings";
import { getServiceClient } from "@/server/supabase";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/checkout-settings/[resource]/[id]">;

async function resolve(request: Request, ctx: Ctx) {
  const params = await ctx.params;
  const resource = getCheckoutSetting(params.resource);
  if (!resource) throw notFound("Recurso");
  const { storeId } = await requireCatalogAccess(request, params.storeId, "admin", resource.module);
  return { resource, storeId, id: uuidParam.parse(params.id) };
}

const missing = (entity: string) => notFound(entity.replace(/^(El|La) /, ""));

// PATCH /api/v1/stores/{storeId}/checkout-settings/{resource}/{id}
export const PATCH = apiHandler(async (request: Request, ctx: Ctx) => {
  const { resource, storeId, id } = await resolve(request, ctx);
  const input = resource.schema.parse(await readJson(request));
  const { data, error } = await getServiceClient()
    .from(resource.table)
    .update(resource.toRow(input))
    .eq("store_id", storeId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) mapDbError(error, resource.entity);
  if (!data) throw missing(resource.entity);
  invalidateCatalog(storeId);
  return NextResponse.json({ id });
});

// DELETE /api/v1/stores/{storeId}/checkout-settings/{resource}/{id}
// Orders keep their snapshot: deleting a zone or method only clears the reference (orders are never touched).
export const DELETE = apiHandler(async (request: Request, ctx: Ctx) => {
  const { resource, storeId, id } = await resolve(request, ctx);
  const { data, error } = await getServiceClient()
    .from(resource.table)
    .delete()
    .eq("store_id", storeId)
    .eq("id", id)
    .select("id");
  if (error) mapDbError(error, resource.entity);
  if (!data?.length) throw missing(resource.entity);
  invalidateCatalog(storeId);
  return new NextResponse(null, { status: 204 });
});
