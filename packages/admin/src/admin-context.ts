"use client";

import { isModuleCode, type ModuleCode, type StoreRole } from "@kshop/core";
import { StoreEntitlementsQuery, type ApiClient } from "@kshop/data";
import type { Client } from "@urql/core";
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
};

export const AdminContext = createContext<AdminState | null>(null);

export function useAdmin(): AdminState {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside the store admin");
  return value;
}

/** Role, modules, limits and subscription of the signed-in user in a store; null when they have no access. */
export async function loadAdminState(
  api: ApiClient,
  graphql: Client,
  storeId: string,
): Promise<AdminState | null> {
  const me = await api.me();
  const membership = me.stores.find((s) => s.id === storeId);
  if (!membership && !me.isSuperadmin) return null;
  // Entitlements are read through pg_graphql; RLS returns them only to the store's staff.
  const result = await graphql.query(StoreEntitlementsQuery, { storeId }).toPromise();
  if (result.error) throw result.error;
  const codes = (result.data?.storeEntitlements?.edges ?? [])
    .map((e) => e.node.moduleCode)
    .filter(isModuleCode);
  // The look is set up by the platform: the superadmin always has «Apariencia» (phase 5, Roberto).
  if (me.isSuperadmin && !codes.includes("themes")) codes.push("themes");
  const limits = JSON.parse(result.data?.storeLimits ?? "{}") as Record<string, number>;
  const subscription = result.data?.subscriptionsCollection?.edges[0]?.node ?? null;
  const addonPrices: AdminState["addonPrices"] = {};
  for (const { node } of result.data?.modulesCollection?.edges ?? []) {
    if (isModuleCode(node.code) && node.addonPrice != null) addonPrices[node.code] = Number(node.addonPrice);
  }
  return {
    role: membership?.role ?? null,
    enabledModules: new Set<ModuleCode>(codes),
    limits,
    isSuperadmin: me.isSuperadmin,
    subscription: subscription && {
      status: subscription.status,
      trialEndsAt: subscription.trialEndsAt ?? null,
    },
    storeStatus: result.data?.storesCollection?.edges[0]?.node.status ?? "active",
    addonPrices,
    stores: me.stores.map(({ id, slug, name }) => ({ id, slug, name })),
  };
}
