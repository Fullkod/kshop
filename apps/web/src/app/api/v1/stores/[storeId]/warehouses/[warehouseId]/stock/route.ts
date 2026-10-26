import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler, uuidParam } from "@/server/http";
import { getWarehouseStock } from "@/server/warehouses";

// GET /api/v1/stores/{storeId}/warehouses/{warehouseId}/stock?q=  (staff, multi_warehouse)
// Products of the search (SKU or name), or the ones with stock in the warehouse when q is empty (max 30).
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/warehouses/[warehouseId]/stock">) => {
    const params = await ctx.params;
    const { storeId } = await requireCatalogAccess(request, params.storeId, "staff", "multi_warehouse");
    const warehouseId = uuidParam.parse(params.warehouseId);
    const query = z.string().trim().max(80).parse(new URL(request.url).searchParams.get("q") ?? "");
    return NextResponse.json({ rows: await getWarehouseStock(storeId, warehouseId, query) });
  },
);
