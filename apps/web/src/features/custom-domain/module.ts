import type { AdminModule } from "../types";

export const customDomainModule: AdminModule = {
  code: "custom_domain",
  label: "Dominio propio",
  adminPath: "/admin/custom-domain",
  availableInPhase: 6,
};
