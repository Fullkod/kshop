"use client";

import type { CurrencyCode, StoreStatus, Theme } from "@kshop/core";
import { createApiClient, type ApiClient, type AuthStorage, type SupabaseConfig } from "@kshop/data";
import { createContext, useContext, useMemo, type ReactNode } from "react";

/** Public card of a store: what the storefront (web and store app) needs to render it. */
export type PublicStore = {
  id: string;
  slug: string;
  name: string;
  status: StoreStatus;
  baseCurrency: CurrencyCode;
  whatsappPhone: string | null;
  logoUrl: string | null;
  /** Short text of the footer (Appearance), or null. */
  description: string | null;
  theme: Theme;
  /** Live custom domain (verified, module on, store active) or null: the store is served on its subdomain. */
  customDomain: string | null;
};

/** Where the storefront talks to: the web uses its own origin; the store app the platform API (PRP-7 D5, D6). */
export type StorefrontConfig = {
  supabase: SupabaseConfig;
  /** "" for same-origin calls (web), "https://kshop.fullkod.com" in the app. */
  apiBaseUrl: string;
  channel: "web" | "app";
  /** Native storage for the customer session (app); the web uses localStorage. */
  authStorage?: AuthStorage;
};

const StoreContext = createContext<{ store: PublicStore; config: StorefrontConfig } | null>(null);

/** The store being shown (from the host on the web, from the build config in the app) and how to reach the API. */
export function StoreProvider({
  store,
  config,
  children,
}: {
  store: PublicStore;
  config: StorefrontConfig;
  children: ReactNode;
}) {
  return <StoreContext.Provider value={{ store, config }}>{children}</StoreContext.Provider>;
}

function useStoreContext() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside <StoreProvider>");
  return value;
}

export const useStore = (): PublicStore => useStoreContext().store;
export const useStorefrontConfig = (): StorefrontConfig => useStoreContext().config;

/** API client without a token (login, register, public order page). */
export function usePublicApi(): ApiClient {
  const { apiBaseUrl, channel } = useStorefrontConfig();
  return useMemo(
    () =>
      createApiClient({
        baseUrl: apiBaseUrl,
        headers: channel === "app" ? { "X-Kshop-Channel": "app" } : undefined,
        getAccessToken: () => null,
      }),
    [apiBaseUrl, channel],
  );
}
