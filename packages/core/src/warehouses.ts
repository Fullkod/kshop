import { z } from "zod";

// Phase 6: multi-warehouse module (zones served by each warehouse, transfers, stock movements).

export const STOCK_MOVEMENT_TYPES = [
  "adjustment",
  "sale",
  "cancel",
  "refund",
  "transfer_in",
  "transfer_out",
  "purchase",
  "import",
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];
export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  adjustment: "Ajuste",
  sale: "Venta",
  cancel: "Pedido cancelado",
  refund: "Devolución",
  transfer_in: "Traspaso recibido",
  transfer_out: "Traspaso enviado",
  purchase: "Compra",
  import: "Importación",
};

/** PUT /warehouses/zones/{zoneId}: the zone's warehouses in priority order (empty = every warehouse). */
export const zoneWarehousesSchema = z.object({
  warehouseIds: z.array(z.uuid()).max(50),
});
export type ZoneWarehousesInput = z.infer<typeof zoneWarehousesSchema>;

/** POST /warehouses/transfers: immediate move of free units (reserved ones stay). */
export const stockTransferSchema = z
  .object({
    fromWarehouseId: z.uuid(),
    toWarehouseId: z.uuid(),
    lines: z
      .array(
        z.object({
          variantId: z.uuid(),
          quantity: z.coerce.number().int().min(1, "Mínimo 1.").max(99_999),
        }),
      )
      .min(1, "Añade al menos un producto.")
      .max(100),
    note: z
      .string()
      .trim()
      .max(200)
      .transform((v) => (v === "" ? undefined : v))
      .optional(),
  })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
    message: "Elige dos almacenes distintos.",
    path: ["toWarehouseId"],
  });
export type StockTransferInput = z.infer<typeof stockTransferSchema>;

/** GET /warehouses/movements filters. */
export const stockMovementQuerySchema = z.object({
  warehouseId: z.uuid().optional(),
  variantId: z.uuid().optional(),
  type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type StockMovementQuery = z.infer<typeof stockMovementQuerySchema>;
