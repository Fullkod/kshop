import { stockTransferSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler, readJson } from "@/server/http";
import { transferStock } from "@/server/warehouses";

// POST /api/v1/stores/{storeId}/warehouses/transfers  (staff, multi_warehouse)
//   { fromWarehouseId, toWarehouseId, lines: [{ variantId, quantity }], note? }
// Immediate; reserved units do not move (409 insufficient_stock with the free units).
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/warehouses/transfers">) => {
    const { storeId, user } = await requireCatalogAccess(
      request,
      (await ctx.params).storeId,
      "staff",
      "multi_warehouse",
    );
    const input = stockTransferSchema.parse(await readJson(request));
    return NextResponse.json(await transferStock(storeId, input, user), { status: 201 });
  },
);
