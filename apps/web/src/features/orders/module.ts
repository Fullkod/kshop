import { ShoppingBag } from "@kshop/ui";
import type { AdminModule } from "../types";

export const ordersModule: AdminModule = {
  code: "orders",
  label: "Pedidos",
  adminPath: "/admin/orders",
  group: "sales",
  icon: ShoppingBag,
  availableInPhase: 3,
};
