import { voucherSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { saveVoucher } from "@/server/discounts/admin";
import { apiHandler, readJson } from "@/server/http";

// POST /api/v1/stores/{storeId}/vouchers  (admin+, module discounts)
// { code, name, scope: order|specific|shipping, reward, value, minSubtotal?, minQuantity?, usageLimit?,
//   usagePerCustomer?, startsAt?, endsAt?, isActive, targets: [{type, id}] (scope specific) }
export const POST = apiHandler(async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/vouchers">) => {
  const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "discounts");
  const input = voucherSchema.parse(await readJson(request));
  return NextResponse.json({ id: await saveVoucher(storeId, null, input) }, { status: 201 });
});
