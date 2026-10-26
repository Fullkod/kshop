import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { listPlatformDomains } from "@/server/custom-domains";
import { apiHandler } from "@/server/http";

// GET /api/v1/platform/domains  (superadmin) -> { domains: every custom domain with its store, mode }
export const GET = apiHandler(async (request: Request) => {
  await requireSuperadmin(request);
  return NextResponse.json(await listPlatformDomains());
});
