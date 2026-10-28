// Runs a command against the test Supabase project ("KShop Test") or production (R11).
//
//   node scripts/db-env.mjs [--target=test|prod] <command...>
//
// Target: KSHOP_DB_TARGET from the environment, else from .env.local, else "test" when SUPABASE_TEST_PROJECT_REF is set.
// With "test" the command gets the test project's ref, URL and keys (SUPABASE_PROJECT_REF, NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY), read from the Management API; every script and
// next.config.ts let real environment variables win over .env.local, so nothing else changes. With "prod" the command
// runs untouched. The test project has no OpenWA key, so it never sends a real WhatsApp. See docs/TEST_DB.md.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fileEnv() {
  const env = {};
  const path = join(root, ".env.local");
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

const file = fileEnv();
const args = process.argv.slice(2);
const forced = args[0]?.startsWith("--target=") ? args.shift().slice("--target=".length) : undefined;
const target =
  forced ??
  process.env.KSHOP_DB_TARGET ??
  file.KSHOP_DB_TARGET ??
  (file.SUPABASE_TEST_PROJECT_REF ? "test" : "prod");

async function testEnv() {
  const ref = file.SUPABASE_TEST_PROJECT_REF;
  if (!ref) throw new Error("set SUPABASE_TEST_PROJECT_REF in .env.local, or use KSHOP_DB_TARGET=prod");
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN ?? file.SUPABASE_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`api-keys of ${ref} -> ${res.status}: ${await res.text()}`);
  const keys = await res.json();
  const key = (type) => keys.find((k) => k.type === type)?.api_key;
  if (!key("publishable") || !key("secret"))
    throw new Error(`the test project ${ref} has no publishable/secret key`);
  return {
    KSHOP_DB_TARGET: "test",
    SUPABASE_PROJECT_REF: ref,
    NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key("publishable"),
    SUPABASE_SECRET_KEY: key("secret"),
  };
}

const command = args;
if (command.length === 0) {
  console.error("Usage: node scripts/db-env.mjs <command...>");
  process.exit(1);
}
if (target !== "test" && target !== "prod") {
  console.error(`db-env: KSHOP_DB_TARGET must be test or prod, not ${target}`);
  process.exit(1);
}
let extra;
try {
  extra = target === "test" ? await testEnv() : { KSHOP_DB_TARGET: "prod" };
} catch (error) {
  console.error(`db-env: ${error.message}`);
  process.exit(1);
}
console.error(
  `db-env: ${target} database${extra.SUPABASE_PROJECT_REF ? ` (${extra.SUPABASE_PROJECT_REF})` : ""}`,
);
const child = spawn(command.join(" "), { stdio: "inherit", shell: true, env: { ...process.env, ...extra } });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
