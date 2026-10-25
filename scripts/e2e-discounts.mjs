// Promotions and vouchers API checks against the running app (pnpm dev) and the online Supabase project.
// Creates temporary stores disc-e2e-a (Base) and disc-e2e-b (Pro) with @e2e.kshop.test staff accounts and
// removes everything at the end (stores, staff and customer auth users), also on failure.
//
//   node scripts/e2e-discounts.mjs

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
  ownerA: "disc-owner-a@e2e.kshop.test",
  staffA: "disc-staff-a@e2e.kshop.test",
  ownerB: "disc-owner-b@e2e.kshop.test",
};
const SLUGS = ["disc-e2e-a", "disc-e2e-b"];

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
        // Each check its own "IP" for the per-IP rate limits of the voucher and checkout endpoints.
        "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
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

async function seedCatalog(store, ownerId, prefix) {
  const { data: type, error: typeError } = await service
    .from("product_types")
    .insert({ store_id: store.id, name: "Simple", slug: "simple", has_variants: false })
    .select("id")
    .single();
  if (typeError) throw typeError;
  const products = {};
  for (const [key, price, stock] of [["S", 1500, 20], ["M", 900, 20]]) {
    const { data: productId, error } = await service.rpc("save_product", {
      p_store_id: store.id,
      p_input: {
        product_type_id: type.id,
        name: `Producto ${key}`,
        slug: `producto-${key.toLowerCase()}`,
        status: "published",
        variants: [{ sku: `${prefix}-${key}`, price, stock }],
      },
      p_user_id: ownerId,
    });
    if (error) throw error;
    const { data: v } = await service.from("product_variants").select("id").eq("product_id", productId).single();
    products[key] = { productId, variantId: v.id };
  }
  const { data: zone } = await service.from("shipping_zones").insert({ store_id: store.id, name: "Centro" }).select("id").single();
  const { data: delivery } = await service
    .from("shipping_methods")
    .insert({ store_id: store.id, zone_id: zone.id, type: "delivery", name: "Mensajería", price: 200 })
    .select("id")
    .single();
  return { products, zoneId: zone.id, deliveryId: delivery.id };
}

const key = () => `e2e-${randomBytes(8).toString("hex")}`;
const minPrice = async (productId) =>
  Number((await service.from("products").select("min_price").eq("id", productId).single()).data.min_price);

