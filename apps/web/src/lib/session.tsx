"use client";

import { SessionProvider as AdminSessionProvider, type AdminConfig } from "@kshop/admin";
import type { ReactNode } from "react";
import { platformProtocol, publicEnv, supabaseConfig } from "@/env";

export { useSession } from "@kshop/admin";

const config: AdminConfig = {
  supabase: supabaseConfig,
  apiBaseUrl: "",
  platformDomain: publicEnv.platformDomain,
  protocol: platformProtocol,
};

/** The staff session (store admin and superadmin) with the web's env. */
export function SessionProvider({ children }: { children: ReactNode }) {
  return <AdminSessionProvider config={config}>{children}</AdminSessionProvider>;
}
