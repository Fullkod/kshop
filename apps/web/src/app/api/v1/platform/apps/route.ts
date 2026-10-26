import { NextResponse } from "next/server";
import { listPlatformApps } from "@/server/app-builds";
import { requireSuperadmin } from "@/server/auth";
import { apiHandler } from "@/server/http";

// GET /api/v1/platform/apps  (superadmin) -> { stores: requests and builds per store, adminBuilds }
export const GET = apiHandler(async (request: Request) => {
  await requireSuperadmin(request);
  return NextResponse.json(await listPlatformApps());
});
