import { Store } from "@kshop/ui";
import type { AdminModule } from "../types";

export const posModule: AdminModule = {
  code: "pos",
  label: "Caja",
  adminPath: "/admin/pos",
  group: "sales",
  icon: Store,
  availableInPhase: 9,
};
