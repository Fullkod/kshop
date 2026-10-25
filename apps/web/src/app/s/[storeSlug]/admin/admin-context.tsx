"use client";

import type { ModuleCode, StoreRole } from "@kshop/core";
import { createContext, useContext } from "react";

export type AdminState = {
  /** null for the superadmin acting on a store they are not a member of. */
  role: StoreRole | null;
  enabledModules: ReadonlySet<ModuleCode>;
  limits: Record<string, number>;
};

export const AdminContext = createContext<AdminState | null>(null);

export function useAdmin(): AdminState {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside the store admin");
  return value;
}
