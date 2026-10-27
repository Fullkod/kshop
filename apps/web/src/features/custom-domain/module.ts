import { Globe } from "@kshop/ui";
import type { AdminModule } from "../types";

export const customDomainModule: AdminModule = {
  code: "custom_domain",
  label: "Dominio propio",
  adminPath: "/admin/custom-domain",
  group: "store",
  icon: Globe,
  availableInPhase: 6,
};
