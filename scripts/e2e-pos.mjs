// POS API checks against the running app (pnpm dev) and the online project, in temporary stores (deleted at the end):
// the catalog for the phone, uploading sales (repeating one, no stock, another day), section visibility and suspension.
//
//   pnpm e2e:pos   (E2E_APP_URL for another port)
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !env[match[1]]) env[match[1]] = match[2].trim();
}

const APP = env.E2E_APP_URL ?? "http://localhost:3000";
const PASSWORD = randomBytes(12).toString("base64url");
const USERS = { ownerA: "pos-owner-a@e2e.kshop.test", staffA: "pos-staff-a@e2e.kshop.test", ownerB: "pos-owner-b@e2e.kshop.test" };
const SLUGS = ["pos-e2e-a", "pos-e2e-b"];

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
function check(name, ok, detail) {
  results.push(ok);
  console.log(`${ok ? "ok" : "not ok"} - ${name}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail).slice(0, 400)})`}`);
}

async function cleanup() {
  await service.from("stores").delete().in("slug", SLUGS);
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (Object.values(USERS).includes(u.email)) await service.auth.admin.deleteUser(u.id);
  }
}

async function client(email) {
  const auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return async (method, path, body) => {
    const res = await fetch(`${APP}/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
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

const deviceId = randomUUID();
const sale = (variant, quantity, unitPrice, extra = {}) => ({
  id: randomUUID(),
  deviceId,
  localNumber: "C-0001",
  soldAt: new Date().toISOString(),
  lines: [{ variantId: variant, quantity, unitPrice, productName: "Arroz" }],
  payments: [{ amount: quantity * unitPrice }],
  ...extra,
});

async function run() {
  await cleanup();
  const ids = {};
  for (const [key, email] of Object.entries(USERS)) {
    const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    ids[key] = data.user.id;
  }
  const storeA = await createStore("POS E2E A", SLUGS[0], ids.ownerA, "PA", "base");
  const storeB = await createStore("POS E2E B", SLUGS[1], ids.ownerB, "PB", "pro");
  await service.from("store_members").insert({ store_id: storeA.id, user_id: ids.staffA, role: "staff" });
  const { data: type } = await service.from("product_types").insert({ store_id: storeA.id, name: "Simple", slug: "simple" }).select("id").single();
  await service.rpc("save_product", {
    p_store_id: storeA.id,
    p_input: {
      product_type_id: type.id,
      name: "Arroz",
      slug: "arroz",
      status: "published",
      variants: [{ sku: "ARROZ", price: 1000, stock: 5, cost: { price: 700, currency: "CUP" } }],
    },
    p_user_id: ids.ownerA,
  });
  const { data: variant } = await service.from("product_variants").select("id").eq("store_id", storeA.id).single();

  const [ownerA, staffA, ownerB] = await Promise.all([client(USERS.ownerA), client(USERS.staffA), client(USERS.ownerB)]);
  const A = `/stores/${storeA.id}/pos`;

  // Catalog.
  let r = await staffA("GET", `${A}/catalog`);
  check("catalog: staff reads it, with the currency", r.status === 200 && r.body.currency === "CUP" && r.body.items.length === 1, r);
  check("catalog: price and stock of the variant", r.body.items[0]?.price === 1000 && r.body.items[0]?.stock === 5, r.body.items);
  check("catalog: no cost in the response", !/cost/i.test(JSON.stringify(r.body)), r.body);
  check("catalog: the first page brings the payment methods", Array.isArray(r.body.paymentMethods), r.body);
  r = await ownerB("GET", `${A}/catalog`);
  check("catalog of A from B -> 403", r.status === 403, r);
  r = await staffA("GET", `${A}/catalog?limit=abc`);
  check("catalog: bad limit -> 400", r.status === 400, r);

  // Upload.
  const first = sale(variant.id, 2, 1000, {
    payments: [{ amount: 5, currency: "USD", rate: 200 }, { amount: 1000 }],
    soldAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  });
  r = await staffA("POST", `${A}/sales`, { sales: [first] });
  const recorded = r.body.results?.[0];
  check("upload: recorded", r.status === 200 && recorded?.status === "recorded" && recorded.created === true, r);
  const { data: order } = await service.from("orders").select("*").eq("id", recorded.orderId).single();
  check("upload: counter sale delivered and paid", order.channel === "pos" && order.status === "delivered" && order.payment_status === "paid", order);
  check("upload: without phone and without notifying", order.customer_phone === null && order.notify_customer === false, order);
  check("upload: dated when it was sold", new Date(order.created_at).getTime() === new Date(first.soldAt).getTime(), order.created_at);
  const stock = async () => (await service.from("stocks").select("quantity").eq("variant_id", variant.id).single()).data.quantity;
  check("upload: discounts the stock", (await stock()) === 3);

  r = await staffA("POST", `${A}/sales`, { sales: [first] });
  check("repeat: same order, nothing created", r.body.results[0].orderId === recorded.orderId && r.body.results[0].created === false, r);
  check("repeat: the stock does not move", (await stock()) === 3);
  const { count } = await service.from("orders").select("*", { count: "exact", head: true }).eq("store_id", storeA.id);
  check("repeat: still one order", count === 1, count);

  const [same1, same2] = await Promise.all([
    staffA("POST", `${A}/sales`, { sales: [(first.id = randomUUID()) && first] }),
    staffA("POST", `${A}/sales`, { sales: [first] }),
  ]);
  check(
    "repeat at the same time: one order",
    same1.body.results[0].orderId === same2.body.results[0].orderId &&
      same1.body.results[0].created !== same2.body.results[0].created,
    [same1.body, same2.body],
  );

  r = await staffA("POST", `${A}/sales`, { sales: [sale(variant.id, 9, 1000)] });
  check("no stock: recorded and noted", r.body.results[0].status === "recorded" && r.body.results[0].flags.some((f) => f.type === "stock_shortfall"), r);
  check("no stock: never negative", (await stock()) === 0);

  r = await staffA("POST", `${A}/sales`, { sales: [sale(variant.id, 1, 700)] });
  const cheap = await service.from("order_lines").select("unit_price").eq("order_id", r.body.results[0].orderId).single();
  check("another price: keeps what was charged", Number(cheap.data.unit_price) === 700 && r.body.results[0].flags.some((f) => f.type === "price_mismatch"), r);

  const bad = sale(variant.id, 1, 1000, { payments: [{ amount: 5, currency: "USD" }] });
  const good = sale(variant.id, 1, 1000);
  r = await staffA("POST", `${A}/sales`, { sales: [bad, good] });
  check("a refused sale does not stop the others", r.body.results[0].status === "rejected" && r.body.results[1].status === "recorded", r);

  r = await staffA("POST", `${A}/sales`, { sales: Array.from({ length: 21 }, () => sale(variant.id, 1, 1000)) });
  check("more than 20 in a batch -> 400", r.status === 400, r);

  // It counts like any other order.
  r = await staffA("GET", `/stores/${storeA.id}/orders/sales-today`);
  check("sales today: counted", r.status === 200 && r.body.orders.length > 0, r);

  // A cancelled sale gives everything back.
  const { data: before } = await service.from("orders").select("id").eq("id", recorded.orderId).single();
  r = await ownerA("POST", `/stores/${storeA.id}/orders/${before.id}/cancel`, { reason: "Error" });
  const { data: gone } = await service.from("orders").select("status, paid_total").eq("id", before.id).single();
  check("cancel a counter sale", r.status === 200 && gone.status === "cancelled" && Number(gone.paid_total) === 0, gone);
  check("cancel: the stock comes back", (await stock()) === 2, await stock());

  // Isolation and gates.
  r = await ownerB("POST", `${A}/sales`, { sales: [sale(variant.id, 1, 1000)] });
  check("sales of A from B -> 403", r.status === 403, r);
  r = await ownerB("POST", `/stores/${storeB.id}/pos/sales`, { sales: [sale(variant.id, 1, 1000)] });
  const foreign = await service.from("order_lines").select("variant_id").eq("order_id", r.body.results[0].orderId).single();
  check("a variant of A sold from B stays out of A", r.status === 200 && foreign.data.variant_id === null, foreign.data);
  check("... and A keeps its stock", (await stock()) === 2, await stock());

  await service.from("store_section_settings").insert({ store_id: storeA.id, section: "pos", visibility: "managed" });
  r = await staffA("POST", `${A}/sales`, { sales: [sale(variant.id, 1, 1000)] });
  check("section managed: the staff cannot upload -> 403", r.status === 403 && r.body.error.code === "section_managed", r);
  await service.from("store_section_settings").delete().eq("store_id", storeA.id);

  await service.from("stores").update({ status: "suspended" }).eq("id", storeA.id);
  r = await staffA("POST", `${A}/sales`, { sales: [sale(variant.id, 1, 1000)] });
  check("suspended store: refused, the phone keeps the sale", r.status >= 400 && r.status < 500, r);
}

try {
  await run();
} finally {
  await cleanup();
}
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed${failed ? `, ${failed} failed` : ""}`);
process.exit(failed ? 1 : 0);
