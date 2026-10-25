// End-to-end helpers for Phase 0b against the running app (pnpm dev) and the online Supabase project.
//
//   node scripts/e2e.mjs setup     create the e2e superadmin; generated passwords go to .env.local (E2E_*)
//   node scripts/e2e.mjs api       API checks (needs stores tienda-a / tienda-b created by the UI flow)
//   node scripts/e2e.mjs cleanup   delete the e2e stores and every *@e2e.kshop.test account
//
// Test accounts use the reserved .test TLD; nothing is sent to real inboxes.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

function loadEnv() {
  const env = { ...process.env };
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !env[match[1]]) env[match[1]] = match[2].trim();
    }
  }
  return env;
}

let env = loadEnv();
const APP = env.E2E_APP_URL ?? "http://localhost:3000";
const DOMAIN = "e2e.kshop.test";
const SLUGS = ["tienda-a", "tienda-b"];
export const E2E = {
  superadmin: `superadmin@${DOMAIN}`,
  ownerA: `owner-a@${DOMAIN}`,
  ownerB: `owner-b@${DOMAIN}`,
};

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function e2eUsers() {
  const { data, error } = await service.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.filter((u) => u.email?.endsWith(`@${DOMAIN}`));
}

async function setup() {
  const additions = [];
  if (!env.E2E_SUPERADMIN_PASSWORD)
    additions.push(`E2E_SUPERADMIN_PASSWORD=${randomBytes(12).toString("base64url")}`);
  if (!env.E2E_OWNER_PASSWORD) additions.push(`E2E_OWNER_PASSWORD=${randomBytes(12).toString("base64url")}`);
  if (additions.length) {
    appendFileSync(envPath, `\n# E2E test accounts (Phase 0b; @${DOMAIN})\n${additions.join("\n")}\n`);
    env = loadEnv();
  }

  const existing = (await e2eUsers()).find((u) => u.email === E2E.superadmin);
  const attrs = {
    password: env.E2E_SUPERADMIN_PASSWORD,
    email_confirm: true,
    app_metadata: { role: "superadmin" },
  };
  const { error } = existing
    ? await service.auth.admin.updateUserById(existing.id, attrs)
    : await service.auth.admin.createUser({ email: E2E.superadmin, ...attrs });
  if (error) throw error;
  console.log(`e2e superadmin ready: ${E2E.superadmin} (password in .env.local as E2E_SUPERADMIN_PASSWORD)`);
}

async function tokenFor(email, password) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return data.session.access_token;
}

async function call(method, path, token, body) {
  const res = await fetch(`${APP}/api/v1${path}`, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function api() {
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok });
    console.log(
      `${ok ? "ok" : "not ok"} - ${name}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`,
    );
  };

  const { data: stores, error } = await service.from("stores").select("id, slug").in("slug", SLUGS);
  if (error) throw error;
  const storeA = stores.find((s) => s.slug === "tienda-a");
  const storeB = stores.find((s) => s.slug === "tienda-b");
  if (!storeA || !storeB) throw new Error("Create tienda-a and tienda-b first (superadmin UI flow).");

  const superToken = await tokenFor(E2E.superadmin, env.E2E_SUPERADMIN_PASSWORD);
  const ownerAToken = await tokenFor(E2E.ownerA, env.E2E_OWNER_PASSWORD);

  let r = await call("GET", "/me");
  check("no token -> 401", r.status === 401, r);
  r = await call("GET", "/me", "not-a-token");
  check("invalid token -> 401", r.status === 401, r);

  r = await call("GET", "/me", ownerAToken);
  check(
    "owner A /me lists only store A as owner",
    r.status === 200 &&
      r.body.stores.length === 1 &&
      r.body.stores[0].slug === "tienda-a" &&
      r.body.stores[0].role === "owner" &&
      !r.body.isSuperadmin,
    r,
  );
  r = await call("GET", `/stores/${storeA.id}/entitlements`, ownerAToken);
  check(
    "owner A entitlements of A -> 200 with 8 modules",
    r.status === 200 && r.body.modules.length === 8 && r.body.limits.max_staff === 2,
    r,
  );
  r = await call("GET", `/stores/${storeB.id}/entitlements`, ownerAToken);
  check("owner A entitlements of B -> 403", r.status === 403, r);
  r = await call("GET", "/platform/stores", ownerAToken);
  check("owner A platform list -> 403", r.status === 403, r);
  r = await call("PATCH", `/platform/stores/${storeB.id}`, ownerAToken, { status: "suspended" });
  check("owner A cannot suspend B -> 403", r.status === 403, r);
  r = await call("GET", "/stores/not-a-uuid/entitlements", ownerAToken);
  check("invalid store id -> 400", r.status === 400, r);

  r = await call("GET", "/platform/stores", superToken);
  check(
    "superadmin platform list -> 200 with A and B",
    r.status === 200 && SLUGS.every((s) => r.body.stores.some((x) => x.slug === s)),
    r.status,
  );
  r = await call("GET", `/stores/${storeB.id}/entitlements`, superToken);
  check("superadmin entitlements of B -> 200", r.status === 200, r);

  const base = { name: "Duplicada", ownerEmail: `dup@${DOMAIN}`, orderPrefix: "DU" };
  r = await call("POST", "/platform/stores", superToken, { ...base, slug: "tienda-a" });
  check("duplicated slug -> 409 with field error", r.status === 409 && !!r.body.error.fields?.slug, r);
  r = await call("POST", "/platform/stores", superToken, { ...base, slug: "www" });
  check("reserved slug -> 400 with field error", r.status === 400 && !!r.body.error.fields?.slug, r);
  r = await call("POST", "/platform/stores", superToken, {
    ...base,
    slug: "ok-slug",
    ownerEmail: "not-an-email",
  });
  check("invalid email -> 400", r.status === 400 && !!r.body.error.fields?.ownerEmail, r);
  const orphan = (await e2eUsers()).some((u) => u.email === base.ownerEmail);
  check("rejected creations leave no owner account", !orphan);

  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}

async function cleanup() {
  const { error } = await service.from("stores").delete().in("slug", SLUGS);
  if (error) throw error;
  for (const user of await e2eUsers()) {
    const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
  }
  console.log("e2e stores and accounts removed");
}

const command = process.argv[2];
try {
  if (command === "setup") await setup();
  else if (command === "api") await api();
  else if (command === "cleanup") await cleanup();
  else {
    console.error("Usage: node scripts/e2e.mjs <setup|api|cleanup>");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
