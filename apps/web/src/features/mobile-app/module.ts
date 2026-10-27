import { Smartphone } from "@kshop/ui";
import type { AdminModule } from "../types";

export const mobileAppModule: AdminModule = {
  code: "mobile_app",
  label: "App móvil",
  adminPath: "/admin/mobile-app",
  group: "store",
  icon: Smartphone,
  availableInPhase: 7,
};
