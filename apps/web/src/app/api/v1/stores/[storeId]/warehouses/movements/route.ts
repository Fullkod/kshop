import { stockMovementQuerySchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler } from "@/server/http";
import { listStockMovements } from "@/server/warehouses";

// GET /api/v1/stores/{storeId}/warehouses/movements?warehouseId&variantId&type&from&to&page  (staff, multi_warehouse)
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/warehouses/movements">) => {
    const { storeId } = await requireCatalogAccess(
      request,
      (await ctx.params).storeId,
      "staff",
      "multi_warehouse",
    );
    const query = stockMovementQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(await listStockMovements(storeId, query));
  },
);
