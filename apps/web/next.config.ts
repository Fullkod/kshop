import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Single .env.local at the repo root (shared with the agent tooling and scripts). Next only reads env files
// from apps/web, so load the root file here; real environment variables (Vercel) always win.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
for (const file of [".env.local", ".env"]) {
  const path = resolve(repoRoot, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match?.[1]) process.env[match[1]] ??= match[2]?.trim();
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ["@kshop/core", "@kshop/data", "@kshop/ui"],
  // Decision D1 (phase 2): `use cache` + cacheTag per store; static shells streamed with Partial Prerendering.
  cacheComponents: true,
  // Build-time prerendering queries pg_graphql as anon (statement_timeout 3s): the default concurrency (8 pages
  // per worker, one worker per CPU) saturates the small Supabase instance on Vercel and pages time out.
  experimental: { staticGenerationMaxConcurrency: 2, staticGenerationRetryCount: 3 },
  // Inline the public configuration in the browser bundle.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    NEXT_PUBLIC_PLATFORM_DOMAIN: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "",
  },
  // Store subdomains in local dev (tienda-a.kshop.localhost) load dev assets from the platform origin.
  allowedDevOrigins: ["*.kshop.localhost", "kshop.localhost"],
  turbopack: { root: repoRoot },
};

export default nextConfig;
