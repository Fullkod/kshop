// WhatsApp notices API checks against the running app (pnpm dev) and the online Supabase project, in the platform
// mode "dry_run" (nothing is sent). Creates temporary stores notif-e2e-a (Pro) and notif-e2e-b (Base), staff and a
// superadmin under @e2e.kshop.test, and removes everything at the end (also on failure). The platform settings are
// restored to what they were.
//
//   node scripts/e2e-notifications.mjs

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
  ownerA: "notif-owner-a@e2e.kshop.test",
  staffA: "notif-staff-a@e2e.kshop.test",
  ownerB: "notif-owner-b@e2e.kshop.test",
  superadmin: "notif-super@e2e.kshop.test",
};
const SLUGS = ["notif-e2e-a", "notif-e2e-b"];

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
    if (Object.values(USERS).includes(u.email) || storeIds.includes(u.app_metadata?.store_id)) {
      await service.auth.admin.deleteUser(u.id);
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
        "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
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

async function seedCatalog(store, ownerId) {
  const { data: type } = await service
    .from("product_types")
    .insert({ store_id: store.id, name: "Simple", slug: "simple", has_variants: false })
    .select("id")
    .single();
  const { data: productId, error } = await service.rpc("save_product", {
    p_store_id: store.id,
    p_input: {
      product_type_id: type.id,
      name: "Bolso",
      slug: "bolso",
      status: "published",
      variants: [{ sku: `${store.slug}-B`, price: 1000, stock: 20 }],
    },
    p_user_id: ownerId,
  });
  if (error) throw error;
  const { data: v } = await service.from("product_variants").select("id").eq("product_id", productId).single();
  const { data: zone } = await service.from("shipping_zones").insert({ store_id: store.id, name: "Centro" }).select("id").single();
  const { data: method } = await service
    .from("shipping_methods")
    .insert({ store_id: store.id, zone_id: zone.id, type: "delivery", name: "Mensajería", price: 200 })
    .select("id")
    .single();
  return { variantId: v.id, shipping: { zoneId: zone.id, methodId: method.id, address: "Calle 23" } };
}

const key = () => `e2e-${randomBytes(8).toString("hex")}`;
const notices = async (orderId) => {
  const { data } = await service.from("notification_log").select("id, audience, event, status, message").eq("order_id", orderId);
  return data ?? [];
};

let savedPlatform = null;

async function run() {
  await cleanup();
  const ids = {};
  for (const [k, email] of Object.entries(USERS)) {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      ...(k === "superadmin" && { app_metadata: { role: "superadmin" } }),
    });
    if (error) throw error;
    ids[k] = data.user.id;
  }
  const storeA = await createStore("Notif E2E A", SLUGS[0], ids.ownerA, "NA", "pro");
  const storeB = await createStore("Notif E2E B", SLUGS[1], ids.ownerB, "NB", "base");
  await service.from("store_members").insert({ store_id: storeA.id, user_id: ids.staffA, role: "staff" });
  const anon = api(null);
  const ownerA = api(await token(USERS.ownerA));
  const staffA = api(await token(USERS.staffA));
  const ownerB = api(await token(USERS.ownerB));
  const superadmin = api(await token(USERS.superadmin));
  const A = await seedCatalog(storeA, ids.ownerA);
  const base = `/stores/${storeA.id}`;

  // ---- Platform settings (superadmin) ----
  let r = await ownerA("GET", "/platform/whatsapp");
  check("platform whatsapp: store owner -> 403", r.status === 403, r);
  r = await superadmin("GET", "/platform/whatsapp");
  check("platform whatsapp: superadmin reads mode and queue, never the key",
    r.status === 200 && !!r.body.mode && "hasApiKey" in r.body && !("apiKey" in r.body), r.body);
  savedPlatform = r.body;
  r = await superadmin("PUT", "/platform/whatsapp", { mode: "live", url: null, session: null });
  check("platform whatsapp: live without URL, session and key -> 400", r.status === 400, r);
  r = await superadmin("PUT", "/platform/whatsapp", {
    mode: "dry_run", url: savedPlatform.url, session: savedPlatform.session,
    ratePerMinute: savedPlatform.ratePerMinute, storeRatePerMinute: savedPlatform.storeRatePerMinute,
  });
  check("platform whatsapp: dry_run saved", r.status === 200 && r.body.mode === "dry_run", r);
  r = await superadmin("POST", "/platform/whatsapp/test", { phone: "5350000009", text: "Prueba E2E" });
  check("platform whatsapp: test message simulated in dry_run", r.status === 201 && r.body.status === "simulated", r);
  await service.from("notification_log").delete().eq("event", "test").eq("recipient", "+5350000009");

  // ---- Contacts ----
  const contact = { name: "Dueña", phone: "5355550101", notifyPaymentRecorded: true };
  r = await staffA("POST", `${base}/notification-contacts`, contact);
  check("contacts: staff (not admin) -> 403", r.status === 403, r);
  r = await ownerB("POST", `${base}/notification-contacts`, contact);
  check("contacts: owner of B in A -> 403", r.status === 403, r);
  r = await ownerA("POST", `${base}/notification-contacts`, { ...contact, phone: "12" });
  check("contacts: invalid phone -> 400 on phone", r.status === 400 && !!r.body.error.fields?.phone, r);
  r = await ownerA("POST", `${base}/notification-contacts`, contact);
  check("contacts: owner adds a contact (phone normalized)", r.status === 201, r);
  const contactId = r.body.id;
  r = await ownerA("POST", `${base}/notification-contacts`, contact);
  check("contacts: same phone twice -> 409", r.status === 409, r);
  r = await ownerB("POST", `/stores/${storeB.id}/notification-contacts`, contact);
  check("contacts: store without the module -> 403 module_not_enabled",
    r.status === 403 && r.body.error.code === "module_not_enabled", r);

  // ---- Templates ----
  r = await ownerA("PUT", `${base}/whatsapp-templates`, { event: "paid", audience: "customer", body: "Pagado {{nada}}" });
  check("templates: unknown variable -> 400 on body", r.status === 400 && !!r.body.error.fields?.body, r);
  r = await ownerA("PUT", `${base}/whatsapp-templates`, { event: "inventado", audience: "customer", body: "x" });
  check("templates: unknown event -> 400", r.status === 400, r);
  r = await ownerA("PUT", `${base}/whatsapp-templates`, {
    event: "paid", audience: "customer", body: "¡Listo, {{cliente}}! Pagaste {{numero}}.",
  });
  check("templates: owner saves its own text", r.status === 200, r);
  r = await staffA("POST", `${base}/whatsapp-templates/preview`, { body: "Hola {{cliente}}", audience: "customer" });
  check("templates: preview with the store name and the automatic notice footer",
    r.status === 200 && r.body.text.startsWith("*Notif E2E A*") && r.body.text.includes("no respondas"), r.body);

  // ---- A real order: notices queued as simulated ----
  r = await anon("PUT", `${base}/cart`, { lines: [{ variantId: A.variantId, quantity: 1 }], mode: "add" });
  r = await anon("POST", `${base}/checkout`, {
    idempotencyKey: key(), cartToken: r.body.token, customer: { name: "Invitada", phone: "5359990030" }, shipping: A.shipping,
  });
  const orderId = r.body.orderId;
  let list = await notices(orderId);
  check("order: notice to the contact and to the customer, simulated",
    list.map((n) => `${n.audience}:${n.event}:${n.status}`).sort().join(" ")
      === "customer:order_created:simulated store:order_created:simulated", list);
  check("order: guest link is the public order page",
    list.find((n) => n.audience === "customer")?.message.includes("/order/"), list);

  r = await ownerA("POST", `${base}/orders/${orderId}/transition`, { to: "paid" });
  list = await notices(orderId);
  check("paid: the store text is used", list.find((n) => n.event === "paid")?.message.includes("¡Listo, Invitada!"), list);
  check("paid: the contact that asked for payments is notified", list.some((n) => n.audience === "store" && n.event === "payment_recorded"), list);

  r = await anon("PUT", `${base}/cart`, { lines: [{ variantId: A.variantId, quantity: 1 }], mode: "add" });
  r = await anon("POST", `${base}/checkout`, {
    idempotencyKey: key(), cartToken: r.body.token, customer: { name: "Sin avisos", phone: "5359990031" },
    shipping: A.shipping, notifyCustomer: false,
  });
  list = await notices(r.body.orderId);
  check("opt-out at checkout: only the store is notified", list.length === 1 && list[0].audience === "store", list);

  // Customer with an account: the link goes to its profile.
  r = await anon("POST", `${base}/customer-auth/register`, { firstName: "Ana", phone: "5359990032", password: "clave-ana-1234" });
  const customer = api(r.body.session?.accessToken);
  r = await customer("PUT", `${base}/cart`, { lines: [{ variantId: A.variantId, quantity: 1 }], mode: "add" });
  r = await customer("POST", `${base}/checkout`, {
    idempotencyKey: key(), customer: { name: "Ana", phone: "5359990032" }, shipping: A.shipping,
  });
  const accountOrder = r.body.orderId;
  list = await notices(accountOrder);
  check("account customer: link to /account/orders/{id}",
    list.find((n) => n.audience === "customer")?.message.includes(`/account/orders/${accountOrder}`), list);
  r = await customer("GET", `${base}/customer/orders/${accountOrder}`);
  check("account order endpoint returns the public token to its owner", r.status === 200 && !!r.body.publicToken, r);
  r = await customer("GET", `${base}/customer/orders/${orderId}`);
  check("account order endpoint: another order -> 404", r.status === 404, r);
  r = await anon("GET", `${base}/customer/orders/${accountOrder}`);
  check("account order endpoint: no session -> 401", r.status === 401, r);

  // Retry.
  const storeNotice = (await notices(orderId)).find((n) => n.audience === "store" && n.event === "order_created");
  r = await staffA("POST", `${base}/notifications/${storeNotice.id}/retry`);
  check("retry: a notice that did not fail -> 409", r.status === 409, r);
  await service.from("notification_log").update({ status: "failed", error: "HTTP 500" }).eq("id", storeNotice.id);
  r = await staffA("POST", `${base}/notifications/${storeNotice.id}/retry`);
  const { data: retried } = await service.from("notification_log").select("status, error").eq("id", storeNotice.id).single();
  check("retry: staff retries a failed notice (simulated again)", r.status === 200 && retried.status === "simulated" && !retried.error, [r, retried]);
  r = await ownerB("POST", `${base}/notifications/${storeNotice.id}/retry`);
  check("retry: owner of B -> 403", r.status === 403, r);

  // Restore the template and delete the contact.
  r = await ownerA("DELETE", `${base}/whatsapp-templates?event=paid&audience=customer`);
  check("templates: back to the platform text", r.status === 204, r);
  r = await ownerA("DELETE", `${base}/notification-contacts/${contactId}`);
  check("contacts: delete", r.status === 204, r);
}

try {
  await run();
} catch (error) {
  console.error(error);
  results.push(false);
} finally {
  if (savedPlatform) {
    await service.rpc("platform_whatsapp_set", {
      p_input: {
        mode: savedPlatform.mode,
        url: savedPlatform.url,
        session: savedPlatform.session,
        rate_per_minute: savedPlatform.ratePerMinute,
        store_rate_per_minute: savedPlatform.storeRatePerMinute,
      },
    });
  }
  await cleanup();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed${failed ? `, ${failed} failed` : ""}`);
process.exit(failed ? 1 : 0);
