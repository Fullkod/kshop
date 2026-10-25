import { customerResetSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { clientIp, resetCustomerPassword } from "@/server/customers/accounts";
import { apiHandler, readJson, uuidParam } from "@/server/http";

// POST /api/v1/stores/{storeId}/customer-auth/reset  { phone, code, password }
// The code comes from the store over WhatsApp (staff generates it in Clientes). Signs the customer in.
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/customer-auth/reset">) => {
    const storeId = uuidParam.parse((await ctx.params).storeId);
    const input = customerResetSchema.parse(await readJson(request));
    return NextResponse.json(await resetCustomerPassword(storeId, input, clientIp(request)));
  },
);
