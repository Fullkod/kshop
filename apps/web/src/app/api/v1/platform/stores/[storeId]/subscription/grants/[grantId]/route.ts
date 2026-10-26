import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { revokeGrant } from "@/server/billing";
import { apiHandler, uuidParam } from "@/server/http";

// DELETE /api/v1/platform/stores/{id}/subscription/grants/{grantId}  (stops a discount or a frozen price)
export const DELETE = apiHandler(
  async (
    request: Request,
    ctx: RouteContext<"/api/v1/platform/stores/[storeId]/subscription/grants/[grantId]">,
  ) => {
    const user = await requireSuperadmin(request);
    const params = await ctx.params;
    const storeId = uuidParam.parse(params.storeId);
    return NextResponse.json(await revokeGrant(storeId, uuidParam.parse(params.grantId), user.id));
  },
);
