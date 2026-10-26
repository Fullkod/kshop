import { subscriptionUpdateSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { getPlatformSubscription, updateSubscription } from "@/server/billing";
import { apiHandler, readJson, uuidParam } from "@/server/http";

type Ctx = RouteContext<"/api/v1/platform/stores/[storeId]/subscription">;

// GET /api/v1/platform/stores/{id}/subscription  -> plan, state, next invoice, usage, modules, grants, invoices
export const GET = apiHandler(async (request: Request, ctx: Ctx) => {
  await requireSuperadmin(request);
  return NextResponse.json(await getPlatformSubscription(uuidParam.parse((await ctx.params).storeId)));
});

// PATCH { priceOverride?, limitOverrides?, founder?, notes?, cancelAt?, comped? }
export const PATCH = apiHandler(async (request: Request, ctx: Ctx) => {
  const user = await requireSuperadmin(request);
  const storeId = uuidParam.parse((await ctx.params).storeId);
  const input = subscriptionUpdateSchema.parse(await readJson(request));
  return NextResponse.json(await updateSubscription(storeId, input, user.id));
});
