"use client";

import { isModuleCode, type ModuleCode, type StoreRole } from "@kshop/core";
import type { ApiClient } from "@kshop/data";
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
  /** Stores of the user (the store switcher lists them when there are several). */
  stores: { id: string; slug: string; name: string }[];
  /** Orders waiting for confirmation when the admin booted (the bell starts from it). */
  toConfirm: number;
};

export const AdminContext = createContext<AdminState | null>(null);

export function useAdmin(): AdminState {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside the store admin");
  return value;
}

/**
 * Role, modules, limits and subscription of the signed-in user in a store; null when they have no access. One call
 * (/api/v1/me?storeId=, admin_bootstrap over PostgREST): the boot no longer waits for /me and then a pg_graphql query
 * on a possibly cold connection (R11).
 */
export async function loadAdminState(api: ApiClient, storeId: string): Promise<AdminState | null> {
  const me = await api.me(storeId);
  const membership = me.stores.find((s) => s.id === storeId);
  const boot = me.admin;
  if ((!membership && !me.isSuperadmin) || !boot) return null;
  const codes = boot.modules.map((m) => m.code).filter(isModuleCode);
  // The look is set up by the platform: the superadmin always has «Apariencia» (phase 5, Roberto).
  if (me.isSuperadmin && !codes.includes("themes")) codes.push("themes");
  const addonPrices: AdminState["addonPrices"] = {};
  for (const [code, price] of Object.entries(boot.addonPrices)) {
    if (isModuleCode(code)) addonPrices[code] = Number(price);
  }
  return {
    role: membership?.role ?? null,
    enabledModules: new Set<ModuleCode>(codes),
    limits: boot.limits,
    isSuperadmin: me.isSuperadmin,
    subscription: boot.subscription,
    storeStatus: boot.storeStatus ?? "active",
    addonPrices,
    stores: me.stores.map(({ id, slug, name }) => ({ id, slug, name })),
    toConfirm: boot.toConfirm,
  };
}
