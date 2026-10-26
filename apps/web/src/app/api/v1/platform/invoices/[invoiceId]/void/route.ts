import { invoiceVoidSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { voidInvoice } from "@/server/billing";
import { apiHandler, readJson, uuidParam } from "@/server/http";

// POST /api/v1/platform/invoices/{id}/void  { reason? }  (pending and without payments)
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/invoices/[invoiceId]/void">) => {
    const user = await requireSuperadmin(request);
    const invoiceId = uuidParam.parse((await ctx.params).invoiceId);
    const { reason } = invoiceVoidSchema.parse(await readJson(request));
    return NextResponse.json({ invoice: await voidInvoice(invoiceId, reason, user.id) });
  },
);
