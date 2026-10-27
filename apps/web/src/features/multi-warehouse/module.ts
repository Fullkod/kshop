import { Warehouse } from "@kshop/ui";
import type { AdminModule } from "../types";

export const multiWarehouseModule: AdminModule = {
  code: "multi_warehouse",
  label: "Almacenes",
  adminPath: "/admin/multi-warehouse",
  group: "catalog",
  icon: Warehouse,
  availableInPhase: 6,
};
