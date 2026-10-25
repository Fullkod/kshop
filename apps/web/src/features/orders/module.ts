import type { AdminModule } from "../types";

export const ordersModule: AdminModule = {
  code: "orders",
  label: "Pedidos",
  adminPath: "/admin/orders",
  availableInPhase: 3,
};
