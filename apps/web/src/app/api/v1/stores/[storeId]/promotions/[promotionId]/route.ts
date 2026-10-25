import { promotionSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { deletePromotion, savePromotion } from "@/server/discounts/admin";
import { apiHandler, readJson, uuidParam } from "@/server/http";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/promotions/[promotionId]">;

async function resolve(request: Request, ctx: Ctx) {
  const params = await ctx.params;
  const { storeId } = await requireCatalogAccess(request, params.storeId, "admin", "discounts");
  return { storeId, id: uuidParam.parse(params.promotionId) };
}

// PUT /api/v1/stores/{storeId}/promotions/{promotionId}  (same body as POST)
export const PUT = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId, id } = await resolve(request, ctx);
  const input = promotionSchema.parse(await readJson(request));
  return NextResponse.json({ id: await savePromotion(storeId, id, input) });
});

// DELETE /api/v1/stores/{storeId}/promotions/{promotionId}  (orders keep their snapshot)
export const DELETE = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId, id } = await resolve(request, ctx);
  await deletePromotion(storeId, id);
  return new NextResponse(null, { status: 204 });
});
