import "server-only";
import { z } from "zod";
import { publicEnv } from "@/env";

const serverEnvSchema = z.object({
  supabaseSecretKey: z.string().min(1),
  /**
   * Canonical platform domain stored in store_domains (the database is shared by every environment),
   * e.g. "kshop.fullkod.com". Local dev hosts are resolved from the subdomain, not from this value.
   */
  canonicalPlatformDomain: z.string().min(1),
  /** elTOQUE API token (informal market rates, shown as a suggestion). Without it no suggestion is shown. */
  elToqueToken: z.string().min(1).optional(),
});

export const serverEnv = serverEnvSchema.parse({
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  canonicalPlatformDomain: process.env.PLATFORM_CANONICAL_DOMAIN ?? "kshop.fullkod.com",
  elToqueToken: process.env.ELTOQUE_API_TOKEN || undefined,
});

export const serviceSupabaseConfig = { url: publicEnv.supabaseUrl, key: serverEnv.supabaseSecretKey };
