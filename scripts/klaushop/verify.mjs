// Phase 8: compares the klauShop snapshot with what the Kshop store holds. Exit code 1 when something differs.
//
//   pnpm klaushop:verify [--store klau]

import { isValidSlug, kshopService, log, normalizePhone, parseArgs, readSnapshot, slugify } from "./lib.mjs";

const args = parseArgs();
const slug = args.store ?? "klau";
const snap = readSnapshot();
const db = kshopService();

const { data: store } = await db.from("stores").select("id, slug, name").eq("slug", slug).maybeSingle();
if (!store) {
  console.error(`Store ${slug} not found`);
  process.exit(1);
}

const results = [];
function check(name, expected, actual, { tolerance = 0 } = {}) {
  const ok =
    typeof expected === "number" && typeof actual === "number"
      ? Math.abs(expected - actual) <= tolerance
      : JSON.stringify(expected) === JSON.stringify(actual);
  results.push(ok);
  console.log(`${ok ? "ok" : "not ok"} - ${name}: klauShop ${JSON.stringify(expected)} / Kshop ${JSON.stringify(actual)}`);
}

async function count(table, filter = (q) => q) {
  const { count: n, error } = await filter(db.from(table).select("*", { count: "exact", head: true }).eq("store_id", store.id));
  if (error) throw error;
  return n ?? 0;
}

const legacy = async (entity) => {
  const { data, error } = await db.rpc("legacy_ids_list", { p_store_id: store.id, p_entity: entity });
  if (error) throw error;
  return new Map(data.map((r) => [r.legacy_id, r.new_id]));
};

// Catalogue
const productMap = await legacy("product");
check("products mapped", snap.products.length, productMap.size);
check("products published", snap.products.length, await count("products", (q) => q.eq("status", "published")));
const expectedVariants = snap.products.reduce((t, p) => t + p.combinations, 0);
check("variants", expectedVariants, await count("product_variants"));
const mediaById = new Map(snap.medias.map((m) => [m.id, m]));
const expectedImages = snap.products.reduce((t, p) => {
  const ids = new Set([p.featured_image_id, ...snap.product_medias.filter((m) => m.product_id === p.id).map((m) => m.media_id)]);
  return t + [...ids].filter((id) => mediaById.has(id)).length;
}, 0);
check("product images", expectedImages, await count("product_media"));
const reserved = new Map();
for (const r of snap.reservations) reserved.set(r.product_id, (reserved.get(r.product_id) ?? 0) + r.quantity);
const expectedStock = snap.products
  .filter((p) => p.combinations === 1)
  .reduce((t, p) => t + Math.max(Number(p.stock ?? 0) - (reserved.get(p.id) ?? 0), 0), 0);
const { data: stockRows } = await db.from("stocks").select("quantity").eq("store_id", store.id);
check("stock (single-option products; the rest is split by Klau)", expectedStock, (stockRows ?? []).reduce((t, s) => t + s.quantity, 0));
check("categories", snap.collections.length, await count("categories"));
check("product slugs kept", snap.products.filter((p) => isValidSlug(p.slug)).length,
  (await db.from("products").select("slug").eq("store_id", store.id)).data.filter((r) => snap.products.some((p) => p.slug === r.slug)).length);
const discountValues = new Set(snap.products.filter((p) => Number(p.discount) > 0).map((p) => Number(p.discount)));
check("promotions (one per discount %)", discountValues.size, await count("promotions"));
check("category slugs kept", snap.collections.length,
  (await db.from("categories").select("slug").eq("store_id", store.id)).data.filter((r) => snap.collections.some((c) => (isValidSlug(c.slug) ? c.slug : slugify(c.label)) === r.slug)).length);

// Customers
const withPhone = snap.profiles.filter((p) => normalizePhone(p.phone));
const distinctPhones = new Set(withPhone.map((p) => normalizePhone(p.phone)));
check("customers (profiles with phone, merged by phone)", distinctPhones.size, (await legacy("customer")).size);
check("addresses", snap.addresses.filter((a) => withPhone.some((p) => p.id === a.profile_id)).length, await count("customer_addresses"));
check("favorites", snap.wishlist.filter((w) => withPhone.some((p) => p.id === w.user_id)).length, await count("customer_favorites"));

// Orders
const orderMap = await legacy("order");
check("orders mapped", snap.orders.length, orderMap.size);
const { data: orders } = await db.from("orders").select("status, payment_status, total, subtotal, paid_total").eq("store_id", store.id);
const byStatus = (list, status) => list.filter((o) => (o.order_status ?? o.status) === status).length;
for (const status of ["pending_confirmation", "pending_payment", "paid", "processing", "shipped", "delivered", "cancelled"]) {
  const expected = byStatus(snap.orders, status);
  if (expected || byStatus(orders ?? [], status)) check(`orders ${status}`, expected, byStatus(orders ?? [], status));
}
const expectedAmount = snap.orders.reduce((t, o) => t + Number(o.amount), 0);
const actualAmount = (orders ?? []).reduce((t, o) => t + Number(o.total ?? o.subtotal), 0);
check("sum of order totals", Math.round(expectedAmount * 100) / 100, Math.round(actualAmount * 100) / 100, { tolerance: 0.01 * snap.orders.length });
const expectedPaid = snap.orders.filter((o) => o.payment_status === "paid").reduce((t, o) => t + Number(o.amount), 0);
const actualPaid = (orders ?? []).reduce((t, o) => t + Number(o.paid_total), 0);
check("sum paid", Math.round(expectedPaid * 100) / 100, Math.round(actualPaid * 100) / 100, { tolerance: 0.01 * snap.orders.length });
check("order lines", snap.order_lines.length, await count("order_lines"));

// Nothing the history must not create
check("WhatsApp notices queued by the import", 0, await count("notification_log"));
check("stock reservations", 0, await count("inventory_reservations"));
check("sale stock movements", 0, await count("stock_movements", (q) => q.in("type", ["sale", "cancel", "refund"])));

const failed = results.filter((r) => !r).length;
log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
