import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/server/auth";
import { listInvoices } from "@/server/billing";
import { apiHandler } from "@/server/http";

// GET /api/v1/platform/invoices?status=open|overdue|paid|all  (open and overdue: soonest due first)
export const GET = apiHandler(async (request: Request) => {
  await requireSuperadmin(request);
  const status = z
    .enum(["open", "overdue", "paid", "all"])
    .catch("open")
    .parse(new URL(request.url).searchParams.get("status") ?? "open");
  return NextResponse.json({ invoices: await listInvoices({ status }) });
});
