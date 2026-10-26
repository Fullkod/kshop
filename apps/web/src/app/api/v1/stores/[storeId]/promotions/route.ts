import { promotionSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { savePromotion } from "@/server/discounts/admin";
import { apiHandler, readJson } from "@/server/http";

// POST /api/v1/stores/{storeId}/promotions  (admin+, module discounts)
// { name, description?, reward: percent|fixed, value, startsAt?, endsAt?, isActive, priority, targets: [{type, id}] }
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/promotions">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "discounts");
    const input = promotionSchema.parse(await readJson(request));
    return NextResponse.json({ id: await savePromotion(storeId, null, input) }, { status: 201 });
  },
);
