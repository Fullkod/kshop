import { Truck } from "@kshop/ui";
import type { AdminModule } from "../types";

export const shippingModule: AdminModule = {
  code: "shipping",
  label: "Entregas",
  adminPath: "/admin/shipping",
  group: "sales",
  icon: Truck,
  availableInPhase: 3,
};
