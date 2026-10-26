import { expenseInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCatalogAccess } from "@/server/catalog/access";
import { createExpense, listExpenses } from "@/server/finance";
import { apiHandler, readJson } from "@/server/http";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/finance/expenses">;

// GET /api/v1/stores/{storeId}/finance/expenses?from&to  (owner/admin, finance)
export const GET = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "finance");
  const { from, to } = z
    .object({ from: z.iso.date(), to: z.iso.date() })
    .parse(Object.fromEntries(new URL(request.url).searchParams));
  return NextResponse.json({ expenses: await listExpenses(storeId, from, to) });
});

// POST { spentOn, category, amount, currency, note? }
export const POST = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId, user } = await requireCatalogAccess(
    request,
    (await ctx.params).storeId,
    "admin",
    "finance",
  );
  const input = expenseInputSchema.parse(await readJson(request));
  return NextResponse.json(await createExpense(storeId, input, user), { status: 201 });
});
