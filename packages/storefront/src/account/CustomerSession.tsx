"use client";

import {
  createApiClient,
  createAuthClient,
  type ApiClient,
  type CustomerAuthResponse,
  type CustomerProfile,
} from "@kshop/data";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore, useStorefrontConfig, type StorefrontConfig } from "../store-context";

// D6: the customer session has its own storage key, so signing in as a customer never signs the staff out of
// the admin on the same subdomain (and the other way around). Pages stay cacheable: nothing here reads cookies.

const CUSTOMER_STORAGE_KEY = "kshop-customer";

type CustomerSessionValue = {
  /** False until the stored session has been read. */
  ready: boolean;
  session: Session | null;
  customer: CustomerProfile | null;
  /** API client that sends the customer token (or nothing for guests). */
  api: ApiClient;
  signIn: (result: CustomerAuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
  setCustomer: (customer: CustomerProfile) => void;
};

const CustomerSessionContext = createContext<CustomerSessionValue | null>(null);

let customerClient: SupabaseClient | undefined;
function getCustomerClient(config: StorefrontConfig): SupabaseClient {
  customerClient ??= createAuthClient(config.supabase, CUSTOMER_STORAGE_KEY, { storage: config.authStorage });
  return customerClient;
}

/** A session is only valid for the store it was created in (the token carries app_metadata.store_id). */
const belongsTo = (session: Session | null, storeId: string) =>
  session?.user.app_metadata?.kind === "customer" && session.user.app_metadata?.store_id === storeId;

export function CustomerSessionProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const config = useStorefrontConfig();
  const supabase = getCustomerClient(config);
  const [session, setSession] = useState<Session | null>(null);
  // Profile tagged with its user, so a profile from a previous session is never shown.
  const [profile, setProfile] = useState<{ userId: string; customer: CustomerProfile } | null>(null);
  const [ready, setReady] = useState(false);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: config.apiBaseUrl,
        headers: config.channel === "app" ? { "X-Kshop-Channel": "app" } : undefined,
        getAccessToken: async () => {
          const current = (await supabase.auth.getSession()).data.session;
          return belongsTo(current, store.id) ? current?.access_token : null;
        },
      }),
    [supabase, store.id, config],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(belongsTo(data.session, store.id) ? data.session : null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(belongsTo(next, store.id) ? next : null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase, store.id]);

  // Load the profile once per signed-in user; a rejected token (blocked, deleted) signs out.
  const userId = session?.user.id;
  const customer = userId && profile?.userId === userId ? profile.customer : null;
  const loaded = !!customer;
  useEffect(() => {
    if (!userId || loaded) return;
    let cancelled = false;
    api
      .customer(store.id)
      .me()
      .then((r) => {
        if (!cancelled) setProfile({ userId, customer: r.customer });
      })
      .catch(async () => {
        if (!cancelled) await supabase.auth.signOut({ scope: "local" });
      });
    return () => {
      cancelled = true;
    };
  }, [api, store.id, supabase, userId, loaded]);

  const signIn = useCallback(
    async (result: CustomerAuthResponse) => {
      const { error } = await supabase.auth.setSession({
        access_token: result.session.accessToken,
        refresh_token: result.session.refreshToken,
      });
      if (error) throw error;
      const { data } = await supabase.auth.getUser();
      if (data.user) setProfile({ userId: data.user.id, customer: result.customer });
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: "local" });
    setProfile(null);
  }, [supabase]);

  const setCustomer = useCallback(
    (next: CustomerProfile) => setProfile((current) => (current ? { ...current, customer: next } : current)),
    [],
  );

  const value = useMemo<CustomerSessionValue>(
    () => ({ ready, session, customer, api, signIn, signOut, setCustomer }),
    [ready, session, customer, api, signIn, signOut, setCustomer],
  );
  return <CustomerSessionContext.Provider value={value}>{children}</CustomerSessionContext.Provider>;
}

export function useCustomerSession(): CustomerSessionValue {
  const value = useContext(CustomerSessionContext);
  if (!value) throw new Error("useCustomerSession must be used inside <CustomerSessionProvider>");
  return value;
}

/** A guest that never signs in, for previews outside the store (its API client is never called). */
export function PreviewCustomerSessionProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  const value: CustomerSessionValue = {
    ready: true,
    session: null,
    customer: null,
    api,
    signIn: async () => {},
    signOut: async () => {},
    setCustomer: () => {},
  };
  return <CustomerSessionContext.Provider value={value}>{children}</CustomerSessionContext.Provider>;
}
