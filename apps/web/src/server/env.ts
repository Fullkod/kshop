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
});

export const serverEnv = serverEnvSchema.parse({
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  canonicalPlatformDomain: process.env.PLATFORM_CANONICAL_DOMAIN ?? "kshop.fullkod.com",
});

export const serviceSupabaseConfig = { url: publicEnv.supabaseUrl, key: serverEnv.supabaseSecretKey };
