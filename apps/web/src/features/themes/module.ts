import { Palette } from "@kshop/ui";
import type { AdminModule } from "../types";

export const themesModule: AdminModule = {
  code: "themes",
  label: "Apariencia",
  adminPath: "/admin/themes",
  group: "store",
  icon: Palette,
  availableInPhase: 2,
};
