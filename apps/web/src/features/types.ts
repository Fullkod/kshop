import type { ModuleCode } from "@kshop/core";

/** What a feature module contributes to the store admin. Each module lives in features/<module>/module.ts. */
export type AdminModule = {
  code: ModuleCode;
  label: string;
  adminPath: `/admin/${string}`;
  /** Roadmap phase that ships the module's screens (shown while they are not built). */
  availableInPhase: number;
};
