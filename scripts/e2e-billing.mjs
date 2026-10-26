// Phase 5 API checks (plans, subscriptions, invoices, team) against the running app (pnpm dev) and the online
// Supabase project. Creates temporary stores bill-e2e-a (Base) and bill-e2e-b (Pro), a temporary superadmin and
// @e2e.kshop.test staff accounts, and removes everything at the end (also on failure). It never runs the daily
// billing tick (that would touch every store): overdue and suspension are tested in supabase/tests/07.
//
//   node scripts/e2e-billing.mjs

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
const USERS = {
  root: "bill-root@e2e.kshop.test",
  ownerA: "bill-owner-a@e2e.kshop.test",
  staffA: "bill-staff-a@e2e.kshop.test",
  ownerB: "bill-owner-b@e2e.kshop.test",
};
// Accounts invited through the team API (removed at the end too).
const INVITED = ["bill-admin-a@e2e.kshop.test", "bill-staff2-a@e2e.kshop.test", "bill-staff3-a@e2e.kshop.test"];
const SLUGS = ["bill-e2e-a", "bill-e2e-b"];

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
  await service.from("stores").delete().in("slug", SLUGS);
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (Object.values(USERS).includes(u.email) || INVITED.includes(u.email)) await service.auth.admin.deleteUser(u.id);
  }
}

async function token(email, password = PASSWORD) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
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

async function createStore(name, slug, ownerId, prefix, plan) {
  const { data, error } = await service
    .rpc("create_store", {
      p_name: name,
      p_slug: slug,
      p_owner_id: ownerId,
      p_base_currency: "CUP",
      p_order_prefix: prefix,
      p_whatsapp_phone: "5350000000",
      p_plan_code: plan,
      p_trial_days: 0,
      p_platform_domain: "kshop.fullkod.com",
      p_created_by: null,
    })
    .single();
  if (error) throw error;
  return data;
}

