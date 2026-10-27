import type { ModuleCode } from "@kshop/core";
import type { LucideIcon } from "@kshop/ui";

/** Groups of the admin sidebar (redesign R6), in this order. */
export const ADMIN_GROUPS = [
  { key: "sales", label: "Ventas" },
  { key: "catalog", label: "Catálogo" },
  { key: "store", label: "Tienda" },
  { key: "business", label: "Negocio" },
] as const;
export type AdminGroup = (typeof ADMIN_GROUPS)[number]["key"];

/** What a feature module contributes to the store admin. Each module lives in features/<module>/module.ts. */
export type AdminModule = {
  code: ModuleCode;
  label: string;
  adminPath: `/admin/${string}`;
  /** Sidebar group; inside a group the registry order applies. */
  group: AdminGroup;
  icon: LucideIcon;
  /** Roadmap phase that ships the module's screens (shown while they are not built). */
  availableInPhase: number;
};
