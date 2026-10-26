import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { issueInvoice } from "@/server/billing";
import { apiHandler, uuidParam } from "@/server/http";

// POST /api/v1/platform/stores/{id}/subscription/invoices  -> issues now the next invoice not issued yet
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/stores/[storeId]/subscription/invoices">) => {
    const user = await requireSuperadmin(request);
    const storeId = uuidParam.parse((await ctx.params).storeId);
    return NextResponse.json(await issueInvoice(storeId, user.id), { status: 201 });
  },
);
