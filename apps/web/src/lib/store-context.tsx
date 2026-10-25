"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PublicStore } from "@/server/stores";

const StoreContext = createContext<PublicStore | null>(null);

/** Store resolved from the host, available to client components under /s/[storeSlug]. */
export function StoreProvider({ store, children }: { store: PublicStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): PublicStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}
