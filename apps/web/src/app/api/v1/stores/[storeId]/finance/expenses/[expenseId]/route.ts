import { expenseInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { deleteExpense, updateExpense } from "@/server/finance";
import { apiHandler, readJson, uuidParam } from "@/server/http";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/finance/expenses/[expenseId]">;

// PUT /api/v1/stores/{storeId}/finance/expenses/{expenseId}  (owner/admin, finance)
export const PUT = apiHandler(async (request: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const { storeId } = await requireCatalogAccess(request, params.storeId, "admin", "finance");
  const input = expenseInputSchema.parse(await readJson(request));
  return NextResponse.json(await updateExpense(storeId, uuidParam.parse(params.expenseId), input));
});

export const DELETE = apiHandler(async (request: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const { storeId } = await requireCatalogAccess(request, params.storeId, "admin", "finance");
  await deleteExpense(storeId, uuidParam.parse(params.expenseId));
  return new Response(null, { status: 204 });
});
