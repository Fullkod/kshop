import { voucherSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { deleteVoucher, saveVoucher } from "@/server/discounts/admin";
import { apiHandler, readJson, uuidParam } from "@/server/http";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/vouchers/[voucherId]">;

async function resolve(request: Request, ctx: Ctx) {
  const params = await ctx.params;
  const { storeId } = await requireCatalogAccess(request, params.storeId, "admin", "discounts");
  return { storeId, id: uuidParam.parse(params.voucherId) };
}

// PUT /api/v1/stores/{storeId}/vouchers/{voucherId}  (same body as POST)
export const PUT = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId, id } = await resolve(request, ctx);
  const input = voucherSchema.parse(await readJson(request));
  return NextResponse.json({ id: await saveVoucher(storeId, id, input) });
});

// DELETE /api/v1/stores/{storeId}/vouchers/{voucherId}  (a used voucher is deactivated, its usages are kept)
export const DELETE = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId, id } = await resolve(request, ctx);
  await deleteVoucher(storeId, id);
  return new NextResponse(null, { status: 204 });
});
