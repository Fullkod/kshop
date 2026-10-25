import { NextResponse } from "next/server";
import { invalidateCatalog, requireCatalogAccess } from "@/server/catalog/access";
import { getCatalogResource } from "@/server/catalog/resources";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, HttpError, notFound, readJson, uuidParam } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/catalog/[resource]/[id]">;

async function resolve(request: Request, ctx: Ctx) {
  const { storeId: rawStoreId, resource: name, id: rawId } = await ctx.params;
  const resource = getCatalogResource(name);
  if (!resource) throw notFound("Recurso");
  const { storeId } = await requireCatalogAccess(request, rawStoreId, resource.minRole);
  return { resource, storeId, id: uuidParam.parse(rawId) };
}

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
  if (!data) throw notFound(resource.entity.replace(/^(El|La) /, ""));

  await resource.saveChildren?.(storeId, id, input);
  invalidateCatalog(storeId);
  return NextResponse.json({ id });
});

export const DELETE = apiHandler(async (request: Request, ctx: Ctx) => {
  const { resource, storeId, id } = await resolve(request, ctx);
  const db = getServiceClient();

  if (resource.table === "warehouses") {
    const { data } = await db
      .from("warehouses")
      .select("is_default")
      .eq("store_id", storeId)
      .eq("id", id)
      .maybeSingle();
    if (data?.is_default) {
      throw new HttpError(409, "in_use", "El almacén principal no se puede borrar.");
    }
  }

  const { data, error } = await db
    .from(resource.table)
    .delete()
    .eq("store_id", storeId)
    .eq("id", id)
    .select("id");
  if (error) mapDbError(error, resource.entity);
  if (!data?.length) throw notFound(resource.entity.replace(/^(El|La) /, ""));

  invalidateCatalog(storeId);
  return new NextResponse(null, { status: 204 });
});
