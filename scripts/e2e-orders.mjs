// Customers, cart, checkout and orders API checks against the running app (pnpm dev) and the online
// Supabase project. Creates temporary stores ord-e2e-a (Base) and ord-e2e-b (Pro) with @e2e.kshop.test staff
// accounts and removes everything at the end (stores, staff and customer auth users), also on failure.
//
//   node scripts/e2e-orders.mjs

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
  ownerA: "ord-owner-a@e2e.kshop.test",
  staffA: "ord-staff-a@e2e.kshop.test",
  ownerB: "ord-owner-b@e2e.kshop.test",
};
const SLUGS = ["ord-e2e-a", "ord-e2e-b"];

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
  const { data: stores } = await service.from("stores").select("id").in("slug", SLUGS);
  const storeIds = (stores ?? []).map((s) => s.id);
  await service.from("stores").delete().in("slug", SLUGS);
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    const isStaff = Object.values(USERS).includes(u.email);
    const isCustomer = storeIds.includes(u.app_metadata?.store_id);
    if (isStaff || isCustomer) await service.auth.admin.deleteUser(u.id);
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

async function createStore(name, slug, ownerId, currency, prefix, plan) {
  const { data, error } = await service
    .rpc("create_store", {
      p_name: name,
      p_slug: slug,
      p_owner_id: ownerId,
      p_base_currency: currency,
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

async function customers({ anon, ownerA, staffA, ownerB, storeA, storeB }) {
  const authA = `/stores/${storeA.id}/customer-auth`;
  const authB = `/stores/${storeB.id}/customer-auth`;
  const phone = "5359990001";

  let r = await anon("POST", `${authA}/register`, { firstName: "Ana", phone: "12", password: "corta" });
  check("register: invalid phone and short password -> 400 with fields",
    r.status === 400 && !!r.body.error.fields?.phone && !!r.body.error.fields?.password, r);

  r = await anon("POST", `${authA}/register`, { firstName: "Ana", phone, password: "clave-de-a-123" });
  check("register in A -> 201 with session", r.status === 201 && !!r.body.session?.accessToken, r);
  const custA = { token: r.body.session?.accessToken, id: r.body.customer?.id };
  check("register: phone normalized to E.164", r.body.customer?.phone === "+5359990001", r.body.customer);

  r = await anon("POST", `${authB}/register`, { firstName: "Ana B", phone: "+53 5999 0001", password: "clave-de-b-456" });
  check("same phone in B -> a second, independent account", r.status === 201 && r.body.customer?.id !== custA.id, r);
  const custB = { token: r.body.session?.accessToken, id: r.body.customer?.id };

  r = await anon("POST", `${authA}/register`, { firstName: "Otra", phone, password: "otra-clave-789" });
  check("same phone twice in A -> 409 phone_taken", r.status === 409 && r.body.error.code === "phone_taken", r);

  r = await anon("POST", `${authA}/login`, { phone: "5999 0001", password: "clave-de-a-123" });
  check("login in A with A's password -> 200", r.status === 200, r);
  r = await anon("POST", `${authB}/login`, { phone, password: "clave-de-a-123" });
  check("login in B with A's password -> 401", r.status === 401 && r.body.error.code === "invalid_credentials", r);
  r = await anon("POST", `${authA}/login`, { phone: "5359990099", password: "clave-de-a-123" });
  check("unknown phone -> same 401 message", r.status === 401 && r.body.error.code === "invalid_credentials", r);

  const asA = api(custA.token);
  const asB = api(custB.token);
  r = await asA("GET", `/stores/${storeA.id}/customer`);
  check("customer A reads its profile", r.status === 200 && r.body.customer.id === custA.id, r);
  r = await asA("GET", `/stores/${storeB.id}/customer`);
  check("token of A rejected in B -> 401", r.status === 401, r);
  r = await ownerA("GET", `/stores/${storeA.id}/customer`);
  check("staff token is not a customer -> 401", r.status === 401, r);
  r = await anon("GET", `/stores/${storeA.id}/customer`);
  check("no token -> 401", r.status === 401, r);
  r = await asA("PATCH", `/stores/${storeA.id}/customer`, { firstName: "Ana María", email: "ana@example.com" });
  check("customer A updates its profile", r.status === 200 && r.body.customer.firstName === "Ana María", r);
  r = await asA("GET", `/stores/${storeA.id}/entitlements`);
  check("customer token cannot use staff endpoints -> 403", r.status === 403, r);

  // Addresses.
  r = await asA("POST", `/stores/${storeA.id}/customer/addresses`, { recipient: "Ana", address: "Calle 23 #45" });
  check("customer A adds an address", r.status === 201, r);
  const addressId = r.body.address?.id;
  r = await asB("DELETE", `/stores/${storeB.id}/customer/addresses/${addressId}`);
  check("customer B cannot delete A's address -> 404", r.status === 404, r);
  r = await asA("GET", `/stores/${storeA.id}/customer/addresses`);
  check("customer A still has its address", r.status === 200 && r.body.addresses.length === 1, r);

  // Recovery code generated by the staff (no OpenWA yet).
  r = await staffA("POST", `/stores/${storeA.id}/customers/${custA.id}/recovery-code`);
  check("staff (not admin) cannot create recovery codes -> 403", r.status === 403, r);
  r = await ownerB("POST", `/stores/${storeA.id}/customers/${custA.id}/recovery-code`);
  check("owner of B cannot create codes in A -> 403", r.status === 403, r);
  r = await ownerB("POST", `/stores/${storeB.id}/customers/${custA.id}/recovery-code`);
  check("customer of A is not found from B -> 404", r.status === 404, r);
  r = await asA("POST", `/stores/${storeA.id}/customers/${custA.id}/recovery-code`);
  check("a customer cannot create codes -> 403", r.status === 403, r);
  r = await ownerA("POST", `/stores/${storeA.id}/customers/${custA.id}/recovery-code`);
  check("owner A creates a 6-digit code", r.status === 201 && /^\d{6}$/.test(r.body.code ?? ""), r);
  const code = r.body.code;
  const wrong = code === "000000" ? "111111" : "000000";

  r = await anon("POST", `${authA}/reset`, { phone, code: wrong, password: "nueva-clave-a-1" });
  check("reset with a wrong code -> 400", r.status === 400 && r.body.error.code === "invalid_code", r);
  r = await anon("POST", `${authB}/reset`, { phone, code, password: "nueva-clave-a-1" });
  check("A's code does not work in B -> 400", r.status === 400, r);
  r = await anon("POST", `${authA}/reset`, { phone, code, password: "nueva-clave-a-1" });
  check("reset with the right code -> 200 and signed in", r.status === 200 && !!r.body.session?.accessToken, r);
  const asANew = api(r.body.session?.accessToken);
  r = await asA("GET", `/stores/${storeA.id}/customer`);
  check("sessions from before the reset are revoked -> 401", r.status === 401, r);
  r = await anon("POST", `${authA}/reset`, { phone, code, password: "otra-clave-a-2" });
  check("a code works only once", r.status === 400, r);
  r = await anon("POST", `${authA}/login`, { phone, password: "clave-de-a-123" });
  check("old password no longer works in A", r.status === 401, r);
  r = await anon("POST", `${authB}/login`, { phone, password: "clave-de-b-456" });
  check("B's password is untouched", r.status === 200, r);

  // Blocked customer and suspended store.
  await service.from("customers").update({ is_blocked: true }).eq("id", custA.id);
  r = await anon("POST", `${authA}/login`, { phone, password: "nueva-clave-a-1" });
  check("blocked customer cannot sign in -> 403", r.status === 403 && r.body.error.code === "customer_blocked", r);
  r = await asANew("GET", `/stores/${storeA.id}/customer`);
  check("blocked customer token is rejected -> 403", r.status === 403, r);
  await service.from("customers").update({ is_blocked: false }).eq("id", custA.id);

  await service.from("stores").update({ status: "suspended" }).eq("id", storeB.id);
  r = await anon("POST", `${authB}/login`, { phone, password: "clave-de-b-456" });
  check("suspended store: no customer sign-in -> 404", r.status === 404, r);
  await service.from("stores").update({ status: "active" }).eq("id", storeB.id);

  // Rate limit: 10 attempts per phone every 15 minutes.
  const victim = "5359990002";
  await anon("POST", `${authA}/register`, { firstName: "Beto", phone: victim, password: "clave-beto-123" });
  let last;
  for (let i = 0; i < 11; i++) last = await anon("POST", `${authA}/login`, { phone: victim, password: "mala-clave" });
  check("11th wrong login for a phone -> 429", last.status === 429 && last.body.error.code === "too_many_attempts", last);

  return { custA: { ...custA, token: undefined }, custB };
}

async function run() {
  await cleanup();
  const ids = {};
  for (const [key, email] of Object.entries(USERS)) {
    const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    ids[key] = data.user.id;
  }
  const storeA = await createStore("Ord E2E A", SLUGS[0], ids.ownerA, "CUP", "OA", "base");
  const storeB = await createStore("Ord E2E B", SLUGS[1], ids.ownerB, "USD", "OB", "pro");
  await service.from("store_members").insert({ store_id: storeA.id, user_id: ids.staffA, role: "staff" });

  const ctx = {
    anon: api(null),
    ownerA: api(await token(USERS.ownerA)),
    staffA: api(await token(USERS.staffA)),
    ownerB: api(await token(USERS.ownerB)),
    storeA,
    storeB,
  };
  await customers(ctx);
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
