import "server-only";
import { createServiceClient, createUserClient } from "@kshop/data";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/env";
import { serviceSupabaseConfig } from "./env";

let serviceClient: SupabaseClient | undefined;

/** Secret-key client. Bypasses RLS: only after an explicit permission check (requireSuperadmin / requireStoreRole). */
export function getServiceClient(): SupabaseClient {
  serviceClient ??= createServiceClient(serviceSupabaseConfig);
  return serviceClient;
}

/** Client acting as the caller, so RLS applies (defense in depth for reads). */
export function getUserClient(accessToken: string): SupabaseClient {
  return createUserClient(supabaseConfig, accessToken);
}
