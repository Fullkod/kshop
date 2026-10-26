import { NextResponse } from "next/server";
import { getMobileApp, requestMobileApp } from "@/server/app-builds";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler } from "@/server/http";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/mobile-app">;

// GET /api/v1/stores/{storeId}/mobile-app  (owner/admin, mobile_app) -> { requestedAt, latest, adminApp }
export const GET = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "mobile_app");
  return NextResponse.json(await getMobileApp(storeId));
});

// POST /api/v1/stores/{storeId}/mobile-app -> the owner asks for their app (D14); idempotent
export const POST = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId, user } = await requireCatalogAccess(
    request,
    (await ctx.params).storeId,
    "admin",
    "mobile_app",
  );
  await requestMobileApp(storeId, user.id);
  return NextResponse.json(await getMobileApp(storeId));
});
