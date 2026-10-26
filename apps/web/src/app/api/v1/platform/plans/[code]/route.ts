import { PLAN_CODES, planUpdateSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/server/auth";
import { updatePlan } from "@/server/billing";
import { apiHandler, readJson } from "@/server/http";

// PUT /api/v1/platform/plans/{base|pro}  { price, yearlyPrice, isPublic, modules: [code], limits: {maxProducts, maxStaff} }
// New prices apply to the next invoices; module changes reach every store on the plan at once (data kept).
export const PUT = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/plans/[code]">) => {
    await requireSuperadmin(request);
    const code = z.enum(PLAN_CODES).parse((await ctx.params).code);
    return NextResponse.json(await updatePlan(code, planUpdateSchema.parse(await readJson(request))));
  },
);
