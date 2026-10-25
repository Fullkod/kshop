import type { AdminModule } from "../types";

export const discountsModule: AdminModule = {
  code: "discounts",
  label: "Descuentos",
  adminPath: "/admin/discounts",
  availableInPhase: 4,
};
