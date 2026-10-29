// R12: visibility of the admin menu sections against the running app (pnpm dev). Creates a temporary Pro store
// sect-e2e-a with an @e2e.kshop.test owner and a temporary superadmin, and removes everything at the end (also on
// failure). Writes in a managed or hidden section answer 403 to the staff and pass for the superadmin; other sections
// are untouched. Bodies are empty on purpose: the guard answers before validation (400 = it let the write through).
//
//   pnpm e2e:sections

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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

const APP = env.E2E_APP_URL ?? "http://localhost:3000";
const PASSWORD = randomBytes(12).toString("base64url");
const USERS = { owner: "sect-owner-a@e2e.kshop.test", root: "sect-root@e2e.kshop.test" };
const SLUG = "sect-e2e-a";

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
function check(name, ok, detail) {
  results.push(ok);
  console.log(
    `${ok ? "ok" : "not ok"} - ${name}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail).slice(0, 300)})`}`,
  );
}

async function cleanup() {
  await service.from("stores").delete().eq("slug", SLUG);
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (Object.values(USERS).includes(u.email)) await service.auth.admin.deleteUser(u.id);
  }
}

async function createUser(email, appMetadata = {}) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: appMetadata,
  });
  if (error) throw error;
  return data.user.id;
}

async function token(email) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return data.session.access_token;
}

function api(tokenValue) {
  return async (method, path, body) => {
    const res = await fetch(`${APP}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokenValue}`,
        ...(body && { "Content-Type": "application/json" }),
      },
      body: body && JSON.stringify(body),
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) };
  };
}

const code = (r) => r.body?.error?.code ?? r.body?.code;

async function main() {
  await cleanup();
  const ownerId = await createUser(USERS.owner);
  await createUser(USERS.root, { role: "superadmin" });
  const { data: store, error } = await service
    .rpc("create_store", {
      p_name: "Sections E2E A",
      p_slug: SLUG,
      p_owner_id: ownerId,
      p_base_currency: "CUP",
      p_order_prefix: "SE",
      p_whatsapp_phone: "5350000000",
      p_plan_code: "pro",
      p_trial_days: 30,
      p_platform_domain: "kshop.fullkod.com",
      p_created_by: null,
    })
    .single();
  if (error) throw error;

  const owner = api(await token(USERS.owner));
  const rootApi = api(await token(USERS.root));
  const base = `/stores/${store.id}`;
  const sectionsPath = `/platform/stores/${store.id}/sections`;

  // Baseline: every section visible, the owner's empty write reaches validation.
  check(
    "owner: promotions open while visible (400 validation)",
    (await owner("POST", `${base}/promotions`, {})).status === 400,
  );

  // Only the superadmin configures sections.
  const ownerPut = await owner("PUT", sectionsPath, { section: "discounts", visibility: "managed" });
  check("owner: cannot configure sections (403)", ownerPut.status === 403, ownerPut);
  const basic = await rootApi("PUT", sectionsPath, { section: "orders", visibility: "hidden" });
  check("superadmin: a basic section is rejected (400)", basic.status === 400, basic);

  let r = await rootApi("PUT", sectionsPath, { section: "discounts", visibility: "managed" });
  check("superadmin: discounts managed", r.status === 200 && r.body.sections.discounts === "managed", r);
  r = await rootApi("PUT", sectionsPath, { section: "finance", visibility: "hidden" });
  check("superadmin: finance hidden", r.status === 200 && r.body.sections.finance === "hidden", r);
  r = await rootApi("GET", sectionsPath);
  check(
    "superadmin: GET returns both",
    r.body?.sections?.discounts === "managed" && r.body?.sections?.finance === "hidden",
    r,
  );

  // The admin boot carries them.
  r = await owner("GET", `/me?storeId=${store.id}`);
  check("owner: /me carries the sections", r.body?.admin?.sections?.finance === "hidden", r.body);

  // Staff writes are blocked in the configured sections only.
  r = await owner("POST", `${base}/promotions`, {});
  check(
    "owner: write in a managed section → 403 section_managed",
    r.status === 403 && code(r) === "section_managed",
    r,
  );
  r = await owner("POST", `${base}/finance/expenses`, {});
  check(
    "owner: write in a hidden section → 403 section_hidden",
    r.status === 403 && code(r) === "section_hidden",
    r,
  );
  r = await owner("GET", `${base}/finance/summary?from=2026-01-01&to=2026-12-31&currency=CUP`);
  check("owner: reads of a hidden section go on (200)", r.status === 200, r);
  r = await owner("POST", `${base}/vouchers`, {});
  check("owner: other sections untouched (400 validation)", r.status === 400, r);

  // The superadmin is never blocked.
  r = await rootApi("POST", `${base}/promotions`, {});
  check("superadmin: write in a managed section passes the guard (400 validation)", r.status === 400, r);
  r = await rootApi("POST", `${base}/finance/expenses`, {});
  check("superadmin: write in a hidden section passes the guard (400 validation)", r.status === 400, r);

  // Back to visible: nothing was deleted, writes open again.
  r = await rootApi("PUT", sectionsPath, { section: "discounts", visibility: "visible" });
  check("superadmin: discounts visible again", r.status === 200 && !("discounts" in r.body.sections), r);
  r = await owner("POST", `${base}/promotions`, {});
  check("owner: promotions open again (400 validation)", r.status === 400, r);
}

try {
  await main();
} catch (error) {
  check("unexpected error", false, String(error?.message ?? error));
} finally {
  await cleanup();
}
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
