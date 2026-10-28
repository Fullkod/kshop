// Phase 8: imports the klauShop snapshot into a Kshop store, in batches, idempotent and resumable.
//
//   pnpm klaushop:import [--only structure|products|customers|orders|all] [--batch 20] [--pause 1500]
//                        [--dry-run] [--wipe] [--store klau]
//
// Reads only .klaushop-snapshot/snapshot.json (never klauShop) and writes to Kshop with the service role through the
// same SQL functions the admin uses (save_product, set_stock_quantity through it, refresh_promotions) plus the phase 8
// helpers (legacy_ids_*, import_legacy_order, legacy_wipe_store_data). Every created row is recorded in the legacy
// map, so a second run skips what exists and a run cut in the middle resumes where it stopped.
//
// --wipe removes everything a previous run created in the store (never the store, its owner, plan or theme) and
// the storage objects; it refuses the Demo store.

import sharp from "sharp";
import { randomUUID } from "node:crypto";
import {
  BADGE_LABELS,
  colorName,
  htmlToText,
  isValidSlug,
  klauStorageUrl,
  kshopService,
  log,
  money,
  normalizePhone,
  parseArgs,
  readSnapshot,
  sleep,
  slugify,
  variantKey,
  writeSnapshot,
} from "./lib.mjs";

const args = parseArgs();
const STEPS = ["structure", "products", "customers", "orders"];
const only = args.only && args.only !== "all" ? String(args.only).split(",") : STEPS;
for (const s of only) if (!STEPS.includes(s)) throw new Error(`--only: unknown step ${s}`);
const BATCH = Number(args.batch ?? 20);
const PAUSE = Number(args.pause ?? 1500);
const DRY = !!args["dry-run"];
const STORE_SLUG = args.store ?? "klau";

