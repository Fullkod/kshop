import { posFloatSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler, readJson } from "@/server/http";
import { setPosFloat } from "@/server/pos-closings";

// PATCH /api/v1/stores/{storeId}/pos/settings  (admin+, module pos). { float: {"CUP": 500} }: the change the till
// opens with every day; the closing counts on it (KSH0012, P1).
export const PATCH = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/pos/settings">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "pos");
    const { float } = posFloatSchema.parse(await readJson(request));
    await setPosFloat(storeId, float);
    return NextResponse.json({ float });
  },
);