const spanish = (r) => typeof r.body?.error?.message === "string" && /[a-záéíóúñ]/i.test(r.body.error.message);

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
  const storeA = await createStore("Bill E2E A", SLUGS[0], ids.ownerA, "BA", "base");
  const storeB = await createStore("Bill E2E B", SLUGS[1], ids.ownerB, "BB", "pro");
  await service.from("store_members").insert({ store_id: storeA.id, user_id: ids.staffA, role: "staff" });
  const anon = api(null);
  const root = api(await token(USERS.root));
  const ownerA = api(await token(USERS.ownerA));
  const staffA = api(await token(USERS.staffA));
  const ownerB = api(await token(USERS.ownerB));
  const sub = `/platform/stores/${storeA.id}/subscription`;

  // ---- Plans ----
  let r = await ownerA("GET", "/platform/plans");
  check("plans: a store owner -> 403", r.status === 403, r);
  r = await anon("GET", "/platform/plans");
  check("plans: anonymous -> 401", r.status === 401, r);
  r = await root("GET", "/platform/plans");
  const base = r.body?.plans?.find((p) => p.code === "base");
  const pro = r.body?.plans?.find((p) => p.code === "pro");
  check("plans: Base 5 USD (50 yearly), Pro 12; Base without coupons nor look; Pro with both",
    r.status === 200 && base?.price === 5 && base?.yearlyPrice === 50 && pro?.price === 12
      && !base.modules.includes("vouchers") && !base.modules.includes("themes")
      && pro.modules.includes("vouchers") && pro.modules.includes("themes") && base.limits.maxStaff === 2
      && pro.limits.maxStaff === 10 && pro.limits.maxProducts === null, r.body);
  r = await root("PUT", "/platform/plans/base", { ...base, price: -1 });
  check("plans: a negative price -> 400 with the field", r.status === 400 && !!r.body.error.fields?.price, r);
  r = await root("PUT", "/platform/modules/catalog", { addonPrice: 1 });
  check("modules: the catalog is not sold alone -> 400 in Spanish", r.status === 400 && spanish(r), r);

  // ---- Subscription of A (Base, no trial) ----
  r = await root("GET", sub);
  check("subscription: Base, active, next invoice 5 USD, usage 0/300 and 1/2 (the staff)",
    r.status === 200 && r.body.plan.code === "base" && r.body.status === "active" && r.body.quote?.total === 5
      && r.body.usage.maxProducts.limit === 300 && r.body.usage.maxStaff.used === 1, r.body);
  r = await root("PUT", `${sub}/addons`, { moduleCode: "vouchers", enabled: true });
  check("add-on: coupons bought on Base -> 2 USD more",
    r.status === 200 && r.body.quote.total === 7 && r.body.modules.find((m) => m.code === "vouchers")?.source === "addon",
    r.body?.quote);
  r = await ownerA("GET", `/stores/${storeA.id}/entitlements`);
  check("add-on: the store has coupons at once", r.status === 200 && JSON.stringify(r.body).includes("vouchers"), r.body);
  r = await root("PUT", `${sub}/plan`, { planCode: "pro", interval: "year" });
  check("plan change to Pro yearly: 120 USD and the add-on is not billed (Pro includes it)",
    r.status === 200 && r.body.plan.code === "pro" && r.body.quote.total === 120, r.body?.quote);
  r = await root("PUT", `${sub}/plan`, { planCode: "base", interval: "month" });
  check("back to Base monthly: 5 + 2", r.status === 200 && r.body.quote.total === 7, r.body?.quote);
  r = await root("POST", `${sub}/grants`, { type: "discount_percent", value: 150 });
  check("grant: 150 % -> 400 on value", r.status === 400 && !!r.body.error.fields?.value, r);
  r = await root("POST", `${sub}/grants`, { type: "discount_percent", value: 50, reason: "Socio fundador" });
  check("grant: 50 % -> next invoice 3.50", r.status === 201 && r.body.quote.total === 3.5, r.body?.quote);
  const grantId = r.body?.grants?.[0]?.id;
  r = await root("PATCH", sub, { priceOverride: -3 });
  check("settings: negative own price -> 400", r.status === 400, r);
  r = await root("PATCH", sub, { founder: true, limitOverrides: { maxProducts: 500 }, notes: "Prueba E2E" });
  check("settings: founder, 500 products, notes", r.status === 200 && r.body.founder && r.body.usage.maxProducts.limit === 500
    && r.body.notes === "Prueba E2E", r.body);

  // ---- Invoices and cash payments ----
  r = await root("POST", `${sub}/invoices`);
  const invoice = r.body?.invoices?.find((i) => i.status === "pending");
  check("issue now: invoice KS-… of 3.50 for the current month", r.status === 201 && invoice?.total === 3.5
    && /^KS-\d{4}-\d{4}$/.test(invoice.number) && invoice.lines.length === 3, r.body?.invoices);
  r = await root("GET", "/platform/invoices?status=open");
  check("collections: the invoice is in «Por cobrar» with its store", r.status === 200
    && r.body.invoices.some((i) => i.id === invoice?.id && i.store?.slug === SLUGS[0]), r.status);
  r = await root("POST", `/platform/invoices/${invoice.id}/payments`, { amount: 0 });
  check("payment: 0 -> 400", r.status === 400, r);
  r = await root("POST", `/platform/invoices/${invoice.id}/payments`, { amount: 2, method: "cash", notes: "Primera parte" });
  check("payment: 2 in cash -> still pending, 1.50 left", r.status === 201 && r.body.invoice.status === "pending"
    && r.body.invoice.amountPaid === 2, r.body);
  r = await root("POST", `/platform/invoices/${invoice.id}/void`, {});
  check("void: an invoice with payments cannot be voided -> 409", r.status === 409 && spanish(r), r);
  r = await root("POST", `/platform/invoices/${invoice.id}/adjustments`, { description: "Dominio", amount: 1 });
  check("adjustment: +1 -> 4.50", r.status === 200 && r.body.invoice.total === 4.5, r.body?.invoice);
  r = await root("POST", `/platform/invoices/${invoice.id}/payments`, { amount: 2.5, method: "transfer", reference: "T-1" });
  check("payment: the rest -> paid", r.status === 201 && r.body.invoice.status === "paid"
    && r.body.invoice.payments.length === 2, r.body?.invoice);
  r = await root("POST", `/platform/invoices/${invoice.id}/payments`, { amount: 1 });
  check("payment on a paid invoice -> 409", r.status === 409, r);

  // A store closed by billing reopens when paid (the daily tick is tested in SQL; here the state is set directly).
  r = await root("POST", `${sub}/invoices`);
  const next = r.body?.invoices?.find((i) => i.status === "pending");
  await service.from("platform_invoices").update({ due_at: new Date(Date.now() - 864e5 * 9).toISOString() }).eq("id", next.id);
  await service.from("subscriptions").update({ status: "suspended" }).eq("store_id", storeA.id);
  await service.from("stores").update({ status: "suspended", suspended_reason: "billing" }).eq("id", storeA.id);
  r = await root("GET", `/platform/invoices?status=overdue`);
  check("collections: the overdue invoice is in «Vencidas»", r.body?.invoices?.some((i) => i.id === next.id && i.overdue), r.status);
  r = await ownerA("GET", `/stores/${storeA.id}/billing`);
  check("suspended store: the owner still sees its billing", r.status === 200 && r.body.storeStatus === "suspended"
    && r.body.suspendedReason === "billing", r.body?.storeStatus);
  r = await root("POST", `/platform/invoices/${next.id}/payments`, { amount: next.total });
  const { data: reopened } = await service.from("stores").select("status, suspended_reason").eq("id", storeA.id).single();
  check("paying the overdue invoice reopens the store", r.status === 201 && reopened.status === "active"
    && reopened.suspended_reason === null, reopened);

  r = await root("PATCH", `/platform/stores/${storeA.id}`, { status: "suspended" });
  const { data: manual } = await service.from("stores").select("suspended_reason").eq("id", storeA.id).single();
  check("manual suspension by the superadmin", r.status === 200 && manual.suspended_reason === "manual", manual);
  await root("PATCH", `/platform/stores/${storeA.id}`, { status: "active" });

  r = await root("DELETE", `${sub}/grants/${grantId}`);
  check("grant revoked: the discount is gone from the next invoice", r.status === 200 && r.body.quote.discount === 0, r.body?.quote);
  r = await root("PATCH", sub, { comped: true });
  check("courtesy: never billed (no next invoice)", r.status === 200 && r.body.status === "comped" && r.body.quote === null, r.body);
  await root("PATCH", sub, { comped: false });

  // ---- Owner view ----
  r = await ownerA("GET", `/stores/${storeA.id}/billing`);
  check("owner: plan, invoices, modules with prices, how to pay", r.status === 200 && r.body.invoices.length >= 2
    && r.body.modules.some((m) => m.code === "multi_currency" && m.addonPrice === 3 && m.inPro)
    && typeof r.body.instructions === "string" && !("notes" in r.body) && !("grants" in r.body), r.body);
  r = await staffA("GET", `/stores/${storeA.id}/billing`);
  check("billing: staff -> 403", r.status === 403, r);
  r = await ownerB("GET", `/stores/${storeA.id}/billing`);
  check("billing: owner of another store -> 403", r.status === 403, r);

  // ---- Look (Apariencia): set up by the platform ----
  const theme = { preset: "kshop", colors: {}, radius: "md" };
  r = await ownerA("PUT", `/stores/${storeA.id}/content/theme`, theme);
  check("look: a Base owner cannot change it -> 403", r.status === 403 && r.body.error.code === "module_not_enabled", r);
  r = await root("PUT", `/stores/${storeA.id}/content/theme`, theme);
  check("look: the superadmin always can", r.status === 200, r);
  r = await ownerB("PUT", `/stores/${storeB.id}/content/theme`, theme);
  check("look: a Pro owner can", r.status === 200, r);

  return { storeA, storeB, ids, root, ownerA, staffA, ownerB };
}

try {
  await run();
} catch (error) {
  console.error(error);
  results.push(false);
} finally {
  await cleanup();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed${failed ? `, ${failed} failed` : ""}`);
process.exit(failed ? 1 : 0);
