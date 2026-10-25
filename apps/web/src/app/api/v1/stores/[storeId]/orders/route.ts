import { adminOrderSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler, readJson } from "@/server/http";
import { placeOrder } from "@/server/orders/checkout";

// POST /api/v1/stores/{storeId}/orders  (staff+)  "Nuevo pedido" from the admin (channel admin, decision 23):
// the same transactional checkout, with lines picked by the staff and an optional existing customer.
export const POST = apiHandler(async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/orders">) => {
  const { storeId, user } = await requireCatalogAccess(request, (await ctx.params).storeId, "staff", "orders");
  const input = adminOrderSchema.parse(await readJson(request));
  const result = await placeOrder(storeId, {
    channel: "admin",
    customerId: input.customerId ?? null,
    cartId: null,
    lines: input.lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
    input,
    createdBy: user.id,
    voucherCode: input.voucherCode ?? null,
    manualDiscount: input.manualDiscount ?? null,
  });
  return NextResponse.json(result, { status: result.created ? 201 : 200 });
});
