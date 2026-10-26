import { changePlanSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { changePlan } from "@/server/billing";
import { apiHandler, readJson, uuidParam } from "@/server/http";

// PUT /api/v1/platform/stores/{id}/subscription/plan  { planCode, interval }
// Modules and limits change at once (nothing is deleted); no proration: the next invoice uses the new plan.
export const PUT = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/stores/[storeId]/subscription/plan">) => {
    const user = await requireSuperadmin(request);
    const storeId = uuidParam.parse((await ctx.params).storeId);
    return NextResponse.json(
      await changePlan(storeId, changePlanSchema.parse(await readJson(request)), user.id),
    );
  },
);
