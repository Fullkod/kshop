import { storeModuleGrantSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { setStoreModuleGrant } from "@/server/billing";
import { apiHandler, readJson, uuidParam } from "@/server/http";

// PUT /api/v1/platform/stores/{id}/subscription/module-grants  { moduleCode, enabled, endsAt?, reason? }  (free)
export const PUT = apiHandler(
  async (
    request: Request,
    ctx: RouteContext<"/api/v1/platform/stores/[storeId]/subscription/module-grants">,
  ) => {
    const user = await requireSuperadmin(request);
    const storeId = uuidParam.parse((await ctx.params).storeId);
    const input = storeModuleGrantSchema.parse(await readJson(request));
    return NextResponse.json(await setStoreModuleGrant(storeId, input, user.id));
  },
);
