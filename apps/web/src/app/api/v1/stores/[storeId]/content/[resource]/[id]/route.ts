import { NextResponse } from "next/server";
import { getContentResource, invalidateContent, requireContentAccess } from "@/server/content/resources";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, notFound, readJson, uuidParam } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/content/[resource]/[id]">;

async function resolve(request: Request, ctx: Ctx) {
  const { storeId: rawStoreId, resource: name, id: rawId } = await ctx.params;
  const resource = getContentResource(name);
  if (!resource) throw notFound("Recurso");
  const { storeId } = await requireContentAccess(request, rawStoreId);
  return { resource, storeId, id: uuidParam.parse(rawId) };
}

// PATCH /api/v1/stores/{storeId}/content/{banners|sections|pages}/{id}  (whole entity)
export const PATCH = apiHandler(async (request: Request, ctx: Ctx) => {
  const { resource, storeId, id } = await resolve(request, ctx);
  const input = resource.schema.parse(await readJson(request));

  const { data, error } = await getServiceClient()
    .from(resource.table)
    .update(resource.toRow(input, storeId))
    .eq("store_id", storeId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) mapDbError(error, resource.entity);
  if (!data) throw notFound(resource.entity.replace(/^(El|La) /, ""));

  await resource.saveChildren?.(storeId, id, input);
  invalidateContent(storeId);
  return NextResponse.json({ id });
});

export const DELETE = apiHandler(async (request: Request, ctx: Ctx) => {
  const { resource, storeId, id } = await resolve(request, ctx);
  const { data, error } = await getServiceClient()
    .from(resource.table)
    .delete()
    .eq("store_id", storeId)
    .eq("id", id)
    .select("id");
  if (error) mapDbError(error, resource.entity);
  if (!data?.length) throw notFound(resource.entity.replace(/^(El|La) /, ""));

  invalidateContent(storeId);
  return new NextResponse(null, { status: 204 });
});