const snap = readSnapshot();
const db = kshopService();
const report = { started_at: new Date().toISOString(), store: STORE_SLUG, dry_run: DRY, steps: {}, problems: [] };
const problem = (text) => {
  report.problems.push(text);
  log("  !", text);
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const { data: store, error: storeError } = await db
  .from("stores")
  .select("id, slug, name, status, base_currency, whatsapp_phone")
  .eq("slug", STORE_SLUG)
  .maybeSingle();
if (storeError) throw storeError;
if (!store) throw new Error(`Store ${STORE_SLUG} does not exist: create it from the superadmin first`);
if (store.slug === "demo") throw new Error("Refusing to import into the Demo store");
const { data: ownerRow } = await db
  .from("store_members")
  .select("user_id")
  .eq("store_id", store.id)
  .eq("role", "owner")
  .limit(1)
  .maybeSingle();
if (!ownerRow) throw new Error("The store has no owner");
const OWNER = ownerRow.user_id;
log(`Store ${store.name} (${store.slug}, ${store.id}) · ${DRY ? "DRY RUN" : "writing"} · steps: ${only.join(", ")}`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function rpc(fn, params) {
  const { data, error } = await db.rpc(fn, params);
  if (error) throw new Error(`${fn}: ${error.message}${error.details ? ` (${error.details})` : ""}`);
  return data;
}

async function loadMap(entity) {
  const rows = await rpc("legacy_ids_list", { p_store_id: store.id, p_entity: entity });
  return new Map(rows.map((r) => [r.legacy_id, r.new_id]));
}

async function remember(map, entity, legacyId, newId) {
  map.set(legacyId, newId);
  if (DRY) return;
  await rpc("legacy_ids_put", { p_store_id: store.id, p_rows: [{ entity, legacy_id: legacyId, new_id: newId }] });
}

async function insert(table, row, select = "id") {
  if (DRY) return { id: randomUUID() };
  const { data, error } = await db.from(table).insert(row).select(select).single();
  if (error) throw new Error(`${table}: ${error.message}${error.details ? ` (${error.details})` : ""}`);
  return data;
}

const SIZES = { full: 1600, thumb: 480 };
const toWebp = (input, maxSide) =>
  sharp(input, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

/** Downloads a klauShop media, converts it like a browser upload and stores it in store-media. */
async function importImage(folder, key) {
  const source = klauStorageUrl(key);
  if (DRY) return { storageKey: `dry/${key}`, url: source, thumbUrl: source };
  const res = await fetch(source, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${source} -> ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  const [full, thumb] = await Promise.all([toWebp(input, SIZES.full), toWebp(input, SIZES.thumb)]);
  const base = `stores/${store.id}/${folder}/${randomUUID()}`;
  const bucket = db.storage.from("store-media");
  const keys = { full: `${base}-${SIZES.full}.webp`, thumb: `${base}-${SIZES.thumb}.webp` };
  const options = { contentType: "image/webp", cacheControl: "31536000", upsert: false };
  const [a, b] = await Promise.all([bucket.upload(keys.full, full, options), bucket.upload(keys.thumb, thumb, options)]);
  if (a.error || b.error) throw new Error(`upload ${key}: ${(a.error ?? b.error).message}`);
  return {
    storageKey: keys.full,
    url: bucket.getPublicUrl(keys.full).data.publicUrl,
    thumbUrl: bucket.getPublicUrl(keys.thumb).data.publicUrl,
    sourceUrl: source,
  };
}

const mediaById = new Map(snap.medias.map((m) => [m.id, m]));
const zoneById = new Map(snap.zones.map((z) => [z.id, z]));
const productById = new Map(snap.products.map((p) => [p.id, p]));
const reservedByProduct = new Map();
for (const r of snap.reservations) reservedByProduct.set(r.product_id, (reservedByProduct.get(r.product_id) ?? 0) + r.quantity);

async function pauseBetweenBatches(index, total) {
  if (index < total && PAUSE > 0 && !DRY) {
    log(`  … ${index}/${total}, pausing ${PAUSE} ms`);
    await sleep(PAUSE);
  }
}

// ---------------------------------------------------------------------------
// Wipe
// ---------------------------------------------------------------------------

if (args.wipe) {
  if (DRY) throw new Error("--wipe cannot be combined with --dry-run");
  log("Wiping the migrated data of the store…");
  const result = await rpc("legacy_wipe_store_data", { p_store_id: store.id });
  for (const userId of result.customer_user_ids ?? []) {
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) problem(`auth user ${userId} not deleted: ${error.message}`);
  }
  const bucket = db.storage.from("store-media");
  for (const folder of ["products", "categories", "banners"]) {
    for (;;) {
      const { data: objects, error } = await bucket.list(`stores/${store.id}/${folder}`, { limit: 1000 });
      if (error) throw error;
      if (!objects?.length) break;
      const { error: removeError } = await bucket.remove(objects.map((o) => `stores/${store.id}/${folder}/${o.name}`));
      if (removeError) throw removeError;
      if (objects.length < 1000) break;
    }
  }
  log(`Wiped: ${JSON.stringify(result.counts)}`);
}

// ---------------------------------------------------------------------------
// Structure: contact, zones and methods, payment methods, product type and attributes, categories, collections,
// home sections
// ---------------------------------------------------------------------------

const maps = {
  zone: await loadMap("zone"),
  category: await loadMap("category"),
  collection: await loadMap("collection"),
  product: await loadMap("product"),
  variant: await loadMap("variant"),
  media: await loadMap("media"),
  banner: await loadMap("banner"),
  promotion: await loadMap("promotion"),
  customer: await loadMap("customer"),
  address: await loadMap("address"),
  order: await loadMap("order"),
};

const structure = { typeId: null, attributes: {}, values: {}, collections: {}, deliveryMethodByZone: new Map(), toAgreeMethod: null };

async function ensureStructure() {
  // Existing pieces (resume).
  const { data: types } = await db.from("product_types").select("id, slug").eq("store_id", store.id);
  structure.typeId = types?.find((t) => t.slug === "ropa-y-accesorios")?.id ?? null;
  const { data: attrs } = await db.from("attributes").select("id, slug").eq("store_id", store.id);
  for (const a of attrs ?? []) structure.attributes[a.slug] = a.id;
  const { data: values } = await db.from("attribute_values").select("id, attribute_id, slug").eq("store_id", store.id);
  for (const v of values ?? []) structure.values[`${v.attribute_id}:${v.slug}`] = v.id;
  const { data: cols } = await db.from("collections").select("id, slug").eq("store_id", store.id);
  for (const c of cols ?? []) structure.collections[c.slug] = c.id;
  const { data: methods } = await db.from("shipping_methods").select("id, zone_id, type").eq("store_id", store.id);
  for (const m of methods ?? []) {
    if (m.type === "delivery" && m.zone_id) structure.deliveryMethodByZone.set(m.zone_id, m.id);
    if (m.type === "to_agree") structure.toAgreeMethod = m.id;
  }
}

async function importStructure() {
  const step = (report.steps.structure = { created: {} });
  const created = (k) => (step.created[k] = (step.created[k] ?? 0) + 1);

  // Notification contact: the store's WhatsApp receives the new orders (like klauShop's admin phone).
  const { count: contacts } = await db.from("store_notification_contacts").select("id", { count: "exact", head: true }).eq("store_id", store.id);
  if (!contacts && store.whatsapp_phone) {
    await insert("store_notification_contacts", { store_id: store.id, name: store.name, phone: store.whatsapp_phone, sort_order: 1 });
    created("notification_contact");
  }

  // Zones: one Kshop zone + one delivery method ("Mensajería", the klauShop cost) per klauShop zone.
  let sort = 0;
  for (const z of snap.zones) {
    sort++;
    if (maps.zone.has(z.id)) continue;
    const zone = await insert("shipping_zones", { store_id: store.id, name: z.name, sort_order: sort, is_active: z.is_active });
    const method = await insert("shipping_methods", {
      store_id: store.id,
      zone_id: zone.id,
      type: "delivery",
      name: "Mensajería",
      price: money(z.cost),
      sort_order: sort,
      is_active: z.is_active,
    });
    structure.deliveryMethodByZone.set(zone.id, method.id);
    await remember(maps.zone, "zone", z.id, zone.id);
    created("zone");
  }
  if (!structure.toAgreeMethod) {
    const method = await insert("shipping_methods", {
      store_id: store.id,
      zone_id: null,
      type: "to_agree",
      name: "Otra zona (precio a convenir)",
      price: 0,
      sort_order: snap.zones.length + 1,
    });
    structure.toAgreeMethod = method.id;
    created("shipping_method_to_agree");
  }

  // Payment methods (klauShop only knew "whatsapp": cash on delivery or transfer, agreed on WhatsApp).
  const { count: payments } = await db.from("payment_methods").select("id", { count: "exact", head: true }).eq("store_id", store.id);
  if (!payments) {
    await insert("payment_methods", { store_id: store.id, name: "Efectivo al recibir", currencies: [], instructions: "Pagas al recibir el pedido.", sort_order: 1 });
    await insert("payment_methods", { store_id: store.id, name: "Transferencia", currencies: ["CUP"], instructions: "Te enviamos los datos por WhatsApp y nos mandas el comprobante.", sort_order: 2 });
    created("payment_methods");
  }

  // Product type and the three variant attributes.
  if (!structure.typeId) {
    const type = await insert("product_types", { store_id: store.id, name: "Ropa y accesorios", slug: "ropa-y-accesorios", has_variants: true });
    structure.typeId = type.id;
    created("product_type");
  }
  const ATTRIBUTES = [
    { slug: "color", name: "Color", input_type: "swatch" },
    { slug: "talla", name: "Talla", input_type: "dropdown" },
    { slug: "material", name: "Material", input_type: "dropdown" },
  ];
  for (const [i, a] of ATTRIBUTES.entries()) {
    if (structure.attributes[a.slug]) continue;
    const attr = await insert("attributes", {
      store_id: store.id,
      name: a.name,
      slug: a.slug,
      input_type: a.input_type,
      filterable_in_storefront: true,
      sort_order: i + 1,
    });
    structure.attributes[a.slug] = attr.id;
    if (!DRY) {
      const { error } = await db.from("product_type_attributes").insert({
        store_id: store.id,
        product_type_id: structure.typeId,
        attribute_id: attr.id,
        scope: "variant",
        variant_selection: true,
        sort_order: i + 1,
      });
      if (error) throw error;
    }
    created("attribute");
  }
  // Attribute values from everything the products use.
  const colors = [...new Set(snap.products.flatMap((p) => p.colors.map((c) => c.toLowerCase())))];
  const sizes = [...new Set(snap.products.flatMap((p) => p.sizes))];
  const materials = [...new Set(snap.products.flatMap((p) => p.materials))];
  const ensureValue = async (attrSlug, name, value, order) => {
    const attributeId = structure.attributes[attrSlug];
    const slug = slugify(name, 60) || slugify(value, 60) || `v-${order}`;
    const key = `${attributeId}:${slug}`;
    if (structure.values[key]) return structure.values[key];
    const row = await insert("attribute_values", { store_id: store.id, attribute_id: attributeId, name, slug, value, sort_order: order });
    structure.values[key] = row.id;
    created("attribute_value");
    return row.id;
  };
  // Several hexes can share a name (two blacks): one value, the first hex as swatch.
  const colorValues = new Map();
  for (const hex of colors) {
    const name = colorName(hex);
    if (!colorValues.has(name)) colorValues.set(name, hex);
  }
  let order = 0;
  for (const [name, hex] of colorValues) await ensureValue("color", name, hex, ++order);
  order = 0;
  for (const s of sizes) await ensureValue("talla", s, null, ++order);
  order = 0;
  for (const m of materials) await ensureValue("material", m, null, ++order);

  // Categories from the klauShop collection tree (parents first), with their image.
  const pending = [...snap.collections];
  let guard = 0;
  while (pending.length && guard++ < 10) {
    for (const c of [...pending]) {
      if (c.parent_id && !maps.category.has(c.parent_id) && snap.collections.some((x) => x.id === c.parent_id)) continue;
      pending.splice(pending.indexOf(c), 1);
      if (maps.category.has(c.id)) continue;
      const slug = isValidSlug(c.slug) ? c.slug : slugify(c.label);
      let imageUrl = null;
      const media = mediaById.get(c.featured_image_id);
      if (media) {
        try {
          imageUrl = (await importImage("categories", media.key)).url;
        } catch (e) {
          problem(`category ${c.label}: image not imported (${e.message})`);
        }
      }
      const row = await insert("categories", {
        store_id: store.id,
        parent_id: c.parent_id ? (maps.category.get(c.parent_id) ?? null) : null,
        name: c.label,
        slug,
        description: c.description || null,
        image_url: imageUrl,
        sort_order: c.sort_order ?? 0,
      });
      await remember(maps.category, "category", c.id, row.id);
      created("category");
    }
  }

  // Manual collections for the klauShop badges and the featured flag; products join them in the next step.
  const COLLECTIONS = [
    { slug: "novedades", name: "Novedades" },
    { slug: "mas-vendidos", name: "Más vendidos" },
    { slug: "destacados", name: "Destacados" },
  ];
  for (const [i, c] of COLLECTIONS.entries()) {
    if (structure.collections[c.slug]) continue;
    const row = await insert("collections", { store_id: store.id, name: c.name, slug: c.slug, is_published: true, sort_order: i + 1 });
    structure.collections[c.slug] = row.id;
    created("collection");
  }

  // Home: category grid of the klauShop "show in home" collections, Novedades, one carousel per home category.
  const { count: sections } = await db.from("home_sections").select("id", { count: "exact", head: true }).eq("store_id", store.id);
  if (!sections) {
    const homeCategories = snap.collections.filter((c) => c.show_in_home).map((c) => maps.category.get(c.id)).filter(Boolean);
    let sortOrder = 1; // 0 is reserved for the hero slider (products step)
    await insert("home_sections", {
      store_id: store.id,
      type: "category_grid",
      title: "Categorías",
      settings: { categoryIds: homeCategories.slice(0, 12) },
      sort_order: sortOrder++,
    });
    await insert("home_sections", {
      store_id: store.id,
      type: "product_carousel",
      title: "Novedades",
      source_collection_id: structure.collections.novedades,
      settings: { limit: 8, sort: "newest" },
      sort_order: sortOrder++,
    });
    for (const c of snap.collections.filter((c) => c.show_in_home)) {
      const categoryId = maps.category.get(c.id);
      if (!categoryId) continue;
      await insert("home_sections", {
        store_id: store.id,
        type: "product_carousel",
        title: c.title || c.label,
        source_category_id: categoryId,
        settings: { limit: 8, sort: "newest" },
        sort_order: sortOrder++,
      });
    }
    created("home_sections");
  }
  log(`structure: ${JSON.stringify(step.created)}`);
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

function valueId(attrSlug, name, value) {
  const slug = slugify(name, 60) || slugify(value, 60);
  return structure.values[`${structure.attributes[attrSlug]}:${slug}`] ?? null;
}

function productVariants(p) {
  const colors = p.colors.length ? p.colors : [null];
  const sizes = p.sizes.length ? p.sizes : [null];
  const materials = p.materials.length ? p.materials : [null];
  const combos = [];
  const seen = new Set();
  for (const color of colors)
    for (const size of sizes)
      for (const material of materials) {
        const label = [color && colorName(color), size, material].filter(Boolean).join(" / ");
        const skuParts = [color && slugify(colorName(color), 20), size && slugify(size, 20), material && slugify(material, 20)].filter(Boolean);
        const sku = [p.id, ...skuParts].join("-").slice(0, 64);
        if (seen.has(label)) {
          problem(`product ${p.slug}: two options map to «${label}», one variant kept`);
          continue;
        }
        seen.add(label);
        const attributeValues = [];
        if (color) attributeValues.push({ attribute_id: structure.attributes.color, value_id: valueId("color", colorName(color), color) });
        if (size) attributeValues.push({ attribute_id: structure.attributes.talla, value_id: valueId("talla", size) });
        if (material) attributeValues.push({ attribute_id: structure.attributes.material, value_id: valueId("material", material) });
        combos.push({ key: variantKey(p.id, color, size, material), name: label, sku, attribute_values: attributeValues.filter((a) => a.value_id) });
      }
  return combos;
}

async function importProducts() {
  const step = (report.steps.products = { created: 0, skipped: 0, images: 0, stock_to_split: [] });
  const list = snap.products;
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    for (const p of batch) {
      if (maps.product.has(p.id)) {
        step.skipped++;
        continue;
      }
      const variants = productVariants(p);
      const reserved = reservedByProduct.get(p.id) ?? 0;
      const available = Math.max(Number(p.stock ?? 0) - reserved, 0);
      if (variants.length > 1) {
        step.stock_to_split.push({ name: p.name, slug: p.slug, stock: available, reserved, variants: variants.map((v) => v.name) });
      }
      const slug = isValidSlug(p.slug) ? p.slug : slugify(p.name);
      if (slug !== p.slug) problem(`product ${p.id}: slug «${p.slug}» replaced by «${slug}»`);
      const collectionIds = [
        p.badge === "new_product" && structure.collections.novedades,
        p.badge === "best_sale" && structure.collections["mas-vendidos"],
        (p.featured || p.badge === "featured") && structure.collections.destacados,
      ].filter(Boolean);
      const input = {
        product_type_id: structure.typeId,
        category_id: p.collection_id ? (maps.category.get(p.collection_id) ?? null) : null,
        name: p.name.slice(0, 200),
        slug,
        description: htmlToText(p.description).slice(0, 20_000),
        status: "published",
        featured: !!p.featured || p.badge === "featured",
        badge: p.badge ? BADGE_LABELS[p.badge] : null,
        tags: p.tags.slice(0, 30).map((t) => t.slice(0, 40)),
        collection_ids: collectionIds,
        attributes: [],
        variants: variants.map((v, index) => ({
          sku: v.sku,
          name: v.name,
          price: money(p.price),
          compare_at_price: null,
          track_inventory: true,
          stock: variants.length === 1 ? available : 0,
          sort_order: index,
          attribute_values: v.attribute_values,
        })),
      };
      let productId;
      if (DRY) productId = randomUUID();
      else productId = await rpc("save_product", { p_store_id: store.id, p_input: input, p_user_id: OWNER });
      if (!DRY) {
        // Keep the original date: the home's «newest» carousels and Finanzas follow it.
        const { error } = await db.from("products").update({ created_at: p.created_at, published_at: p.created_at }).eq("id", productId);
        if (error) problem(`product ${p.slug}: created_at not kept (${error.message})`);
      }
      await remember(maps.product, "product", p.id, productId);
      if (!DRY) {
        const { data: rows } = await db.from("product_variants").select("id, sku").eq("product_id", productId);
        const bySku = new Map((rows ?? []).map((r) => [r.sku, r.id]));
        const pairs = variants.filter((v) => bySku.has(v.sku)).map((v) => ({ entity: "variant", legacy_id: v.key, new_id: bySku.get(v.sku) }));
        if (pairs.length) await rpc("legacy_ids_put", { p_store_id: store.id, p_rows: pairs });
        for (const pair of pairs) maps.variant.set(pair.legacy_id, pair.new_id);
      }

      // Images: featured first, then the gallery by priority (each klauShop media once per product).
      const mediaIds = [p.featured_image_id, ...snap.product_medias.filter((m) => m.product_id === p.id).sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)).map((m) => m.media_id)];
      let sort = 0;
      for (const mediaId of [...new Set(mediaIds)]) {
        const media = mediaById.get(mediaId);
        if (!media) continue;
        const legacyKey = `${p.id}:${mediaId}`;
        if (maps.media.has(legacyKey)) continue;
        try {
          const image = await importImage("products", media.key);
          const row = await insert("product_media", {
            store_id: store.id,
            product_id: productId,
            storage_key: image.storageKey,
            url: image.url,
            thumb_url: image.thumbUrl,
            source_url: image.sourceUrl,
            alt: (media.alt || p.name).slice(0, 200),
            sort_order: sort++,
          });
          await remember(maps.media, "media", legacyKey, row.id);
          step.images++;
        } catch (e) {
          problem(`product ${p.slug}: image ${media.key} not imported (${e.message})`);
        }
      }
      step.created++;
      log(`  product ${step.created + step.skipped}/${list.length} ${p.slug} (${variants.length} variant${variants.length === 1 ? "" : "s"})`);
    }
    await pauseBetweenBatches(Math.min(i + BATCH, list.length), list.length);
  }

  // Promotions: one automatic percent promotion per distinct klauShop discount, targeting those products.
  const byDiscount = new Map();
  for (const p of snap.products) {
    const pct = Number(p.discount);
    if (pct > 0) byDiscount.set(pct, [...(byDiscount.get(pct) ?? []), p.id]);
  }
  for (const [pct, legacyIds] of byDiscount) {
    const legacyKey = `percent:${pct}`;
    let promotionId = maps.promotion.get(legacyKey);
    if (!promotionId) {
      const row = await insert("promotions", { store_id: store.id, name: `Rebaja ${pct} %`, reward: "percent", value: pct, is_active: true });
      promotionId = row.id;
      await remember(maps.promotion, "promotion", legacyKey, promotionId);
    }
    if (DRY) continue;
    const targets = legacyIds.map((id) => maps.product.get(id)).filter(Boolean).map((productId) => ({ store_id: store.id, promotion_id: promotionId, target_type: "product", target_id: productId }));
    const { error } = await db.from("promotion_targets").upsert(targets, { onConflict: "promotion_id,target_type,target_id", ignoreDuplicates: true });
    if (error) problem(`promotion ${pct} %: targets (${error.message})`);
  }
  if (byDiscount.size && !DRY) await rpc("refresh_promotions", { p_store_id: store.id });

  // Hero slider: the klauShop «show in slider» products as banners linking to the product.
  const sliderProducts = snap.products.filter((p) => p.show_in_slider);
  if (sliderProducts.length) {
    let { data: hero } = DRY ? { data: null } : await db.from("home_sections").select("id").eq("store_id", store.id).eq("type", "hero_slider").maybeSingle();
    if (!hero) hero = await insert("home_sections", { store_id: store.id, type: "hero_slider", title: null, settings: { autoplaySeconds: 6, whatsapp: false }, sort_order: 0 });
    let sort = 0;
    for (const p of sliderProducts) {
      sort++;
      if (maps.banner.has(p.id)) continue;
      const productId = maps.product.get(p.id);
      const { data: media } = DRY ? { data: null } : await db.from("product_media").select("url").eq("product_id", productId).order("sort_order").limit(1).maybeSingle();
      if (!productId || (!media && !DRY)) {
        problem(`slider: ${p.slug} has no image, banner skipped`);
        continue;
      }
      const banner = await insert("banners", {
        store_id: store.id,
        title: p.name.slice(0, 120),
        image_url: media?.url ?? "https://dry.run/image.webp",
        alt: p.name.slice(0, 200),
        link_type: "product",
        link_target_id: productId,
        product_id: productId,
        cta_label: "Ver producto",
        sort_order: sort,
      });
      if (!DRY) {
        const { error } = await db.from("home_section_banners").insert({ store_id: store.id, section_id: hero.id, banner_id: banner.id, sort_order: sort });
        if (error) problem(`slider: ${p.slug} not linked (${error.message})`);
      }
      await remember(maps.banner, "banner", p.id, banner.id);
    }
  }
  writeSnapshot("stock-to-split.json", step.stock_to_split);
  log(`products: ${step.created} created, ${step.skipped} already there, ${step.images} images; ${step.stock_to_split.length} products need their stock split by variant (stock-to-split.json)`);
}

// ---------------------------------------------------------------------------
// Customers: profiles with a phone (one account per phone), their addresses and favorites
// ---------------------------------------------------------------------------

function syntheticEmail(phone) {
  // Same rule as apps/web/src/server/customers/accounts.ts (sha256 of "store:phone", 24 hex chars).
  return import("node:crypto").then(({ createHash }) => {
    const hash = createHash("sha256").update(`${store.id}:${phone}`).digest("hex").slice(0, 24);
    return `c_${hash}@customers.kshop.fullkod.com`;
  });
}

function splitName(name) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "Cliente", last: null };
  return { first: parts[0].slice(0, 80), last: parts.slice(1).join(" ").slice(0, 80) || null };
}

