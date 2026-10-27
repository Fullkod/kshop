import { NextResponse } from "next/server";
import { requireCustomer } from "@/server/customers/accounts";
import { addFavorite, removeFavorite } from "@/server/customers/favorites";
import { apiHandler, uuidParam } from "@/server/http";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/customer/favorites/[productId]">;

// PUT /api/v1/stores/{storeId}/customer/favorites/{productId}  (idempotent)
export const PUT = apiHandler(async (request: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const storeId = uuidParam.parse(params.storeId);
  const { customer } = await requireCustomer(request, storeId);
  await addFavorite(storeId, customer.id, uuidParam.parse(params.productId));
  return new NextResponse(null, { status: 204 });
});

// DELETE /api/v1/stores/{storeId}/customer/favorites/{productId}  (idempotent)
export const DELETE = apiHandler(async (request: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const storeId = uuidParam.parse(params.storeId);
  const { customer } = await requireCustomer(request, storeId);
  await removeFavorite(storeId, customer.id, uuidParam.parse(params.productId));
  return new NextResponse(null, { status: 204 });
});
