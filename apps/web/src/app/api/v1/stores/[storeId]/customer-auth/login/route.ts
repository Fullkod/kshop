import { customerLoginSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { clientIp, loginCustomer, mergeGuestCart } from "@/server/customers/accounts";
import { apiHandler, readJson, uuidParam } from "@/server/http";

// POST /api/v1/stores/{storeId}/customer-auth/login  { phone, password, cartToken? }
// 401 with the same message for an unknown phone or a wrong password; 429 after too many attempts.
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/customer-auth/login">) => {
    const storeId = uuidParam.parse((await ctx.params).storeId);
    const { cartToken, ...input } = customerLoginSchema.parse(await readJson(request));
    const result = await loginCustomer(storeId, input, clientIp(request));
    await mergeGuestCart(storeId, cartToken, result.customer.id);
    return NextResponse.json(result);
  },
);
