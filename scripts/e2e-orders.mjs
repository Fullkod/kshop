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

// Catalog and checkout options of a store, written with the service client (the admin API arrives in phase 3.5).
async function seedCatalog(store, ownerId, prefix) {
  const { data: type, error: typeError } = await service
    .from("product_types")
    .insert({ store_id: store.id, name: "Simple", slug: "simple", has_variants: false })
    .select("id")
    .single();
  if (typeError) throw typeError;
  const variants = {};
  for (const [key, price, stock] of [["S", 1500, 5], ["M", 900, 1]]) {
    const { data: productId, error } = await service.rpc("save_product", {
      p_store_id: store.id,
      p_input: {
        product_type_id: type.id,
        name: `Producto ${key}`,
        slug: `producto-${key.toLowerCase()}`,
        status: "published",
        variants: [{ sku: `${prefix}-${key}`, price, stock, cost: { price: 2, currency: "USD" } }],
      },
      p_user_id: ownerId,
    });
    if (error) throw error;
    const { data: v } = await service.from("product_variants").select("id").eq("product_id", productId).single();
    variants[key] = v.id;
  }
  const { data: zone } = await service.from("shipping_zones").insert({ store_id: store.id, name: "Centro" }).select("id").single();
  const { data: delivery } = await service
    .from("shipping_methods")
    .insert({ store_id: store.id, zone_id: zone.id, type: "delivery", name: "Mensajería", price: 200 })
    .select("id")
    .single();
  const { data: agree } = await service
    .from("shipping_methods")
    .insert({ store_id: store.id, zone_id: zone.id, type: "to_agree", name: "A convenir" })
    .select("id")
    .single();
  const { data: cash } = await service
    .from("payment_methods")
    .insert({ store_id: store.id, name: "Efectivo", instructions: "Pagas al recibir." })
    .select("id")
    .single();
  return { variants, zoneId: zone.id, deliveryId: delivery.id, agreeId: agree.id, cashId: cash.id };
}

const key = () => `e2e-${randomBytes(8).toString("hex")}`;

