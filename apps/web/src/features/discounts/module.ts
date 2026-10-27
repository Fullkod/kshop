import { Tag } from "@kshop/ui";
import type { AdminModule } from "../types";

export const discountsModule: AdminModule = {
  code: "discounts",
  label: "Ofertas",
  adminPath: "/admin/discounts",
  group: "sales",
  icon: Tag,
  availableInPhase: 4,
};
