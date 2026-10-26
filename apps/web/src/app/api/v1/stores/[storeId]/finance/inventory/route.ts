import { financeInventoryQuerySchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { getInventory } from "@/server/finance";
import { apiHandler } from "@/server/http";

// GET /api/v1/stores/{storeId}/finance/inventory?currency&warehouseId&filter&staleDays&q&page  (owner/admin, finance)
// Stock valued at cost and at sale price with today's rates (50 rows per page).
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/finance/inventory">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "finance");
    const query = financeInventoryQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(await getInventory(storeId, query));
  },
);
