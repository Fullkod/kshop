import { zoneWarehousesSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler, readJson, uuidParam } from "@/server/http";
import { setZoneWarehouses } from "@/server/warehouses";

// PUT /api/v1/stores/{storeId}/warehouses/zones/{zoneId}  { warehouseIds }  (admin, multi_warehouse)
// The zone's warehouses in priority order; an empty list = every warehouse serves the zone.
export const PUT = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/warehouses/zones/[zoneId]">) => {
    const params = await ctx.params;
    const { storeId } = await requireCatalogAccess(request, params.storeId, "admin", "multi_warehouse");
    const zoneId = uuidParam.parse(params.zoneId);
    const input = zoneWarehousesSchema.parse(await readJson(request));
    return NextResponse.json(await setZoneWarehouses(storeId, zoneId, input.warehouseIds));
  },
);
