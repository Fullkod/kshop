import { stockInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { invalidateCatalog, requireCatalogAccess } from "@/server/catalog/access";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, HttpError, readJson } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

// PUT /api/v1/stores/{storeId}/catalog/stock  { variantId, warehouseId, quantity, note? }
// Sets the absolute quantity (for update + stock_movements in one transaction).
export const PUT = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/catalog/stock">) => {
    const { storeId, user } = await requireCatalogAccess(request, (await ctx.params).storeId, "staff");
    const input = stockInputSchema.parse(await readJson(request));

    const db = getServiceClient();
    const { data: warehouse } = await db
      .from("warehouses")
      .select("is_default")
      .eq("store_id", storeId)
      .eq("id", input.warehouseId)
      .maybeSingle();
    if (!warehouse) throw new HttpError(400, "invalid_reference", "El almacén no existe en esta tienda.");
    // Stock outside the default warehouse is part of multi_warehouse.
    if (!warehouse.is_default) {
      const { data: enabled } = await db
        .rpc("store_entitlements", { p_store_id: storeId })
        .eq("module_code", "multi_warehouse");
      if (!enabled?.length) {
        throw new HttpError(
          403,
          "module_not_enabled",
          "Esta función no está incluida en el plan de la tienda.",
        );
      }
    }

    const { data, error } = await db.rpc("set_stock_quantity", {
      p_store_id: storeId,
      p_variant_id: input.variantId,
      p_warehouse_id: input.warehouseId,
      p_quantity: input.quantity,
      p_type: "adjustment",
      p_note: input.note ?? null,
      p_user_id: user.id,
    });
    if (error) mapDbError(error, "El stock");

    invalidateCatalog(storeId);
    const stock = data as { quantity: number; quantity_allocated: number };
    return NextResponse.json({ quantity: stock.quantity, quantityAllocated: stock.quantity_allocated });
  },
);
