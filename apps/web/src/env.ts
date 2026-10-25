import { z } from "zod";

// Public configuration (inlined in the browser bundle). Secrets live in src/server/env.ts.
const publicEnvSchema = z.object({
  supabaseUrl: z.url(),
  supabasePublishableKey: z.string().min(1),
  /** Platform host, including the port in local dev: "kshop.localhost:3000" or "kshop.fullkod.com". */
  platformDomain: z.string().min(1),
});

export const publicEnv = publicEnvSchema.parse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  platformDomain: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN,
});

export const platformProtocol: "http" | "https" = publicEnv.platformDomain.includes("localhost")
  ? "http"
  : "https";

export const supabaseConfig = { url: publicEnv.supabaseUrl, key: publicEnv.supabasePublishableKey };
