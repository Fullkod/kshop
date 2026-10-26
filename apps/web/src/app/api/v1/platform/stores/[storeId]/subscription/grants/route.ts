import { subscriptionGrantSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { addGrant } from "@/server/billing";
import { apiHandler, readJson, uuidParam } from "@/server/http";

// POST /api/v1/platform/stores/{id}/subscription/grants  { type: free_days|discount_percent|price_lock, value,
// reason?, endsAt? }
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/stores/[storeId]/subscription/grants">) => {
    const user = await requireSuperadmin(request);
    const storeId = uuidParam.parse((await ctx.params).storeId);
    const input = subscriptionGrantSchema.parse(await readJson(request));
    return NextResponse.json(await addGrant(storeId, input, user.id), { status: 201 });
  },
);
