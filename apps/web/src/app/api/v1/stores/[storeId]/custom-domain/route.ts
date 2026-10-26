import { customDomainInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { getCustomDomain, removeCustomDomain, requestCustomDomain } from "@/server/custom-domains";
import { apiHandler, readJson } from "@/server/http";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/custom-domain">;

// GET /api/v1/stores/{storeId}/custom-domain  (owner/admin, custom_domain) -> { domain | null, mode }
export const GET = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId } = await requireCatalogAccess(
    request,
    (await ctx.params).storeId,
    "admin",
    "custom_domain",
  );
  return NextResponse.json(await getCustomDomain(storeId));
});

// POST /api/v1/stores/{storeId}/custom-domain  { domain } -> 201 { domain } with the DNS records to set
export const POST = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId, user } = await requireCatalogAccess(
    request,
    (await ctx.params).storeId,
    "admin",
    "custom_domain",
  );
  const input = customDomainInputSchema.parse(await readJson(request));
  return NextResponse.json({ domain: await requestCustomDomain(storeId, input, user.id) }, { status: 201 });
});

// DELETE /api/v1/stores/{storeId}/custom-domain -> 204 (also removed from Vercel)
export const DELETE = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId } = await requireCatalogAccess(
    request,
    (await ctx.params).storeId,
    "admin",
    "custom_domain",
  );
  await removeCustomDomain(storeId);
  return new Response(null, { status: 204 });
});
