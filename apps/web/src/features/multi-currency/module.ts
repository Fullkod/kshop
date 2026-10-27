import { Coins } from "@kshop/ui";
import type { AdminModule } from "../types";

export const multiCurrencyModule: AdminModule = {
  code: "multi_currency",
  label: "Monedas",
  adminPath: "/admin/multi-currency",
  group: "catalog",
  icon: Coins,
  availableInPhase: 6,
};
