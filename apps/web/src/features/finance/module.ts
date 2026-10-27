import { Wallet } from "@kshop/ui";
import type { AdminModule } from "../types";

export const financeModule: AdminModule = {
  code: "finance",
  label: "Finanzas",
  adminPath: "/admin/finance",
  group: "business",
  icon: Wallet,
  availableInPhase: 6,
};
