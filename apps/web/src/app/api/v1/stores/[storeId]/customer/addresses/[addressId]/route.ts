import { customerAddressSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCustomer } from "@/server/customers/accounts";
import { deleteAddress, saveAddress } from "@/server/customers/addresses";
import { apiHandler, readJson, uuidParam } from "@/server/http";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/customer/addresses/[addressId]">;

// PATCH /api/v1/stores/{storeId}/customer/addresses/{addressId}
export const PATCH = apiHandler(async (request: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const storeId = uuidParam.parse(params.storeId);
  const { customer } = await requireCustomer(request, storeId);
  const input = customerAddressSchema.parse(await readJson(request));
  const address = await saveAddress(storeId, customer.id, input, uuidParam.parse(params.addressId));
  return NextResponse.json({ address });
});

// DELETE /api/v1/stores/{storeId}/customer/addresses/{addressId}
export const DELETE = apiHandler(async (request: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const storeId = uuidParam.parse(params.storeId);
  const { customer } = await requireCustomer(request, storeId);
  await deleteAddress(storeId, customer.id, uuidParam.parse(params.addressId));
  return new NextResponse(null, { status: 204 });
});
