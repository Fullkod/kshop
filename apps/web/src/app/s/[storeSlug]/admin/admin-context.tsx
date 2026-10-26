"use client";

import type { ModuleCode, StoreRole } from "@kshop/core";
import { createContext, useContext } from "react";

export type AdminState = {
  /** null for the superadmin acting on a store they are not a member of. */
  role: StoreRole | null;
  enabledModules: ReadonlySet<ModuleCode>;
  limits: Record<string, number>;
  isSuperadmin: boolean;
  /** Subscription state for the banners (staff see it too, without amounts). */
  subscription: { status: string; trialEndsAt: string | null } | null;
  storeStatus: string;
  /** USD/month of the modules sold alone (locked menu items show it). */
  addonPrices: Partial<Record<ModuleCode, number>>;
};

export const AdminContext = createContext<AdminState | null>(null);

export function useAdmin(): AdminState {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside the store admin");
  return value;
}
