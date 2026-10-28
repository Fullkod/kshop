"use client";

import {
  createApiClient,
  createAuthClient,
  createGraphqlClient,
  type ApiClient,
  type AuthStorage,
  type SupabaseConfig,
} from "@kshop/data";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "@urql/core";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Where the staff session talks to: the web passes its env, the admin app its build config (PRP-7 D2, D6). */
export type AdminConfig = {
  supabase: SupabaseConfig;
  /** "" on the web (same origin); the platform URL in the app. */
  apiBaseUrl: string;
  /** For the public links of the stores (the order page), like storePublicOrigin on the web. */
  platformDomain: string;
  protocol: "http" | "https";
  /** Native storage in the app (Capacitor Preferences); localStorage on the web. */
  authStorage?: AuthStorage;
  /** Camera or gallery of the phone for product photos (admin app, PRP-7 D8); the web uses the file input only. */
  takePhoto?: () => Promise<File | null>;
};

type SessionContextValue = {
  supabase: SupabaseClient;
  session: Session | null;
  /** False until the stored session (or the one in an access link) has been read. */
  ready: boolean;
  api: ApiClient;
  graphql: Client;
  config: AdminConfig;
};

const SessionContext = createContext<SessionContextValue | null>(null);

let browserClient: SupabaseClient | undefined;

// Sessions are stored per origin (localStorage), so each store subdomain has its own session.
function getBrowserClient(config: AdminConfig): SupabaseClient {
  browserClient ??= createAuthClient(
    config.supabase,
    undefined,
    config.authStorage ? { storage: config.authStorage } : undefined,
  );
  return browserClient;
}

export function SessionProvider({ config, children }: { config: AdminConfig; children: ReactNode }) {
  const supabase = getBrowserClient(config);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  // The clients read the token on every request, so they only change with the user: Supabase emits a new session
  // object on every tab focus and token refresh (~1 h), and new clients there restarted every read of the page (R11).
  const userId = session?.user.id;
  const clients = useMemo(() => {
    const getAccessToken = async () => (await supabase.auth.getSession()).data.session?.access_token;
    return {
      api: createApiClient({ baseUrl: config.apiBaseUrl, getAccessToken }),
      graphql: createGraphqlClient({ ...config.supabase, getAccessToken, noCache: true, batch: true }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- userId: new clients only for another user
  }, [supabase, config, userId]);

  const value = useMemo<SessionContextValue>(
    () => ({ supabase, session, ready, ...clients, config }),
    [supabase, session, ready, clients, config],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}
