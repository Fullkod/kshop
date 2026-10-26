// Writes apps/store-app/stores/{slug}.json, the build config of a store app (PRP-7 D4): store id, name, appId,
// version and the theme colors for the splash. Reads only public data with the publishable key, so it also runs in
// GitHub Actions without any secret of the platform.
//
//   node scripts/app-config.mjs <slug> [--version-code 12] [--version-name 1.2.0]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const line of existsSync(join(root, ".env.local"))
  ? readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
  : []) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !env[match[1]]) env[match[1]] = match[2].trim();
}

const [slug, ...rest] = process.argv.slice(2);
if (!slug) {
  console.error("Usage: node scripts/app-config.mjs <slug> [--version-code n] [--version-name x.y.z]");
  process.exit(1);
}
const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
const versionNameArg = option("--version-name");
const versionCodeArg = option("--version-code");

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const res = await fetch(
  `${url}/rest/v1/stores?slug=eq.${encodeURIComponent(slug)}&select=id,slug,name,theme,logo_url`,
  { headers },
);
const [store] = await res.json();
if (!store) throw new Error(`Store "${slug}" not found`);

const info = await (
  await fetch(`${url}/rest/v1/rpc/app_info`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_store_id: store.id }),
  })
).json();
const latest = info?.latest ?? null;
// GitHub Actions passes its run number: always growing and never repeated, also with unpublished builds.
const versionCode = versionCodeArg ? Number(versionCodeArg) : (latest?.version_code ?? 0) + 1;
if (!Number.isInteger(versionCode) || versionCode < 1)
  throw new Error(`Invalid version code "${versionCodeArg}"`);

const config = {
  storeId: store.id,
  slug: store.slug,
  name: store.name,
  // Android package segments cannot have "-".
  appId: `com.fullkod.kshop.${store.slug.replace(/-/g, "_")}`,
  versionCode,
  versionName: versionNameArg ?? `1.0.${versionCode}`,
  logoUrl: store.logo_url ?? null,
  theme: {
    colors: {
      background: store.theme?.colors?.background ?? "#ffffff",
      accent: store.theme?.colors?.accent ?? "#5b21b6",
    },
  },
};
mkdirSync(join(root, "apps/store-app/stores"), { recursive: true });
writeFileSync(join(root, `apps/store-app/stores/${slug}.json`), `${JSON.stringify(config, null, 2)}\n`);
console.log(
  `apps/store-app/stores/${slug}.json → ${config.appId} ${config.versionName} (${config.versionCode})`,
);
