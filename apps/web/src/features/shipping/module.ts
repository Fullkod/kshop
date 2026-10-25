import type { AdminModule } from "../types";

export const shippingModule: AdminModule = {
  code: "shipping",
  label: "Entregas",
  adminPath: "/admin/shipping",
  availableInPhase: 3,
};
