// Phase 8.1: read-only dump of klauShop into .klaushop-snapshot/ (git-ignored) and an inventory report.
//
//   pnpm klaushop:export
//
// Reads through the Management API inside a `read only` transaction (KLAUSHOP_PROJECT_REF + KLAUSHOP_ACCESS_TOKEN):
// nothing can be written in klauShop by this script. The import never reads klauShop again: it works from the snapshot.

import { jsonArray, jsonObject, klauTable, log, normalizePhone, writeSnapshot, isValidSlug } from "./lib.mjs";

const started = Date.now();
log("Reading klauShop (read only)…");

const [
  products,
  medias,
  productMedias,
  collections,
  zones,
  profiles,
  addresses,
  orders,
  orderLines,
  reservations,
  wishlist,
] = await Promise.all([
  klauTable(
    "products",
    "id, name, slug, description, featured, show_in_slider, badge, tags, images, price, discount, created_at, stock, colors, sizes, materials, collection_id, featured_image_id",
    { order: "created_at, id" },
  ),
  klauTable("medias", "id, key, alt"),
  klauTable("product_medias", 'id, "productId" as product_id, "mediaId" as media_id, priority'),
  klauTable(
    "collections",
    'id, label, slug, title, description, "order" as sort_order, featured_image_id, parent_id, show_in_home',
  ),
  klauTable("shipping_zones", "id, name, cost, is_active"),
  klauTable("profiles", "id, name, email, phone, is_admin, created_at"),
  klauTable(
    "address",
    'id, "userProfileId" as profile_id, name, recipient_name, phone, zone, shipping_zone_id, full_address, notes, is_default, created_at',
  ),
  klauTable(
    "orders",
    "id, amount, currency, email, name, user_id, order_status, payment_status, payment_method, customer_data, phone, zone, shipping_zone_id, shipping_cost, created_at",
    { order: "created_at, id" },
  ),
  klauTable(
    "order_lines",
    'id, product_id, "orderId" as order_id, quantity, price, list_price, discount, color, size, material, created_at',
    { order: "created_at, id" },
  ),
  klauTable("inventory_reservations", "id, order_id, product_id, color, size, material, quantity, status", {
    where: "status = 'active'",
  }),
  klauTable("wishlist", "product_id, user_id, created_at", { order: "created_at" }),
]);

// Normalise the double-encoded JSON columns once, here.
for (const p of products) {
  p.tags = jsonArray(p.tags);
  p.images = jsonArray(p.images);
  p.colors = jsonArray(p.colors);
  p.sizes = jsonArray(p.sizes);
  p.materials = jsonArray(p.materials);
  p.combinations = Math.max(p.colors.length, 1) * Math.max(p.sizes.length, 1) * Math.max(p.materials.length, 1);
}
for (const o of orders) o.customer_data = jsonObject(o.customer_data);

const snapshot = {
  exported_at: new Date().toISOString(),
  source: "klauShop",
  products,
  medias,
  product_medias: productMedias,
  collections,
  zones,
  profiles,
  addresses,
  orders,
  order_lines: orderLines,
  reservations,
  wishlist,
};
writeSnapshot("snapshot.json", snapshot);

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

const count = (arr, fn) => arr.filter(fn).length;
const sum = (arr, fn) => arr.reduce((t, x) => t + Number(fn(x) ?? 0), 0);
const mediaById = new Map(medias.map((m) => [m.id, m]));
const imagesPerProduct = products.map((p) => {
  const ids = new Set([p.featured_image_id, ...productMedias.filter((m) => m.product_id === p.id).map((m) => m.media_id)]);
  return [...ids].filter((id) => mediaById.has(id)).length;
});
const reservedByProduct = new Map();
for (const r of reservations) reservedByProduct.set(r.product_id, (reservedByProduct.get(r.product_id) ?? 0) + r.quantity);

const combos = {};
for (const p of products) combos[p.combinations] = (combos[p.combinations] ?? 0) + 1;

const byStatus = {};
for (const o of orders) {
  const key = `${o.order_status}/${o.payment_status}`;
  byStatus[key] ??= { orders: 0, amount: 0 };
  byStatus[key].orders++;
  byStatus[key].amount += Number(o.amount);
}

const phones = profiles.map((p) => normalizePhone(p.phone)).filter(Boolean);
const duplicatePhones = [...new Set(phones.filter((p, i) => phones.indexOf(p) !== i))];
const orderPhones = orders.map((o) => normalizePhone(o.phone ?? o.customer_data?.phone));

const inventory = {
  exported_at: snapshot.exported_at,
  products: {
    total: products.length,
    with_discount: count(products, (p) => Number(p.discount) > 0),
    featured: count(products, (p) => p.featured),
    in_slider: count(products, (p) => p.show_in_slider),
    badged: count(products, (p) => !!p.badge),
    without_collection: count(products, (p) => !p.collection_id),
    invalid_slugs: products.filter((p) => !isValidSlug(p.slug)).map((p) => p.slug),
    stock_total: sum(products, (p) => p.stock),
    stock_reserved_active: sum(reservations, (r) => r.quantity),
    combinations: combos,
    stock_to_split: products
      .filter((p) => p.combinations > 1)
      .map((p) => ({
        name: p.name,
        slug: p.slug,
        stock: p.stock,
        reserved: reservedByProduct.get(p.id) ?? 0,
        combinations: p.combinations,
      })),
    images_total: imagesPerProduct.reduce((a, b) => a + b, 0),
    products_without_image: imagesPerProduct.filter((n) => n === 0).length,
    distinct_colors: [...new Set(products.flatMap((p) => p.colors))].length,
    distinct_sizes: [...new Set(products.flatMap((p) => p.sizes))],
    distinct_materials: [...new Set(products.flatMap((p) => p.materials))],
  },
  collections: { total: collections.length, roots: count(collections, (c) => !c.parent_id), in_home: count(collections, (c) => c.show_in_home) },
  zones: zones.map((z) => `${z.name} (${z.cost})`),
  profiles: {
    total: profiles.length,
    with_phone: phones.length,
    without_phone: profiles.length - phones.length,
    duplicate_phones: duplicatePhones,
    addresses: addresses.length,
    wishlist: wishlist.length,
  },
  orders: {
    total: orders.length,
    by_status: byStatus,
    amount_total: sum(orders, (o) => o.amount),
    lines: orderLines.length,
    lines_with_options: count(orderLines, (l) => l.color || l.size || l.material),
    guests: count(orders, (o) => !o.user_id),
    distinct_phones: new Set(orderPhones.filter(Boolean)).size,
    invalid_phones: orders.filter((o, i) => !orderPhones[i]).map((o) => o.id),
    without_zone_id: count(orders, (o) => !o.shipping_zone_id),
    shipping_to_agree: count(orders, (o) => o.shipping_cost == null),
  },
};
writeSnapshot("manifest.json", inventory);

console.log(JSON.stringify(inventory, null, 2));
log(`Snapshot written to .klaushop-snapshot/ in ${((Date.now() - started) / 1000).toFixed(1)} s`);
