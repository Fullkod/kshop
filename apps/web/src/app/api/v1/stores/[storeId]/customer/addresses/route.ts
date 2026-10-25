import { customerAddressSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCustomer } from "@/server/customers/accounts";
import { listAddresses, saveAddress } from "@/server/customers/addresses";
import { apiHandler, readJson, uuidParam } from "@/server/http";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/customer/addresses">;

// GET /api/v1/stores/{storeId}/customer/addresses
export const GET = apiHandler(async (request: Request, ctx: Ctx) => {
  const storeId = uuidParam.parse((await ctx.params).storeId);
  const { customer } = await requireCustomer(request, storeId);
  return NextResponse.json({ addresses: await listAddresses(storeId, customer.id) });
});

// POST /api/v1/stores/{storeId}/customer/addresses  { recipient, address, shippingZoneId?, reference?, ... }
export const POST = apiHandler(async (request: Request, ctx: Ctx) => {
  const storeId = uuidParam.parse((await ctx.params).storeId);
  const { customer } = await requireCustomer(request, storeId);
  const input = customerAddressSchema.parse(await readJson(request));
  return NextResponse.json({ address: await saveAddress(storeId, customer.id, input) }, { status: 201 });
});
