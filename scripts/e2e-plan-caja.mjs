// KSH0004 API checks against the running app (pnpm dev) and the online Supabase project: a temporary store on the
// «Caja» plan has no online store (public reads, cart, checkout and customer accounts answer 403 module_not_enabled,
// its subdomain shows the local card) while the counter works; moving it to Base turns the web on and back to Caja
// off. Creates caja-e2e with a temporary superadmin and owner (@e2e.kshop.test) and removes everything at the end.
//
//   pnpm e2e:plan-caja   (E2E_APP_URL for another port)

import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
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
const PORT = new URL(APP).port || "80";
const PASSWORD = randomBytes(12).toString("base64url");
const USERS = { root: "caja-root@e2e.kshop.test", owner: "caja-owner@e2e.kshop.test" };
const SLUG = "caja-e2e";

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
    if (Object.values(USERS).includes(u.email) || u.email?.startsWith("c_")) {
      if (Object.values(USERS).includes(u.email)) await service.auth.admin.deleteUser(u.id);
    }
  }
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
        ...(tokenValue && { Authorization: `Bearer ${tokenValue}` }),
        ...(body && { "Content-Type": "application/json" }),
      },
      body: body && JSON.stringify(body),
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) };
  };
}

/** The store's subdomain through the proxy, by Host header (fetch drops it, and *.localhost does not resolve here). */
function storePage(path = "/") {
  const url = new URL(APP);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: url.hostname,
        port: url.port || 80,
        path,
        method: "GET",
        headers: { Host: `${SLUG}.kshop.localhost:${PORT}` },
      },
      (res) => {
        let html = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (html += chunk));
        res.on("end", () => resolve({ status: res.statusCode, html }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const moduleOff = (r) => r.status === 403 && r.body?.error?.code === "module_not_enabled";

async function run() {
  await cleanup();
  const ids = {};
  for (const [k, email] of Object.entries(USERS)) {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      ...(k === "root" && { app_metadata: { role: "superadmin" } }),
    });
    if (error) throw error;
    ids[k] = data.user.id;
  }
  const { data: store, error } = await service
    .rpc("create_store", {
      p_name: "Caja E2E",
      p_slug: SLUG,
      p_owner_id: ids.owner,
      p_base_currency: "CUP",
      p_order_prefix: "CE",
      p_whatsapp_phone: "5350000000",
      p_plan_code: "caja",
      p_trial_days: 0,
      p_platform_domain: "kshop.fullkod.com",
      p_created_by: null,
    })
    .single();
  if (error) throw error;
  const { data: type } = await service
    .from("product_types")
    .insert({ store_id: store.id, name: "Simple", slug: "simple" })
    .select("id")
    .single();
  await service.rpc("save_product", {
    p_store_id: store.id,
    p_input: {
      product_type_id: type.id,
      name: "Arroz",
      slug: "arroz",
      status: "published",
      variants: [{ sku: "CE-ARROZ", price: 1000, stock: 5 }],
    },
    p_user_id: ids.owner,
  });

  const anon = api(null);
  const root = api(await token(USERS.root));
  const owner = api(await token(USERS.owner));
  const s = `/stores/${store.id}`;

  // ---- Plans ----
  let r = await root("GET", "/platform/plans");
  const caja = r.body?.plans?.find((p) => p.code === "caja");
  check(
    "plans: Caja is listed, 3 USD/month, 30/year, public",
    caja?.price === 3 && caja?.yearlyPrice === 30 && caja?.isPublic,
    caja,
  );
  check(
    "plans: Caja = catalog, orders, pos, sales_today, excel_import; 300 products, 2 staff",
    [...(caja?.modules ?? [])].sort().join() === "catalog,excel_import,orders,pos,sales_today" &&
      caja?.limits?.maxProducts === 300 &&
      caja?.limits?.maxStaff === 2,
    caja,
  );
  const base = r.body?.plans?.find((p) => p.code === "base");
  check(
    "plans: Base and Pro include the online store",
    base?.modules.includes("storefront") &&
      r.body?.plans?.find((p) => p.code === "pro")?.modules.includes("storefront"),
  );
  check(
    "plans: Caja sorts before Base",
    r.body?.plans?.findIndex((p) => p.code === "caja") < r.body?.plans?.findIndex((p) => p.code === "base"),
  );

  // ---- Off: public reads, cart, checkout, accounts ----
  r = await anon("GET", `${s}/storefront?view=store`);
  check("caja: storefront reads of the store app -> 403 module_not_enabled", moduleOff(r), r);
  r = await anon("PUT", `${s}/cart`, {
    lines: [{ variantId: "00000000-0000-4000-8000-000000000001", quantity: 1 }],
    mode: "set",
  });
  check("caja: cart -> 403 module_not_enabled", moduleOff(r), r);
  r = await anon("POST", `${s}/checkout`, {});
  check("caja: checkout -> 403 module_not_enabled", moduleOff(r), r);
  r = await anon("POST", `${s}/customer-auth/register`, {
    firstName: "Ana",
    phone: "5399900011",
    password: "clave-segura-123",
  });
  check("caja: customer registration -> 403 module_not_enabled", moduleOff(r), r);
  r = await anon("POST", `${s}/customer-auth/login`, { phone: "5399900011", password: "clave-segura-123" });
  check("caja: customer login -> 403 module_not_enabled", moduleOff(r), r);
  let page = await storePage("/");
  check(
    "caja: the subdomain shows the local card",
    page.status === 200 && /vende en su local/.test(page.html) && /local-store-card/.test(page.html),
    page.status,
  );
  page = await storePage("/products");
  check(
    "caja: the product listing shows the local card too",
    page.status === 200 && /local-store-card/.test(page.html),
    page.status,
  );

  // ---- On: the counter and the admin ----
  r = await owner("GET", `${s}/pos/catalog`);
  check("caja: the counter catalog works for the owner", r.status === 200 && r.body?.items?.length === 1, r);
  const variantId = r.body?.items?.[0]?.variantId;
  r = await owner("POST", `${s}/pos/sales`, {
    sales: [
      {
        id: randomUUID(),
        deviceId: "00000000-0000-4000-8000-000000000001",
        localNumber: "C-0001",
        soldAt: new Date().toISOString(),
        lines: [{ variantId, quantity: 2, unitPrice: 1000, productName: "Arroz" }],
        payments: [{ amount: 2000 }],
      },
    ],
  });
  check("caja: a counter sale uploads", r.status === 200 && r.body?.results?.[0]?.created === true, r);
  r = await owner("GET", `${s}/pos/catalog`);
  check("caja: the sale took its stock", r.body?.items?.[0]?.stock === 3, r.body?.items?.[0]);
  r = await owner("GET", `${s}/entitlements`);
  const codes = (r.body?.entitlements ?? r.body?.modules ?? []).map((e) => e.moduleCode ?? e.code ?? e);
  check(
    "caja: the entitlements have pos and not storefront",
    r.status === 200 && codes.includes("pos") && !codes.includes("storefront"),
    r.body,
  );

  // ---- Up to Base: the web turns on ----
  r = await root("PUT", `/platform${s}/subscription/plan`, { planCode: "base", interval: "month" });
  check("superadmin moves the store to Base", r.status === 200, r);
  r = await anon("GET", `${s}/storefront?view=store`);
  check("base: storefront reads -> 200", r.status === 200, r);
  page = await storePage("/");
  check(
    "base: the subdomain shows the store, not the card",
    page.status === 200 && !/local-store-card/.test(page.html),
    page.status,
  );
  r = await anon("GET", `${s}/cart`);
  check("base: the cart answers", r.status === 200, r);

  // ---- Back to Caja: off again, nothing lost ----
  r = await root("PUT", `/platform${s}/subscription/plan`, { planCode: "caja", interval: "month" });
  check("superadmin moves the store back to Caja", r.status === 200, r);
  r = await anon("GET", `${s}/storefront?view=store`);
  check("caja again: storefront reads -> 403", moduleOff(r), r);
  r = await owner("GET", `${s}/pos/catalog`);
  check("caja again: the catalog is still there", r.status === 200 && r.body?.items?.length === 1, r);

  // ---- A new store on Caja from the platform API ----
  r = await root("POST", "/platform/stores", {
    name: "Caja E2E 2",
    slug: `${SLUG}-2`,
    ownerEmail: USERS.owner,
    orderPrefix: "CF",
    planCode: "caja",
    trialDays: 0,
  });
  check("superadmin creates a store on the Caja plan", r.status === 201 || r.status === 200, r);
  await service.from("stores").delete().eq("slug", `${SLUG}-2`);
}

try {
  await run();
} finally {
  await cleanup();
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