async function checkout({ anon, storeA, storeB, ownerIds }) {
  const A = await seedCatalog(storeA, ownerIds.ownerA, "OA");
  const B = await seedCatalog(storeB, ownerIds.ownerB, "OB");
  const cartA = `/stores/${storeA.id}/cart`;
  const checkoutA = `/stores/${storeA.id}/checkout`;
  const buyer = { name: "Invitada E2E", phone: "5359990010" };
  const shipping = { zoneId: A.zoneId, methodId: A.deliveryId, address: "Calle 23 #45, Vedado" };

  let r = await anon("PUT", cartA, { lines: [{ variantId: A.variants.S, quantity: 2 }], mode: "add" });
  check("guest cart: first line creates the cart and returns a token",
    r.status === 200 && !!r.body.token && r.body.subtotal === 3000 && r.body.itemCount === 2, r);
  const token = r.body.token;
  r = await anon("PUT", cartA, { token, lines: [{ variantId: B.variants.S, quantity: 1 }], mode: "add" });
  check("guest cart: a variant of another store is ignored", r.status === 200 && r.body.lines.length === 1, r);
  r = await anon("PUT", cartA, { token, lines: [{ variantId: A.variants.S, quantity: 9 }] });
  check("guest cart: more than available is flagged", r.status === 200 && r.body.lines[0].issue === "insufficient", r);
  r = await anon("PUT", cartA, { token, lines: [{ variantId: A.variants.S, quantity: 2 }] });
  r = await anon("GET", `${cartA}?token=${token}`);
  check("guest cart: read back by token", r.status === 200 && r.body.lines[0].quantity === 2, r);

  r = await anon("GET", checkoutA);
  check("checkout options: zones, methods and payment methods",
    r.status === 200 && r.body.shippingEnabled && r.body.methods.length === 2 && r.body.paymentMethods.length === 1, r);

  r = await anon("POST", checkoutA, { idempotencyKey: key(), cartToken: token, customer: { name: "", phone: "1" } });
  check("checkout: invalid customer -> 400 with fields", r.status === 400 && !!r.body.error.fields, r);
  r = await anon("POST", checkoutA, {
    idempotencyKey: key(), cartToken: token, customer: buyer, shipping: { zoneId: A.zoneId, methodId: A.deliveryId },
  });
  check("checkout: delivery without address -> 400", r.status === 400, r);

  const idem = key();
  const body = { idempotencyKey: idem, cartToken: token, customer: buyer, shipping, paymentMethodId: A.cashId, note: "Llamar antes" };
  r = await anon("POST", checkoutA, body);
  check("checkout: guest order created (OA-1001, 3000 + 200)",
    r.status === 201 && r.body.order.code === "OA-1001" && r.body.order.total === 3200, r);
  const order = r.body.order;
  check("checkout: WhatsApp link to the store with the order code",
    !!order?.whatsappUrl && decodeURIComponent(order.whatsappUrl).includes("OA-1001"), order?.whatsappUrl);
  r = await anon("POST", checkoutA, body);
  check("checkout: retry with the same key returns the same order", r.status === 200 && r.body.order.code === "OA-1001" && !r.body.created, r);
  r = await anon("GET", `${cartA}?token=${token}`);
  check("checkout: the cart is converted (empty afterwards)", r.status === 200 && r.body.lines.length === 0, r);
  const { data: stock } = await service.from("stocks").select("quantity, quantity_allocated").eq("variant_id", A.variants.S).single();
  check("checkout: stock reserved (5 units, 2 reserved)", stock.quantity === 5 && stock.quantity_allocated === 2, stock);

  r = await anon("GET", `${checkoutA}/orders/${order.publicToken}`);
  check("public order by token", r.status === 200 && r.body.order.lines.length === 1 && r.body.order.note === "Llamar antes", r);
  check("public order has no cost and no phone", !JSON.stringify(r.body).includes("unit_cost") && !JSON.stringify(r.body).includes("5359990010"), r.body);
  r = await anon("GET", `/stores/${storeB.id}/checkout/orders/${order.publicToken}`);
  check("public order token of A is not found in B -> 404", r.status === 404, r);
  r = await anon("POST", checkoutA, { ...body, idempotencyKey: key() });
  check("checkout with an empty cart -> 400", r.status === 400, r);

  // Race for the last unit of M: two guest carts, two checkouts at the same time.
  const tokens = [];
  for (let i = 0; i < 2; i++) {
    r = await anon("PUT", cartA, { lines: [{ variantId: A.variants.M, quantity: 1 }] });
    tokens.push(r.body.token);
  }
  const race = await Promise.all(
    tokens.map((t, i) =>
      anon("POST", checkoutA, { idempotencyKey: key(), cartToken: t, customer: { ...buyer, name: `Carrera ${i}` }, shipping }),
    ),
  );
  const statuses = race.map((x) => x.status).sort();
  check("race for the last unit: one order, one 409 insufficient_stock",
    statuses[0] === 201 && statuses[1] === 409 && race.some((x) => x.body.error?.code === "insufficient_stock"), race);
  const { data: m } = await service.from("stocks").select("quantity, quantity_allocated").eq("variant_id", A.variants.M).single();
  check("race: allocated never above quantity (1/1)", m.quantity === 1 && m.quantity_allocated === 1, m);

  // "To agree" + account created in the same step.
  r = await anon("PUT", cartA, { lines: [{ variantId: A.variants.S, quantity: 1 }] });
  r = await anon("POST", checkoutA, {
    idempotencyKey: key(),
    cartToken: r.body.token,
    customer: { name: "Nueva Cuenta", phone: "5359990011" },
    shipping: { zoneId: A.zoneId, methodId: A.agreeId },
    createAccountPassword: "cuenta-nueva-123",
  });
  check("checkout to agree: total pending, account created",
    r.status === 201 && r.body.order.total === null && !!r.body.account?.session.accessToken, r);
  const newCustomer = api(r.body.account?.session.accessToken);
  r = await newCustomer("GET", `/stores/${storeA.id}/customer/orders`);
  check("Mis pedidos: the new account sees its order", r.status === 200 && r.body.orders.length === 1 && r.body.orders[0].code === "OA-1003", r);
  // The race loser rolled back: numbers have no gaps (1001, 1002 winner, 1003).
  r = await anon("POST", checkoutA, {
    idempotencyKey: key(), customer: { name: "X", phone: "5359990011" }, shipping, createAccountPassword: "otra-clave-123",
  });
  check("checkout creating an account for a taken phone -> 409", r.status === 409 && r.body.error.code === "phone_taken", r);

  // Signed-in customer: the guest cart joins the customer's cart.
  r = await anon("PUT", cartA, { lines: [{ variantId: A.variants.S, quantity: 1 }] });
  const guestToken = r.body.token;
  r = await newCustomer("GET", `${cartA}?token=${guestToken}`);
  check("signed-in customer: the guest cart is merged", r.status === 200 && r.body.lines.length === 1 && r.body.token === null, r);
  r = await newCustomer("GET", `/stores/${storeB.id}/cart`);
  check("customer token of A on the cart of B -> 401", r.status === 401, r);

  await service.from("stores").update({ status: "suspended" }).eq("id", storeA.id);
  r = await anon("GET", checkoutA);
  check("suspended store: no checkout -> 404", r.status === 404, r);
  await service.from("stores").update({ status: "active" }).eq("id", storeA.id);
  return { A, B, order };
}

