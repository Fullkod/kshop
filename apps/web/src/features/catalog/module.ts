import { Package } from "@kshop/ui";
import type { AdminModule } from "../types";

export const catalogModule: AdminModule = {
  code: "catalog",
  label: "Productos",
  adminPath: "/admin/catalog",
  group: "catalog",
  icon: Package,
  availableInPhase: 1,
};
