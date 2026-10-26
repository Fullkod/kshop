import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// One build per store (PRP-7 D4): KSHOP_STORE picks stores/{slug}.json (written by `pnpm app:config <slug>`).
// The Supabase URL and publishable key come from the root .env.local (or the CI environment); both are public.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
for (const file of [".env.local", ".env"]) {
  const path = resolve(repoRoot, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match?.[1]) process.env[match[1]] ??= match[2]?.trim();
  }
}

export default defineConfig(({ command }) => {
  const slug = process.env.KSHOP_STORE ?? "demo";
  const configPath = resolve(here, "stores", `${slug}.json`);
  if (!existsSync(configPath)) throw new Error(`No app config for "${slug}": run pnpm app:config ${slug}`);
  const store = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  const env = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    // Local dev talks to `pnpm dev`; the APK to production (or KSHOP_API_URL).
    apiBaseUrl:
      process.env.KSHOP_API_URL ??
      (command === "serve" ? "http://localhost:3000" : "https://kshop.fullkod.com"),
  };
  if (!env.supabaseUrl || !env.supabaseKey)
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY missing");
  return {
    plugins: [react(), tailwindcss()],
    define: { __KSHOP_APP__: JSON.stringify({ ...store, ...env }) },
    server: { port: 5173, strictPort: true },
    build: { outDir: "dist", sourcemap: false },
  };
});