async function admin({ anon, ownerA, staffA, ownerB, storeA, storeB }, { A, B, order }) {
  const settings = `/stores/${storeA.id}/checkout-settings`;
  const orders = `/stores/${storeA.id}/orders`;

  let r = await anon("POST", `${settings}/zones`, { name: "Playa" });
  check("settings: no token -> 401", r.status === 401, r);
  r = await staffA("POST", `${settings}/zones`, { name: "Playa" });
  check("settings: staff cannot edit shipping (admin) -> 403", r.status === 403, r);
  r = await ownerB("POST", `${settings}/zones`, { name: "Playa" });
  check("settings: owner of B cannot edit A -> 403", r.status === 403, r);
  r = await ownerA("POST", `${settings}/unknown`, { name: "X" });
  check("settings: unknown resource -> 404", r.status === 404, r);
  r = await ownerA("POST", `${settings}/zones`, { name: "Playa" });
  check("settings: owner creates a zone -> 201", r.status === 201, r);
  const zoneId = r.body.id;
  r = await ownerA("POST", `${settings}/methods`, { zoneId, type: "pickup", name: "Recogida" });
  check("settings: pickup without point -> 400 with field", r.status === 400 && !!r.body.error.fields?.warehouseId, r);
  r = await ownerA("POST", `${settings}/methods`, { zoneId: B.zoneId, type: "delivery", name: "X", price: 1 });
  check("settings: a zone of another store is rejected -> 400", r.status === 400, r);
  r = await ownerA("PATCH", `${settings}/zones/${zoneId}`, { name: "Playa y Miramar", isActive: false });
  check("settings: owner updates a zone", r.status === 200, r);
  r = await ownerA("POST", `${settings}/payment-methods`, { name: "Transfermóvil", currencies: ["CUP"] });
  check("settings: owner creates a payment method", r.status === 201, r);
  r = await ownerA("DELETE", `${settings}/zones/${zoneId}`);
  check("settings: owner deletes a zone", r.status === 204, r);

  await service.from("store_modules").update({ enabled: false }).eq("store_id", storeA.id).eq("module_code", "shipping");
  r = await ownerA("POST", `${settings}/zones`, { name: "Sin módulo" });
  check("settings: shipping module disabled -> 403 module_not_enabled",
    r.status === 403 && r.body.error.code === "module_not_enabled", r);
  r = await ownerA("POST", `${settings}/payment-methods`, { name: "Sigue funcionando" });
  check("settings: payment methods only need orders", r.status === 201, r);
  await service.from("store_modules").update({ enabled: true }).eq("store_id", storeA.id).eq("module_code", "shipping");

  // New order from the admin (channel admin).
  r = await staffA("POST", orders, {
    idempotencyKey: key(),
    lines: [{ variantId: A.variants.S, quantity: 1 }],
    customer: { name: "Pedido por teléfono", phone: "5359990020" },
    shipping: { zoneId: A.zoneId, methodId: A.agreeId },
  });
  check("new order from the admin (staff) -> 201", r.status === 201 && r.body.order.code.startsWith("OA-"), r);
  const { data: adminOrder } = await service.from("orders").select("id, channel, created_by").eq("public_token", r.body.order.publicToken).single();
  check("new order: channel admin and created_by set", adminOrder.channel === "admin" && !!adminOrder.created_by, adminOrder);
  r = await ownerB("POST", orders, { idempotencyKey: key(), lines: [{ variantId: A.variants.S, quantity: 1 }], customer: { name: "X", phone: "5359990021" } });
  check("new order: owner of B in A -> 403", r.status === 403, r);
  r = await ownerA("POST", orders, { idempotencyKey: key(), lines: [], customer: { name: "X", phone: "5359990021" } });
  check("new order: no lines -> 400", r.status === 400, r);

  // Order life cycle.
  const id = adminOrder.id;
  r = await staffA("POST", `${orders}/${id}/transition`, { to: "delivered" });
  check("transition: pending -> delivered -> 409 invalid_transition", r.status === 409 && r.body.error.code === "invalid_transition", r);
  r = await staffA("POST", `${orders}/${id}/transition`, { to: "pending_payment" });
  check("transition: to agree without cost -> 409 shipping_required", r.status === 409 && r.body.error.code === "shipping_required", r);
  r = await staffA("POST", `${orders}/${id}/shipping`, { amount: 250 });
  check("shipping cost set", r.status === 200, r);
  r = await staffA("POST", `${orders}/${id}/transition`, { to: "pending_payment" });
  check("transition: confirm after setting the cost", r.status === 200, r);
  r = await staffA("POST", `${orders}/${id}/payments`, { amount: 500, reference: "TRF-9" });
  check("payment recorded", r.status === 200, r);
  r = await staffA("POST", `${orders}/${id}/payments`, { amount: 1, evidencePath: `stores/${storeB.id}/payments/x.jpg` });
  check("payment evidence must be in the store's folder -> 404", r.status === 404, r);
  r = await staffA("POST", `${orders}/${id}/notes`, { text: "Llamó para cambiar la hora" });
  check("internal note added", r.status === 200, r);
  r = await ownerB("POST", `${orders}/${id}/notes`, { text: "intruso" });
  check("owner of B cannot touch orders of A -> 403", r.status === 403, r);
  r = await ownerB("POST", `/stores/${storeB.id}/orders/${id}/transition`, { to: "paid" });
  check("order of A is not found from B -> 404", r.status === 404, r);
  r = await ownerB("POST", `/stores/${storeB.id}/orders/${id}/notes`, { text: "intruso" });
  check("note on an order of A from B -> 404", r.status === 404, r);
  r = await staffA("POST", `${orders}/${id}/transition`, { to: "paid" });
  check("mark paid", r.status === 200, r);
  const { data: paid } = await service.from("orders").select("payment_status, paid_total, total").eq("id", id).single();
  check("mark paid records the rest (paid = total)", paid.payment_status === "paid" && Number(paid.paid_total) === Number(paid.total), paid);
  for (const to of ["processing", "shipped"]) await staffA("POST", `${orders}/${id}/transition`, { to });
  r = await staffA("POST", `${orders}/${id}/cancel`, { reason: "x" });
  check("cancel a shipped order -> 409", r.status === 409, r);
  r = await staffA("POST", `${orders}/${id}/transition`, { to: "delivered" });
  check("delivered", r.status === 200, r);

  // The customer view never shows internal notes.
  const { data: pub } = await service.from("orders").select("public_token").eq("id", id).single();
  r = await anon("GET", `/stores/${storeA.id}/checkout/orders/${pub.public_token}`);
  check("public order hides internal notes", r.status === 200 && !JSON.stringify(r.body).includes("cambiar la hora"), r.body);

  // Cancel the first web order (pending): releases the reservation.
  const { data: first } = await service.from("orders").select("id").eq("public_token", order.publicToken).single();
  r = await ownerA("POST", `${orders}/${first.id}/cancel`, { reason: "Cliente no respondió" });
  check("cancel a pending order", r.status === 200, r);

  r = await staffA("GET", `${orders}/sales-today`);
  check("sales today: orders and money received today", r.status === 200 && r.body.orders.length > 0 && r.body.received.length > 0, r);
  r = await ownerB("GET", `${orders}/sales-today`);
  check("sales today of A from B -> 403", r.status === 403, r);

  // KSH0002: an order paid in several currencies, at the rate agreed on each payment.
  const newOrderOf = async (total) => {
    const res = await staffA("POST", orders, {
      idempotencyKey: key(),
      lines: [{ variantId: A.variants.S, quantity: 1 }],
      customer: { name: "Cobro mixto", phone: "5359990022" },
      shipping: { zoneId: A.zoneId, methodId: A.agreeId },
    });
    const { data } = await service.from("orders").select("id, subtotal").eq("public_token", res.body.order.publicToken).single();
    await staffA("POST", `${orders}/${data.id}/shipping`, { amount: total - Number(data.subtotal) });
    return data.id;
  };
  const balance = async (orderId) =>
    (await service.from("orders").select("paid_total, payment_status").eq("id", orderId).single()).data;
  const money = (rows) => rows.map((x) => `${Number(x.amount)} ${x.currency}`).sort().join(" + ");
  const moves = async (table, orderId) =>
    (await service.from(table).select("amount, currency, applied_amount").eq("order_id", orderId)).data;

  const mixed = await newOrderOf(20_000);
  r = await staffA("POST", `${orders}/${mixed}/payments`, { amount: 50, currency: "USD" });
  check("mixed: another currency without a rate -> 400", r.status === 400, r);
  r = await staffA("POST", `${orders}/${mixed}/payments`, { amount: 50, currency: "USD", rate: 320, reference: "Efectivo" });
  check("mixed: 50 USD at 320 recorded", r.status === 200, r);
  let bal = await balance(mixed);
  check("mixed: 50 USD at 320 of 20 000 CUP leaves 4 000", Number(bal.paid_total) === 16_000 && bal.payment_status === "partially_paid", bal);
  r = await staffA("POST", `${orders}/${mixed}/payments`, { amount: 4_000 });
  bal = await balance(mixed);
  check("mixed: the rest in CUP settles it", r.status === 200 && Number(bal.paid_total) === 20_000 && bal.payment_status === "paid", bal);
  r = await staffA("GET", `${orders}/sales-today`);
  check("mixed: sales today shows the dollars as dollars", r.body.received.some((x) => x.currency === "USD" && x.amount === 50), r.body);
  r = await staffA("POST", `${orders}/${mixed}/cancel`, { reason: "Devuelve" });
  bal = await balance(mixed);
  check("mixed: cancel leaves the balance at 0", r.status === 200 && Number(bal.paid_total) === 0 && bal.payment_status === "refunded", bal);
  check("mixed: cancel gives back each currency as it came",
    money(await moves("refunds", mixed)) === "4000 CUP + 50 USD", await moves("refunds", mixed));

  const withChange = await newOrderOf(15_000);
  r = await staffA("POST", `${orders}/${withChange}/payments`, {
    amount: 50, currency: "USD", rate: 320, changeAmount: 16_000, changeCurrency: "CUP",
  });
  check("change: more than what was paid -> 400", r.status === 400, r);
  r = await staffA("POST", `${orders}/${withChange}/payments`, {
    amount: 50, currency: "USD", rate: 320, changeAmount: 1_000, changeCurrency: "EUR",
  });
  check("change: in a third currency -> 400", r.status === 400, r);
  r = await staffA("POST", `${orders}/${withChange}/payments`, {
    amount: 50, currency: "USD", rate: 320, changeAmount: 1_000, changeCurrency: "CUP",
  });
  bal = await balance(withChange);
  check("change: 50 USD with 1 000 CUP back settles 15 000", r.status === 200 && Number(bal.paid_total) === 15_000 && bal.payment_status === "paid", bal);
  r = await staffA("POST", `${orders}/${withChange}/cancel`, {});
  bal = await balance(withChange);
  check("change: cancel leaves the balance at 0", r.status === 200 && Number(bal.paid_total) === 0 && bal.payment_status === "refunded", bal);
  const { data: tillRows } = await service.from("payments").select("amount, currency, applied_amount, change_amount").eq("order_id", withChange);
  check("change: the dollars go back and the pesos come back to the till",
    money(await moves("refunds", withChange)) === "50 USD" &&
      tillRows.some((x) => x.currency === "CUP" && Number(x.amount) === 1_000 && Number(x.applied_amount) === 0),
    tillRows);

  r = await staffA("GET", `${orders}/payment-rates`);
  check("payment rates: staff reads the suggestion", r.status === 200 && "values" in r.body, r);
  r = await ownerB("GET", `${orders}/payment-rates`);
  check("payment rates of A from B -> 403", r.status === 403, r);

  // Customers.
  const { data: cust } = await service.from("customers").select("id").eq("store_id", storeA.id).limit(1).single();
  r = await staffA("PATCH", `/stores/${storeA.id}/customers/${cust.id}`, { isBlocked: true });
  check("block a customer: staff -> 403 (admin)", r.status === 403, r);
  r = await ownerA("PATCH", `/stores/${storeA.id}/customers/${cust.id}`, { isBlocked: true });
  check("block a customer: owner -> 200", r.status === 200 && r.body.isBlocked === true, r);
  r = await ownerB("PATCH", `/stores/${storeB.id}/customers/${cust.id}`, { isBlocked: true });
  check("customer of A not found from B -> 404", r.status === 404, r);
  await service.from("customers").update({ is_blocked: false }).eq("id", cust.id);
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
    ownerIds: ids,
  };
  await customers(ctx);
  const seeded = await checkout(ctx);
  await admin(ctx, seeded);
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
