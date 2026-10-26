import { platformPaymentSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { recordPayment } from "@/server/billing";
import { apiHandler, readJson, uuidParam } from "@/server/http";

// POST /api/v1/platform/invoices/{id}/payments  { amount, method: cash|transfer|other, reference?, notes?, paidAt? }
// USD collected in person. Covering the total marks the invoice paid and reopens a store closed by billing.
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/invoices/[invoiceId]/payments">) => {
    const user = await requireSuperadmin(request);
    const invoiceId = uuidParam.parse((await ctx.params).invoiceId);
    const input = platformPaymentSchema.parse(await readJson(request));
    return NextResponse.json({ invoice: await recordPayment(invoiceId, input, user.id) }, { status: 201 });
  },
);
