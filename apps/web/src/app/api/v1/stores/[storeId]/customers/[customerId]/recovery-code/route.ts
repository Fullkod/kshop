import { NextResponse } from "next/server";
import { getUserFromBearer, requireModule, requireStoreRole } from "@/server/auth";
import { createRecoveryCode } from "@/server/customers/accounts";
import { apiHandler, uuidParam } from "@/server/http";

// POST /api/v1/stores/{storeId}/customers/{customerId}/recovery-code  (admin+)
// D5 without OpenWA: a one-time 6-digit code (60 min) the staff sends to the customer over WhatsApp.
// The code can take over the account, so it is shown once and only to admins.
export const POST = apiHandler(
  async (
    request: Request,
    ctx: RouteContext<"/api/v1/stores/[storeId]/customers/[customerId]/recovery-code">,
  ) => {
    const params = await ctx.params;
    const storeId = uuidParam.parse(params.storeId);
    const user = await getUserFromBearer(request);
    await requireStoreRole(user, storeId, "admin");
    await requireModule(storeId, "orders");
    const result = await createRecoveryCode(storeId, uuidParam.parse(params.customerId), user.id);
    return NextResponse.json(result, { status: 201 });
  },
);
