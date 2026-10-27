import { TrendingUp } from "@kshop/ui";
import type { AdminModule } from "../types";

export const salesTodayModule: AdminModule = {
  code: "sales_today",
  label: "Ventas de hoy",
  adminPath: "/admin/sales-today",
  group: "business",
  icon: TrendingUp,
  availableInPhase: 3,
};
