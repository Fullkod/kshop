"use client";

import {
  isModuleCode,
  sectionVisibility,
  type ModuleCode,
  type SectionSettings,
  type SectionVisibility,
  type StoreRole,
} from "@kshop/core";
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
  /** R12: admin menu sections the superadmin set to managed or hidden (no entry = visible). */
  sections: SectionSettings;
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
    sections: boot.sections ?? {},
  };
}

/**
 * How the menu shows a module to this user (R12). The staff does not see hidden sections and sees managed ones as
 * read-only; without the module in its plan, «Apariencia» counts as managed, since the platform sets it up (D6). The
 * superadmin sees everything; `setting` keeps the store's choice for its markers.
 */
export function menuSection(
  admin: AdminState,
  code: ModuleCode,
): { visibility: SectionVisibility; setting: SectionVisibility } {
  const setting = sectionVisibility(admin.sections, code);
  if (admin.isSuperadmin) return { visibility: "visible", setting };
  if (code === "themes" && !admin.enabledModules.has("themes") && setting === "visible") {
    return { visibility: "managed", setting };
  }
  return { visibility: setting, setting };
}

// The last boot of each user and store, so a page load draws the admin at once while /me runs behind it (R11). Only
// what the menu and banners need; every write is still checked by the API, so a stale copy grants nothing. A day at
// most; removed on sign out and when the store says «no access».
const CACHE_PREFIX = "kshop.admin.";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
type CachedAdminState = Omit<AdminState, "enabledModules"> & {
  enabledModules: ModuleCode[];
  savedAt: number;
};

export function readCachedAdminState(userId: string, storeId: string): AdminState | null {
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${userId}.${storeId}`);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedAdminState;
    if (Date.now() - cached.savedAt > CACHE_MAX_AGE_MS) return null;
    const { savedAt: _savedAt, ...state } = cached;
    return {
      ...state,
      enabledModules: new Set(state.enabledModules.filter(isModuleCode)),
      sections: state.sections ?? {},
    };
  } catch {
    return null;
  }
}

export function saveCachedAdminState(userId: string, storeId: string, state: AdminState | null): void {
  try {
    const key = `${CACHE_PREFIX}${userId}.${storeId}`;
    if (!state) return window.localStorage.removeItem(key);
    const cached: CachedAdminState = {
      ...state,
      enabledModules: [...state.enabledModules],
      savedAt: Date.now(),
    };
    window.localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // Private mode or full storage: the admin boots from /me as before.
  }
}

export function clearCachedAdminStates(): void {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(CACHE_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Nothing stored.
  }
}
