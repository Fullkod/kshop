import { invoiceAdjustmentSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { adjustInvoice } from "@/server/billing";
import { apiHandler, readJson, uuidParam } from "@/server/http";

// POST /api/v1/platform/invoices/{id}/adjustments  { description, amount }  (charge > 0, credit < 0; pending only)
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/invoices/[invoiceId]/adjustments">) => {
    const user = await requireSuperadmin(request);
    const invoiceId = uuidParam.parse((await ctx.params).invoiceId);
    const input = invoiceAdjustmentSchema.parse(await readJson(request));
    return NextResponse.json({
      invoice: await adjustInvoice(invoiceId, input.description, input.amount, user.id),
    });
  },
);
