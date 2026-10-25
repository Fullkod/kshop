import { platformWhatsappSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { apiHandler, readJson } from "@/server/http";
import { getPlatformWhatsapp, setPlatformWhatsapp } from "@/server/notifications/admin";

// The platform WhatsApp (OpenWA) of every store. Superadmin only; the API key is write-only (hasApiKey).

// GET /api/v1/platform/whatsapp  -> { mode, url, session, ratePerMinute, storeRatePerMinute, hasApiKey, queue }
export const GET = apiHandler(async (request: Request) => {
  await requireSuperadmin(request);
  return NextResponse.json(await getPlatformWhatsapp());
});

// PUT /api/v1/platform/whatsapp  { mode: off|dry_run|live, url, session, apiKey?, ratePerMinute, storeRatePerMinute }
export const PUT = apiHandler(async (request: Request) => {
  await requireSuperadmin(request);
  const input = platformWhatsappSchema.parse(await readJson(request));
  return NextResponse.json(await setPlatformWhatsapp(input));
});