async function importCustomers() {
  const step = (report.steps.customers = { created: 0, skipped: 0, merged: 0, without_phone: 0, addresses: 0, favorites: 0 });
  const byPhone = new Map();
  for (const profile of [...snap.profiles].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) {
    const phone = normalizePhone(profile.phone);
    if (!phone) {
      step.without_phone++;
      continue;
    }
    if (byPhone.has(phone)) step.merged++;
    byPhone.set(phone, [...(byPhone.get(phone) ?? []), profile]); // the most recent profile wins the name
  }
  const entries = [...byPhone.entries()];
  for (let i = 0; i < entries.length; i += BATCH) {
    for (const [phone, profiles] of entries.slice(i, i + BATCH)) {
      const main = profiles[profiles.length - 1];
      let customerId = profiles.map((p) => maps.customer.get(p.id)).find(Boolean);
      if (!customerId) {
        const { data: existing } = DRY ? { data: null } : await db.from("customers").select("id").eq("store_id", store.id).eq("phone", phone).maybeSingle();
        customerId = existing?.id;
      }
      if (!customerId) {
        const email = await syntheticEmail(phone);
        const { first, last } = splitName(main.name);
        if (DRY) customerId = randomUUID();
        else {
          const { data: created, error } = await db.auth.admin.createUser({
            email,
            password: randomUUID() + randomUUID(),
            email_confirm: true,
            app_metadata: { kind: "customer", store_id: store.id },
          });
          if (error) throw new Error(`auth user for ${phone}: ${error.message}`);
          const row = await insert("customers", {
            store_id: store.id,
            user_id: created.user.id,
            phone,
            email: main.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(main.email) ? main.email : null,
            first_name: first,
            last_name: last,
            created_at: main.created_at,
          });
          customerId = row.id;
        }
        step.created++;
      } else step.skipped++;
      for (const p of profiles) if (!maps.customer.has(p.id)) await remember(maps.customer, "customer", p.id, customerId);

      for (const a of snap.addresses.filter((x) => profiles.some((p) => p.id === x.profile_id))) {
        if (maps.address.has(a.id)) continue;
        const row = await insert("customer_addresses", {
          store_id: store.id,
          customer_id: customerId,
          label: (a.name || null)?.slice(0, 40) ?? null,
          recipient: (a.recipient_name || main.name || "Cliente").slice(0, 120),
          phone: normalizePhone(a.phone),
          shipping_zone_id: a.shipping_zone_id ? (maps.zone.get(a.shipping_zone_id) ?? null) : null,
          address: (a.full_address || a.zone || "Sin dirección").slice(0, 300),
          reference: [a.zone && !a.full_address?.includes(a.zone) ? a.zone : null, a.notes].filter(Boolean).join(" · ").slice(0, 300) || null,
          is_default: !!a.is_default,
          created_at: a.created_at,
        });
        await remember(maps.address, "address", a.id, row.id);
        step.addresses++;
      }
      const favorites = snap.wishlist.filter((w) => profiles.some((p) => p.id === w.user_id)).map((w) => maps.product.get(w.product_id)).filter(Boolean);
      if (favorites.length && !DRY) {
        const { error } = await db.from("customer_favorites").upsert(
          favorites.map((productId) => ({ store_id: store.id, customer_id: customerId, product_id: productId })),
          { onConflict: "store_id,customer_id,product_id", ignoreDuplicates: true },
        );
        if (error) problem(`favorites of ${phone}: ${error.message}`);
        else step.favorites += favorites.length;
      }
    }
    await pauseBetweenBatches(Math.min(i + BATCH, entries.length), entries.length);
  }
  log(`customers: ${JSON.stringify(step)}`);
}

