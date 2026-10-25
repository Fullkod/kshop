import { whatsappTestSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { apiHandler, readJson } from "@/server/http";
import { sendTestMessage } from "@/server/notifications/admin";

// POST /api/v1/platform/whatsapp/test  { phone, text }  (superadmin) -> queued ("pending" in live, else "simulated")
export const POST = apiHandler(async (request: Request) => {
  await requireSuperadmin(request);
  const input = whatsappTestSchema.parse(await readJson(request));
  return NextResponse.json(await sendTestMessage(input.phone, input.text), { status: 201 });
});
