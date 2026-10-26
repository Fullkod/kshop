import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseConfig = {
  url: string;
  /** Publishable key (browser/app) or secret key (server only). */
  key: string;
};

/**
 * Auth client for the web and the mobile apps: sessions live in the client (token based, no cookies),
 * and every API call sends the access token as a Bearer header.
 */
export function createAuthClient(
  config: SupabaseConfig,
  storageKey?: string,
  /** The apps keep the session in native storage (Capacitor Preferences) and never receive it in a URL. */
  options?: { storage?: AuthStorage },
): SupabaseClient {
  return createClient(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: !options?.storage,
      // Only pass storageKey/storage when given: an explicit undefined makes supabase-js store under "undefined".
      ...(storageKey && { storageKey }),
      ...(options?.storage && { storage: options.storage }),
    },
  });
}

/** Async key-value storage for the auth session (supabase-js SupportedStorage). */
export type AuthStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

/** Client that acts as a given user (server side: route handlers verifying a Bearer token). */
export function createUserClient(config: SupabaseConfig, accessToken: string): SupabaseClient {
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Service client (secret key). Server only: bypasses RLS. */
export function createServiceClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
