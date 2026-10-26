import { billingSettingsSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { getBillingSettings, setBillingSettings } from "@/server/billing";
import { apiHandler, readJson } from "@/server/http";

// Deadlines of the billing cycle, how to pay and the support number (PRP-5 D19).
export const GET = apiHandler(async (request: Request) => {
  await requireSuperadmin(request);
  return NextResponse.json(await getBillingSettings());
});

export const PUT = apiHandler(async (request: Request) => {
  await requireSuperadmin(request);
  return NextResponse.json(await setBillingSettings(billingSettingsSchema.parse(await readJson(request))));
});