async function run() {
  await cleanup();
  const ids = {};
  for (const [k, email] of Object.entries(USERS)) {
    const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    ids[k] = data.user.id;
  }
  const storeA = await createStore("Disc E2E A", SLUGS[0], ids.ownerA, "CUP", "DA", "base");
  const storeB = await createStore("Disc E2E B", SLUGS[1], ids.ownerB, "USD", "DB", "pro");
  await service.from("store_members").insert({ store_id: storeA.id, user_id: ids.staffA, role: "staff" });
  const anon = api(null);
  const ownerA = api(await token(USERS.ownerA));
  const staffA = api(await token(USERS.staffA));
  const ownerB = api(await token(USERS.ownerB));
  const A = await seedCatalog(storeA, ids.ownerA, "DA");
  const B = await seedCatalog(storeB, ids.ownerB, "DB");
  const S = A.products.S;
  const base = `/stores/${storeA.id}`;

  // ---- Promotions (admin API) ----
  const promo = { name: "Rebajas", reward: "percent", value: 20, targets: [{ type: "product", id: S.productId }] };
  let r = await staffA("POST", `${base}/promotions`, promo);
  check("promotions: staff (not admin) -> 403", r.status === 403, r);
  r = await ownerB("POST", `${base}/promotions`, promo);
  check("promotions: owner of B in A -> 403", r.status === 403, r);
  r = await ownerA("POST", `${base}/promotions`, { ...promo, value: 120, targets: [] });
  check("promotions: percent > 100 and no targets -> 400 with fields",
    r.status === 400 && !!r.body.error.fields?.value && !!r.body.error.fields?.targets, r);
  r = await ownerA("POST", `${base}/promotions`, { ...promo, targets: [{ type: "product", id: B.products.S.productId }] });
  check("promotions: a product of another store -> 422", r.status === 422, r);
  r = await ownerA("POST", `${base}/promotions`, promo);
  check("promotions: owner creates -20 % on product S", r.status === 201 && !!r.body.id, r);
  const promoId = r.body.id;
  check("promotions: storefront min price is the promotion price at once", (await minPrice(S.productId)) === 1200);

  r = await anon("PUT", `${base}/cart`, { lines: [{ variantId: S.variantId, quantity: 1 }], mode: "add" });
  const cartToken = r.body.token;
  const line = r.body.lines?.[0];
  check("cart: line priced by the engine (list 1500, unit 1200, promotion name)",
    r.status === 200 && line?.listPrice === 1500 && line?.unitPrice === 1200 && line?.promotionName === "Rebajas"
      && r.body.subtotal === 1200 && r.body.promotionSavings === 300, r.body);

  r = await ownerA("PUT", `${base}/promotions/${promoId}`, { ...promo, isActive: false });
  check("promotions: paused -> list price again", r.status === 200 && (await minPrice(S.productId)) === 1500, r);
  r = await ownerA("PUT", `${base}/promotions/${promoId}`, promo);
  check("promotions: active again", r.status === 200 && (await minPrice(S.productId)) === 1200, r);

  // ---- Vouchers ----
  const voucher = { code: "Bienvenida10", name: "Bienvenida", reward: "percent", value: 10, minSubtotal: 2000, usagePerCustomer: 1 };
  r = await staffA("POST", `${base}/vouchers`, voucher);
  check("vouchers: staff -> 403", r.status === 403, r);
  r = await ownerA("POST", `${base}/vouchers`, voucher);
  check("vouchers: owner creates BIENVENIDA10 (stored uppercase)", r.status === 201, r);
  r = await ownerA("POST", `${base}/vouchers`, voucher);
  check("vouchers: same code twice -> 409 on the code field", r.status === 409 && !!r.body.error.fields?.code, r);
  r = await ownerA("POST", `${base}/vouchers`, { ...voucher, code: "BAD CODE" });
  check("vouchers: code with spaces -> 400", r.status === 400, r);
  r = await ownerA("POST", `${base}/vouchers`, { ...voucher, code: "ESPECIFICO", scope: "specific", targets: [] });
  check("vouchers: specific without targets -> 400", r.status === 400 && !!r.body.error.fields?.targets, r);

  r = await anon("PUT", `${base}/cart/voucher`, { token: cartToken, code: "bienvenida10" });
  check("cart voucher: minimum not reached -> reason, no discount",
    r.status === 200 && /mínimo/.test(r.body.voucher?.error ?? "") && r.body.discountTotal === 0, r.body);
  r = await anon("PUT", `${base}/cart`, { token: cartToken, lines: [{ variantId: S.variantId, quantity: 2 }] });
  check("cart voucher: 2 x 1200 = 2400 -> 10 % = 240",
    r.status === 200 && r.body.voucher?.error === null && r.body.discountTotal === 240, r.body);
  r = await anon("PUT", `${base}/cart/voucher`, { token: cartToken, code: "NOEXISTE" });
  check("cart voucher: unknown code -> reason", r.body.voucher?.error === "Este cupón no existe o ya no está activo", r.body);
  r = await anon("PUT", `${base}/cart/voucher`, { token: cartToken, code: "BIENVENIDA10" });

  const buyer = { name: "Invitada E2E", phone: "5359990020" };
  const shipping = { zoneId: A.zoneId, methodId: A.deliveryId, address: "Calle 23 #45" };
  r = await anon("POST", `${base}/checkout`, { idempotencyKey: key(), cartToken, customer: buyer, shipping });
  const order = r.body.order;
  check("checkout: 2400 - 240 + 200 = 2360 with the voucher",
    r.status === 201 && order?.subtotal === 2400 && order?.discountTotal === 240 && order?.total === 2360, r.body);
  check("checkout: public order lists list price and discounts",
    order?.lines?.[0]?.listPrice === 1500
      && order?.discounts?.map((d) => d.kind).sort().join(",") === "promotion,voucher", order);
  const { data: waOrder } = await service.from("orders").select("voucher_code").eq("id", r.body.orderId).single();
  check("checkout: order keeps the voucher code", waOrder?.voucher_code === "BIENVENIDA10", waOrder);
  check("checkout: WhatsApp text shows the discount",
    decodeURIComponent(order?.whatsappUrl ?? "").includes("Descuento (cupón BIENVENIDA10)"), order?.whatsappUrl);

  r = await anon("PUT", `${base}/cart`, { lines: [{ variantId: S.variantId, quantity: 2 }], mode: "add" });
  const cart2 = r.body.token;
  await anon("PUT", `${base}/cart/voucher`, { token: cart2, code: "BIENVENIDA10" });
  r = await anon("POST", `${base}/checkout`, { idempotencyKey: key(), cartToken: cart2, customer: buyer, shipping });
  check("checkout: the same phone again -> 422 voucher_invalid",
    r.status === 422 && r.body.error.code === "voucher_invalid" && r.body.error.message === "Ya usaste este cupón", r);

  // Race for the last use of a voucher: one order gets it, the other is rejected.
  r = await ownerA("POST", `${base}/vouchers`, { code: "UNICO", name: "Único", reward: "fixed", value: 100, usageLimit: 1 });
  const carts = [];
  for (const phone of ["5359990021", "5359990022"]) {
    const c = await anon("PUT", `${base}/cart`, { lines: [{ variantId: A.products.M.variantId, quantity: 1 }], mode: "add" });
    await anon("PUT", `${base}/cart/voucher`, { token: c.body.token, code: "UNICO" });
    carts.push({ token: c.body.token, phone });
  }
  const race = await Promise.all(
    carts.map((c) =>
      anon("POST", `${base}/checkout`, {
        idempotencyKey: key(), cartToken: c.token, customer: { name: "Carrera", phone: c.phone }, shipping,
      }),
    ),
  );
  const statuses = race.map((x) => x.status).sort().join(",");
  check("race: last use of UNICO -> one 201, one 422", statuses === "201,422", race.map((x) => [x.status, x.body?.error]));
  const { data: unico } = await service.from("vouchers").select("used_count").eq("store_id", storeA.id).eq("code", "UNICO").single();
  check("race: used_count is exactly 1", unico?.used_count === 1, unico);

  // Cancelling releases the use.
  const winner = race.find((x) => x.status === 201);
  r = await ownerA("POST", `${base}/orders/${winner.body.orderId}/cancel`, { reason: "E2E" });
  const { data: released } = await service.from("vouchers").select("used_count").eq("store_id", storeA.id).eq("code", "UNICO").single();
  check("cancel: releases the voucher use", r.status === 200 && released?.used_count === 0, [r.status, released]);

  // Admin "Nuevo pedido" with a voucher and a manual discount (staff can create orders).
  r = await staffA("POST", `${base}/orders`, {
    idempotencyKey: key(),
    customer: { name: "Cliente tienda", phone: "5359990023" },
    lines: [{ variantId: A.products.M.variantId, quantity: 2 }],
    shipping,
    voucherCode: "unico",
    manualDiscount: { reward: "fixed", value: 50, reason: "Cliente habitual" },
  });
  check("admin order: voucher 100 + manual 50 on 1800 (+200)",
    r.status === 201 && r.body.order?.discountTotal === 150 && r.body.order?.total === 1850,
    { status: r.status, discountTotal: r.body.order?.discountTotal, total: r.body.order?.total, discounts: r.body.order?.discounts });
  r = await anon("POST", `${base}/checkout`, {
    idempotencyKey: key(), cartToken: cart2, customer: { name: "X", phone: "5359990024" }, shipping,
    manualDiscount: { reward: "fixed", value: 500 },
  });
  check("storefront checkout ignores a manual discount in the body", r.status === 201 && r.body.order?.discountTotal === 240, r.body);

  // Module off: no prices change, admin endpoints 403, data kept.
  await service.from("store_modules").update({ enabled: false }).eq("store_id", storeA.id).eq("module_code", "discounts");
  r = await ownerA("POST", `${base}/promotions`, promo);
  check("module off: promotions -> 403 module_not_enabled", r.status === 403 && r.body.error.code === "module_not_enabled", r);
  r = await anon("PUT", `${base}/cart`, { lines: [{ variantId: S.variantId, quantity: 1 }], mode: "add" });
  check("module off: the cart uses the list price", r.status === 200 && r.body.lines[0]?.unitPrice === 1500, r.body);
  await service.from("store_modules").update({ enabled: true }).eq("store_id", storeA.id).eq("module_code", "discounts");

  // Delete: a used voucher is deactivated, a promotion goes away and prices come back.
  const { data: used } = await service.from("vouchers").select("id").eq("store_id", storeA.id).eq("code", "BIENVENIDA10").single();
  r = await ownerA("DELETE", `${base}/vouchers/${used.id}`);
  const { data: after } = await service.from("vouchers").select("is_active").eq("id", used.id).maybeSingle();
  check("delete a used voucher -> deactivated, kept", r.status === 204 && after?.is_active === false, [r.status, after]);
  r = await ownerB("DELETE", `${base}/promotions/${promoId}`);
  check("owner of B cannot delete A's promotion -> 403", r.status === 403, r);
  r = await ownerA("DELETE", `${base}/promotions/${promoId}`);
  check("delete the promotion -> list price in the storefront", r.status === 204 && (await minPrice(S.productId)) === 1500, r);
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
