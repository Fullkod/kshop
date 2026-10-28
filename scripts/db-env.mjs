// Runs a command against the local Supabase (Docker) or the online project (R11 phase 0b).
//
//   node scripts/db-env.mjs <command...>
//
// Target: KSHOP_DB_TARGET from the environment, else from .env.local, else "local". With "local" the command gets the
// URL and keys of `supabase start` (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY)
// plus KSHOP_DB_TARGET=local and KSHOP_LOCAL_DB_URL; every script and next.config.ts let real environment variables win
// over .env.local, so nothing else changes. With "remote" the command runs untouched (the online project).
// Development, e2e, qa, seeds and RLS tests go local by default; db:migrate, db:auth-config and klaushop:* are always
// remote (they do not go through this wrapper). See docs/LOCAL_DB.md.

import { spawn, spawnSync } from "node:child_process";
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

export function dbTarget() {
  const target = process.env.KSHOP_DB_TARGET ?? fileEnv().KSHOP_DB_TARGET ?? "local";
  if (target !== "local" && target !== "remote")
    throw new Error(`KSHOP_DB_TARGET must be local or remote, not ${target}`);
  return target;
}

/** URL and keys of the running local stack (`supabase status`). Throws with a hint when it is not running. */
export function localSupabaseEnv() {
  const bin = join(root, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
  const res = spawnSync(`"${bin}" status -o json`, { cwd: root, encoding: "utf8", shell: true });
  const json = res.stdout?.slice(res.stdout.indexOf("{"), res.stdout.lastIndexOf("}") + 1);
  let status;
  try {
    status = JSON.parse(json);
  } catch {
    throw new Error(
      "The local Supabase is not running. Start it with `pnpm db:local:start` (Docker Desktop must be open), " +
        "or run against the online project with KSHOP_DB_TARGET=remote.",
    );
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
    KSHOP_LOCAL_DB_URL: status.DB_URL,
    KSHOP_DB_TARGET: "local",
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const command = process.argv.slice(2);
  if (command.length === 0) {
    console.error("Usage: node scripts/db-env.mjs <command...>");
    process.exit(1);
  }
  let extra;
  try {
    extra = dbTarget() === "local" ? localSupabaseEnv() : { KSHOP_DB_TARGET: "remote" };
  } catch (error) {
    console.error(`db-env: ${error.message}`);
    process.exit(1);
  }
  console.error(
    `db-env: ${extra.KSHOP_DB_TARGET} database${extra.NEXT_PUBLIC_SUPABASE_URL ? ` (${extra.NEXT_PUBLIC_SUPABASE_URL})` : ""}`,
  );
  const child = spawn(command.join(" "), {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...extra },
  });
  child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
}
