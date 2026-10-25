"use client";

import { createApiClient, createAuthClient, createGraphqlClient, type ApiClient } from "@kshop/data";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "@urql/core";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabaseConfig } from "@/env";

type SessionContextValue = {
  supabase: SupabaseClient;
  session: Session | null;
  /** False until the stored session (or the one in an access link) has been read. */
  ready: boolean;
  api: ApiClient;
  graphql: Client;
};

const SessionContext = createContext<SessionContextValue | null>(null);

let browserClient: SupabaseClient | undefined;

// Sessions are stored per origin (localStorage), so each store subdomain has its own session.
function getBrowserClient(): SupabaseClient {
  browserClient ??= createAuthClient(supabaseConfig);
  return browserClient;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const supabase = getBrowserClient();
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

  const value = useMemo<SessionContextValue>(() => {
    const getAccessToken = async () => (await supabase.auth.getSession()).data.session?.access_token;
    return {
      supabase,
      session,
      ready,
      api: createApiClient({ baseUrl: "", getAccessToken }),
      graphql: createGraphqlClient({ ...supabaseConfig, getAccessToken, noCache: true }),
    };
  }, [supabase, session, ready]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}