// ---------------------------------------------------------------------------
// Orders: the whole history, chronological, through import_legacy_order
// ---------------------------------------------------------------------------

const PAYMENT_STATUS = { paid: "paid", unpaid: "unpaid", no_payment_required: "unpaid", refunded: "refunded" };

async function importOrders() {
  const step = (report.steps.orders = { created: 0, skipped: 0, lines_without_variant: 0, placeholder_phones: 0 });
  const { data: variantRows } = await db.from("product_variants").select("id, sku, name, product_id").eq("store_id", store.id);
  const variantById = new Map((variantRows ?? []).map((v) => [v.id, v]));
  const { data: productRows } = await db.from("products").select("id, name, primary_media_url").eq("store_id", store.id);
  const productRowById = new Map((productRows ?? []).map((p) => [p.id, p]));
  const { data: customerRows } = await db.from("customers").select("id, phone").eq("store_id", store.id);
  const customerByPhone = new Map((customerRows ?? []).map((c) => [c.phone, c.id]));
  const linesByOrder = new Map();
  for (const l of snap.order_lines) linesByOrder.set(l.order_id, [...(linesByOrder.get(l.order_id) ?? []), l]);

  const list = [...snap.orders].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1));
  for (let i = 0; i < list.length; i += BATCH) {
    for (const o of list.slice(i, i + BATCH)) {
      if (maps.order.has(o.id)) {
        step.skipped++;
        continue;
      }
      const data = o.customer_data ?? {};
      let phone = normalizePhone(o.phone ?? data.phone);
      if (!phone) {
        phone = "+5300000000";
        step.placeholder_phones++;
        problem(`order ${o.id}: phone «${o.phone ?? data.phone}» not valid, placeholder used`);
      }
      const lines = (linesByOrder.get(o.id) ?? []).map((l) => {
        const legacyProduct = productById.get(l.product_id);
        const variantId = maps.variant.get(variantKey(l.product_id, l.color, l.size, l.material)) ?? (legacyProduct?.combinations === 1 ? maps.variant.get(variantKey(l.product_id, null, null, null)) : null) ?? null;
        const variant = variantId ? variantById.get(variantId) : null;
        if (!variant) step.lines_without_variant++;
        const productId = maps.product.get(l.product_id) ?? null;
        const unit = money(l.price);
        const listPrice = l.list_price != null ? money(l.list_price) : unit;
        const attributes = [
          l.color && { name: "Color", value: colorName(l.color) },
          l.size && { name: "Talla", value: l.size },
          l.material && { name: "Material", value: l.material },
        ].filter(Boolean);
        return {
          legacy_id: l.id,
          variant_id: variant?.id ?? null,
          product_id: productId,
          product_name: legacyProduct?.name ?? "Producto",
          variant_name: variant?.name ?? attributes.map((a) => a.value).join(" / "),
          sku: variant?.sku ?? l.product_id,
          attributes,
          image_url: productRowById.get(productId)?.primary_media_url ?? null,
          quantity: l.quantity,
          unit_price: unit,
          unit_list_price: listPrice,
          compare_at_price: listPrice > unit ? listPrice : null,
          discount_amount: money(Math.max(listPrice - unit, 0) * l.quantity),
          line_total: money(unit * l.quantity),
        };
      });
      const linesTotal = money(lines.reduce((t, l) => t + l.line_total, 0));
      const toAgree = o.shipping_cost == null;
      // klauShop's amount is the total; without a shipping cost the difference (if any) is what was agreed.
      const shippingTotal = toAgree ? money(Math.max(Number(o.amount) - linesTotal, 0)) : money(o.shipping_cost);
      const zoneId = o.shipping_zone_id ? (maps.zone.get(o.shipping_zone_id) ?? null) : null;
      const zoneName = o.zone || data.zone || zoneById.get(o.shipping_zone_id)?.name || null;
      const payload = {
        legacy_id: o.id,
        legacy_number: `KS-${o.id.slice(-4).toUpperCase()}`,
        created_at: o.created_at,
        status: o.order_status ?? "pending_confirmation",
        payment_status: PAYMENT_STATUS[o.payment_status] ?? "unpaid",
        currency: (o.currency || "CUP").toUpperCase(),
        customer_id: customerByPhone.get(phone) ?? null,
        customer_name: (o.name || data.name || "Cliente").trim().slice(0, 120),
        customer_phone: phone,
        shipping_type: toAgree ? "to_agree" : "delivery",
        shipping_zone_id: zoneId,
        shipping_method_id: !toAgree && zoneId ? (structure.deliveryMethodByZone.get(zoneId) ?? null) : null,
        shipping_snapshot: Object.fromEntries(
          Object.entries({
            type: toAgree ? "to_agree" : "delivery",
            method: toAgree ? null : "Mensajería",
            zone: zoneName,
            address: data.address?.trim() || null,
            reference: data.notes?.trim() || null,
          }).filter(([, v]) => v != null),
        ),
        shipping_total: shippingTotal,
        payment_method_id: null,
        payment_snapshot: { name: o.payment_method === "whatsapp" ? "Acordado por WhatsApp" : o.payment_method || "Acordado por WhatsApp" },
        payment_reference: "klauShop",
        customer_note: data.notes?.trim() || null,
        lines,
      };
      if (!lines.length) problem(`order ${o.id}: no lines in klauShop`);
      if (DRY) maps.order.set(o.id, randomUUID());
      else {
        const result = await rpc("import_legacy_order", { p_store_id: store.id, p_payload: payload, p_user_id: OWNER });
        maps.order.set(o.id, result.order_id);
        if (!result.created) {
          step.skipped++;
          continue;
        }
      }
      step.created++;
    }
    log(`  orders ${Math.min(i + BATCH, list.length)}/${list.length}`);
    await pauseBetweenBatches(Math.min(i + BATCH, list.length), list.length);
  }
  log(`orders: ${JSON.stringify(step)}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const started = Date.now();
await ensureStructure();
if (only.includes("structure")) await importStructure();
if (only.includes("products")) {
  if (!structure.typeId) throw new Error("Run --only structure first");
  await importProducts();
}
if (only.includes("customers")) await importCustomers();
if (only.includes("orders")) await importOrders();
report.finished_at = new Date().toISOString();
report.seconds = Math.round((Date.now() - started) / 10) / 100;
writeSnapshot(`report-${DRY ? "dry-run" : "import"}.json`, report);
log(`done in ${report.seconds} s · ${report.problems.length} problem(s) · report in .klaushop-snapshot/`);
