import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { getPlans } from "@/server/billing";
import { apiHandler } from "@/server/http";

// GET /api/v1/platform/plans  -> { plans, modules } (prices in USD, limits, modules of each plan, add-on prices)
export const GET = apiHandler(async (request: Request) => {
  await requireSuperadmin(request);
  return NextResponse.json(await getPlans());
});
