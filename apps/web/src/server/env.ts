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
  /** Resend (fullkod.com, quota shared with every Fullkod project). Without a key no email is sent. */
  resend: z.object({ apiKey: z.string().min(1), from: z.string().min(1) }).optional(),
  /** Vercel Domains API for custom domains (phase 6.4). Without a token the domains run in dry_run. */
  vercel: z
    .object({ token: z.string().min(1), projectId: z.string().min(1), teamId: z.string().optional() })
    .optional(),
});

export const serverEnv = serverEnvSchema.parse({
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  canonicalPlatformDomain: process.env.PLATFORM_CANONICAL_DOMAIN ?? "kshop.fullkod.com",
  elToqueToken: process.env.ELTOQUE_API_TOKEN || undefined,
  resend: process.env.RESEND_API_KEY
    ? { apiKey: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM || "Kshop <noreply@fullkod.com>" }
    : undefined,
  vercel: process.env.VERCEL_DOMAINS_TOKEN
    ? {
        token: process.env.VERCEL_DOMAINS_TOKEN,
        projectId: process.env.VERCEL_DOMAINS_PROJECT_ID,
        teamId: process.env.VERCEL_DOMAINS_TEAM_ID || undefined,
      }
    : undefined,
});

export const serviceSupabaseConfig = { url: publicEnv.supabaseUrl, key: serverEnv.supabaseSecretKey };
