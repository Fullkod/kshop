import { NextResponse } from "next/server";
import { requireCustomer } from "@/server/customers/accounts";
import { listFavorites } from "@/server/customers/favorites";
import { apiHandler, uuidParam } from "@/server/http";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/customer/favorites">;

// GET /api/v1/stores/{storeId}/customer/favorites  → { productIds, products } (published ones, newest first)
export const GET = apiHandler(async (request: Request, ctx: Ctx) => {
  const storeId = uuidParam.parse((await ctx.params).storeId);
  const { customer } = await requireCustomer(request, storeId);
  return NextResponse.json(await listFavorites(storeId, customer.id));
});
