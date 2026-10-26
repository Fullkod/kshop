import "server-only";
import type { StockMovementQuery, StockMovementType, StockTransferInput } from "@kshop/core";
import type { StockMovementsPage, WarehouseStockRow, WarehousesOverview } from "@kshop/data";
import type { ApiUser } from "./auth";
import { invalidateCatalog } from "./catalog/access";
import { mapDbError } from "./db-errors";
import { getServiceClient } from "./supabase";

// Phase 6 (PRP-6 D11–D15): Admin › Almacenes. The SQL functions check the module again and lock the stock rows.

const MOVEMENTS_PAGE_SIZE = 50;

export async function getWarehousesOverview(storeId: string): Promise<WarehousesOverview> {
  const db = getServiceClient();
  const [warehouses, totals, zones, links] = await Promise.all([
    db
      .from("warehouses")
      .select("id, name, address, is_default, is_active, is_pickup_point")
      .eq("store_id", storeId)
      .order("is_default", { ascending: false })
      .order("name"),
    db.rpc("warehouse_totals", { p_store_id: storeId }),
    db.from("shipping_zones").select("id, name, is_active").eq("store_id", storeId).order("sort_order").order("name"),
    db
      .from("warehouse_shipping_zones")
      .select("zone_id, warehouse_id, priority")
      .eq("store_id", storeId)
      .order("priority"),
  ]);
  for (const result of [warehouses, totals, zones, links]) if (result.error) throw result.error;

  const totalsById = new Map(
    ((totals.data ?? []) as { warehouse_id: string; variants: number; units: number; reserved: number }[]).map(
      (t) => [t.warehouse_id, t],
    ),
  );
  return {
    warehouses: (warehouses.data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      address: w.address,
      isDefault: w.is_default,
      isActive: w.is_active,
      isPickupPoint: w.is_pickup_point,
      variants: totalsById.get(w.id)?.variants ?? 0,
      units: Number(totalsById.get(w.id)?.units ?? 0),
      reserved: Number(totalsById.get(w.id)?.reserved ?? 0),
    })),
    zones: (zones.data ?? []).map((z) => ({
      id: z.id,
      name: z.name,
      isActive: z.is_active,
      warehouseIds: (links.data ?? []).filter((l) => l.zone_id === z.id).map((l) => l.warehouse_id),
    })),
  };
}

export async function setZoneWarehouses(storeId: string, zoneId: string, warehouseIds: string[]) {
  const { error } = await getServiceClient().rpc("set_zone_warehouses", {
    p_store_id: storeId,
    p_zone_id: zoneId,
    p_warehouse_ids: warehouseIds,
  });
  if (error) mapDbError(error, "La zona");
  return { zoneId, warehouseIds };
}

export async function getWarehouseStock(
  storeId: string,
  warehouseId: string,
  query: string,
): Promise<WarehouseStockRow[]> {
  const { data, error } = await getServiceClient().rpc("warehouse_stock", {
    p_store_id: storeId,
    p_warehouse_id: warehouseId,
    p_query: query,
    p_limit: 30,
  });
  if (error) throw error;
  return (
    (data ?? []) as {
      variant_id: string;
      product_name: string;
      variant_name: string;
      sku: string;
      quantity: number;
      allocated: number;
    }[]
  ).map((r) => ({
    variantId: r.variant_id,
    productName: r.product_name,
    variantName: r.variant_name,
    sku: r.sku,
    quantity: r.quantity,
    allocated: r.allocated,
  }));
}

export async function transferStock(storeId: string, input: StockTransferInput, user: ApiUser) {
  const { data, error } = await getServiceClient().rpc("transfer_stock", {
    p_store_id: storeId,
    p_from: input.fromWarehouseId,
    p_to: input.toWarehouseId,
    p_lines: input.lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
    p_note: input.note ?? null,
    p_user_id: user.id,
  });
  if (error) mapDbError(error, "El traspaso");
  invalidateCatalog(storeId);
  const result = data as { transfer_id: string; variants: number; units: number };
  return { transferId: result.transfer_id, variants: result.variants, units: result.units };
}

type MovementRow = {
  id: string;
  created_at: string;
  type: StockMovementType;
  quantity: number;
  note: string | null;
  order_id: string | null;
  transfer_id: string | null;
  user_id: string | null;
  warehouses: { name: string } | null;
  product_variants: { name: string; sku: string; products: { name: string } | null } | null;
};

export async function listStockMovements(storeId: string, query: StockMovementQuery): Promise<StockMovementsPage> {
  const db = getServiceClient();
  let select = db
    .from("stock_movements")
    .select(
      "id, created_at, type, quantity, note, order_id, transfer_id, user_id, warehouses(name), product_variants(name, sku, products(name))",
      { count: "exact" },
    )
    .eq("store_id", storeId);
  if (query.warehouseId) select = select.eq("warehouse_id", query.warehouseId);
  if (query.variantId) select = select.eq("variant_id", query.variantId);
  if (query.type) select = select.eq("type", query.type);
  // Dates are Havana days (UTC-5/-4): the boundary is taken at 05:00 UTC, close enough for a movement list.
  if (query.from) select = select.gte("created_at", `${query.from}T05:00:00Z`);
  if (query.to) {
    const next = new Date(`${query.to}T05:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    select = select.lt("created_at", next.toISOString());
  }
  const offset = (query.page - 1) * MOVEMENTS_PAGE_SIZE;
  const { data, error, count } = await select
    .order("created_at", { ascending: false })
    .order("id")
    .range(offset, offset + MOVEMENTS_PAGE_SIZE - 1);
  if (error) throw error;
  const rows = (data ?? []) as unknown as MovementRow[];

  const orderIds = [...new Set(rows.flatMap((r) => (r.order_id ? [r.order_id] : [])))];
  const userIds = [...new Set(rows.flatMap((r) => (r.user_id ? [r.user_id] : [])))];
  const [orders, emails] = await Promise.all([
    orderIds.length
      ? db.from("orders").select("id, number").eq("store_id", storeId).in("id", orderIds)
      : Promise.resolve({ data: [] as { id: string; number: number }[] }),
    Promise.all(userIds.map((id) => db.auth.admin.getUserById(id))),
  ]);
  const numberById = new Map((orders.data ?? []).map((o) => [o.id, o.number]));
  const emailById = new Map(emails.map((r, i) => [userIds[i], r.data.user?.email ?? null]));

  return {
    movements: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      type: r.type,
      quantity: r.quantity,
      warehouseName: r.warehouses?.name ?? "",
      productName: r.product_variants?.products?.name ?? "",
      variantName: r.product_variants?.name ?? "",
      sku: r.product_variants?.sku ?? "",
      note: r.note,
      orderId: r.order_id,
      orderNumber: r.order_id ? (numberById.get(r.order_id) ?? null) : null,
      transferId: r.transfer_id,
      userEmail: r.user_id ? (emailById.get(r.user_id) ?? null) : null,
    })),
    total: count ?? 0,
    page: query.page,
    pageSize: MOVEMENTS_PAGE_SIZE,
  };
}
