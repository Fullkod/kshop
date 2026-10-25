import { customerRegisterSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { clientIp, mergeGuestCart, registerCustomer } from "@/server/customers/accounts";
import { apiHandler, readJson, uuidParam } from "@/server/http";

// POST /api/v1/stores/{storeId}/customer-auth/register  { firstName, lastName?, phone, password, cartToken? }
// Creates the account of this store (synthetic email) and returns its session.
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/customer-auth/register">) => {
    const storeId = uuidParam.parse((await ctx.params).storeId);
    const { cartToken, ...input } = customerRegisterSchema.parse(await readJson(request));
    const result = await registerCustomer(storeId, input, clientIp(request));
    await mergeGuestCart(storeId, cartToken, result.customer.id);
    return NextResponse.json(result, { status: 201 });
  },
);
