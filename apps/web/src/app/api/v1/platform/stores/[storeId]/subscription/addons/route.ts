import { storeAddonSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { setStoreAddon } from "@/server/billing";
import { apiHandler, readJson, uuidParam } from "@/server/http";

// PUT /api/v1/platform/stores/{id}/subscription/addons  { moduleCode, enabled }  (price frozen when bought)
export const PUT = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/stores/[storeId]/subscription/addons">) => {
    const user = await requireSuperadmin(request);
    const storeId = uuidParam.parse((await ctx.params).storeId);
    const input = storeAddonSchema.parse(await readJson(request));
    return NextResponse.json(await setStoreAddon(storeId, input.moduleCode, input.enabled, user.id));
  },
);
