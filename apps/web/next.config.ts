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

// scripts/db-env.mjs (R11) points dev at the local Supabase: never mix its URL with the online keys or vice versa.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (
  process.env.KSHOP_DB_TARGET === "local" &&
  !["http://127.0.0.1:", "http://localhost:"].some((prefix) => supabaseUrl.startsWith(prefix))
) {
  throw new Error(
    "KSHOP_DB_TARGET=local but NEXT_PUBLIC_SUPABASE_URL is not the local Supabase (use scripts/db-env.mjs)",
  );
}

const nextConfig: NextConfig = {
  transpilePackages: ["@kshop/admin", "@kshop/core", "@kshop/data", "@kshop/ui", "@kshop/storefront"],
  // Decision D1 (phase 2): `use cache` + cacheTag per store; static shells streamed with Partial Prerendering.
  cacheComponents: true,
  // Build-time prerendering queries pg_graphql as anon: the default concurrency (8 pages per worker, one worker per
  // CPU) saturates the small Supabase instance and pages time out (57014; the Vercel build of 2026-10-27 failed on
  // /s/demo even with the anon limit at 8 s). One worker with 2 pages at a time keeps
  // the load the same whatever the number of CPUs of the builder (`staticGenerationMinPagesPerWorker` alone still
  // started 7 workers).
  experimental: {
    cpus: 1,
    staticGenerationMaxConcurrency: 2,
    staticGenerationMinPagesPerWorker: 1000,
    staticGenerationRetryCount: 3,
  },
  // Inline the public configuration in the browser bundle.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    NEXT_PUBLIC_PLATFORM_DOMAIN: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "",
  },
  // Store subdomains (tienda-a.kshop.localhost) and test custom domains (mitienda.localhost) in local dev.
  allowedDevOrigins: ["*.kshop.localhost", "kshop.localhost"],
  turbopack: { root: repoRoot },
};

export default nextConfig;
