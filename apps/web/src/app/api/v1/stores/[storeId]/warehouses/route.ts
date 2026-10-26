import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler } from "@/server/http";
import { getWarehousesOverview } from "@/server/warehouses";

// GET /api/v1/stores/{storeId}/warehouses  (staff, multi_warehouse)
//   -> { warehouses: [{ id, name, units, reserved, variants, … }], zones: [{ id, name, warehouseIds }] }
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/warehouses">) => {
    const { storeId } = await requireCatalogAccess(
      request,
      (await ctx.params).storeId,
      "staff",
      "multi_warehouse",
    );
    return NextResponse.json(await getWarehousesOverview(storeId));
  },
);
