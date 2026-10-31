import type { AdminState } from "@kshop/admin";
import type { ModuleCode } from "@kshop/core";
import type { MeResponse } from "@kshop/data";
import type { PublicStore } from "@kshop/storefront";
import { isNative, preferencesStorage } from "./native";

// What the last boot with a connection confirmed, so the app can open without one (PRP pos-offline, phase 3). In native
// storage in the app: the WebView can clear its localStorage. Sign out clears it; the sales queue is not here.

/** How long the phone may sell without the server confirming the access (Roberto, P7). */
export const OFFLINE_ACCESS_MS = 7 * 24 * 60 * 60 * 1000;

type SavedAdmin = Omit<AdminState, "enabledModules"> & { enabledModules: ModuleCode[] };

export type OfflineBoot = {
  userId: string;
  email: string | null;
  stores: MeResponse["stores"];
  confirmedAt: number;
  byStore: Record<string, { admin: SavedAdmin; store: PublicStore }>;
};

const KEY = "kshop.offline.boot";
const storage = isNative
  ? preferencesStorage
  : {
      getItem: async (key: string) => window.localStorage.getItem(key),
      setItem: async (key: string, value: string) => window.localStorage.setItem(key, value),
      removeItem: async (key: string) => window.localStorage.removeItem(key),
    };

let boot: OfflineBoot | null = null;

export async function loadOfflineBoot(): Promise<void> {
  try {
    const raw = await storage.getItem(KEY);
    boot = raw ? (JSON.parse(raw) as OfflineBoot) : null;
  } catch {
    boot = null;
  }
}

function persist() {
  void Promise.resolve(storage.setItem(KEY, JSON.stringify(boot))).catch(() => {
    // Without room for it the app simply needs a connection to open.
  });
}

export const offlineBoot = () => boot;

/** The access is only as old as the last time the server confirmed it. */
export const offlineAccessExpired = (at = Date.now()) => !boot || at - boot.confirmedAt > OFFLINE_ACCESS_MS;

export function confirmOnlineStores(userId: string, email: string | null, stores: MeResponse["stores"]) {
  const byStore = boot?.userId === userId ? boot.byStore : {};
  boot = { userId, email, stores, confirmedAt: Date.now(), byStore };
  persist();
}

export function saveOfflineStore(storeId: string, admin: AdminState, store: PublicStore) {
  if (!boot) return;
  boot = {
    ...boot,
    byStore: {
      ...boot.byStore,
      [storeId]: { admin: { ...admin, enabledModules: [...admin.enabledModules] }, store },
    },
  };
  persist();
}

export function readOfflineStore(storeId: string): { admin: AdminState; store: PublicStore } | null {
  const saved = boot?.byStore[storeId];
  if (!saved) return null;
  return {
    admin: { ...saved.admin, enabledModules: new Set(saved.admin.enabledModules) },
    store: saved.store,
  };
}

export function clearOfflineBoot() {
  boot = null;
  void Promise.resolve(storage.removeItem(KEY)).catch(() => {});
}
