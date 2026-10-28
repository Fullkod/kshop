import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { apiHandler, uuidParam } from "@/server/http";
import { sendOwnerAccess } from "@/server/staff-access";

// POST /api/v1/platform/stores/{storeId}/owner-access  (superadmin)
// New one-time access link for the owner: emailed (Resend) and returned to send over WhatsApp.
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/stores/[storeId]/owner-access">) => {
    await requireSuperadmin(request);
    const storeId = uuidParam.parse((await ctx.params).storeId);
    return NextResponse.json(await sendOwnerAccess(storeId));
  },
);
