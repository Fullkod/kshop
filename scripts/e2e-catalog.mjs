// Catalog API checks against the running app (pnpm dev) and the online Supabase project.
// Creates temporary stores cat-e2e-a (Base) and cat-e2e-b (Pro) with @e2e.kshop.test accounts and removes
// everything at the end (also on failure).
//
//   node scripts/e2e-catalog.mjs

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
  ownerA: "cat-owner-a@e2e.kshop.test",
  staffA: "cat-staff-a@e2e.kshop.test",
  ownerB: "cat-owner-b@e2e.kshop.test",
};
const SLUGS = ["cat-e2e-a", "cat-e2e-b"];

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
    if (Object.values(USERS).includes(u.email)) await service.auth.admin.deleteUser(u.id);
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

async function run() {
  await cleanup();
  const ids = {};
  for (const [key, email] of Object.entries(USERS)) {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    ids[key] = data.user.id;
  }
  const storeA = (
    await service
      .rpc("create_store", {
        p_name: "Cat E2E A",
        p_slug: SLUGS[0],
        p_owner_id: ids.ownerA,
        p_base_currency: "CUP",
        p_order_prefix: "CA",
        p_whatsapp_phone: null,
        p_plan_code: "base",
        p_trial_days: 0,
        p_platform_domain: "kshop.fullkod.com",
        p_created_by: null,
      })
      .single()
  ).data;
  const storeB = (
    await service
      .rpc("create_store", {
        p_name: "Cat E2E B",
        p_slug: SLUGS[1],
        p_owner_id: ids.ownerB,
        p_base_currency: "USD",
        p_order_prefix: "CB",
        p_whatsapp_phone: null,
        p_plan_code: "pro",
        p_trial_days: 0,
        p_platform_domain: "kshop.fullkod.com",
        p_created_by: null,
      })
      .single()
  ).data;
  await service.from("store_members").insert({ store_id: storeA.id, user_id: ids.staffA, role: "staff" });

  const anon = api(null);
  const ownerA = api(await token(USERS.ownerA));
  const staffA = api(await token(USERS.staffA));
  const ownerB = api(await token(USERS.ownerB));
  const A = `/stores/${storeA.id}/catalog`;
  const B = `/stores/${storeB.id}/catalog`;

  let r = await anon("POST", `${A}/brands`, { name: "X" });
  check("no token -> 401", r.status === 401, r);
  r = await staffA("POST", `${A}/brands`, { name: "Kaya" });
  check("staff cannot create brands (admin) -> 403", r.status === 403, r);
  r = await ownerB("POST", `${A}/brands`, { name: "Kaya" });
  check("owner of B cannot write in A -> 403", r.status === 403, r);
  r = await ownerA("POST", `${A}/unknown`, { name: "X" });
  check("unknown resource -> 404", r.status === 404, r);
  r = await ownerA("POST", `${A}/brands`, { name: "" });
  check("invalid input -> 400 with field errors", r.status === 400 && !!r.body.error.fields?.name, r);

  r = await ownerA("POST", `${A}/brands`, { name: "Kaya" });
  check("owner A creates a brand -> 201", r.status === 201, r);
  const brandId = r.body.id;
  r = await ownerA("POST", `${A}/brands`, { name: "Kaya" });
  check("duplicated slug -> 409 with slug field", r.status === 409 && !!r.body.error.fields?.slug, r);

  r = await ownerA("POST", `${A}/attributes`, {
    name: "Talla",
    inputType: "dropdown",
    values: [{ name: "S" }, { name: "M" }],
  });
  check("attribute with values -> 201", r.status === 201, r);
  const attrId = r.body.id;
  const { data: values } = await service
    .from("attribute_values")
    .select("id, slug")
    .eq("attribute_id", attrId)
    .order("sort_order");
  check("attribute values created in order", values?.map((v) => v.slug).join(",") === "s,m", values);

  r = await ownerA("POST", `${A}/product-types`, {
    name: "Ropa",
    hasVariants: true,
    attributes: [{ attributeId: attrId, scope: "variant", variantSelection: true }],
  });
  check("product type -> 201", r.status === 201, r);
  const typeId = r.body.id;

  r = await ownerA("POST", `${A}/categories`, { name: "Mujer" });
  const catId = r.body.id;
  r = await ownerA("POST", `${A}/categories`, { name: "Vestidos", parentId: catId });
  check("child category -> 201", r.status === 201, r);
  r = await ownerB("POST", `${B}/categories`, { name: "Hombre" });
  const catB = r.body.id;
  r = await ownerA("POST", `${A}/categories`, { name: "Cruzada", parentId: catB });
  check("parent from another store -> 400", r.status === 400, r);
  r = await ownerA("DELETE", `${A}/categories/${catId}`);
  check("category with children cannot be deleted -> 409", r.status === 409, r);

  const product = (sku, status = "draft") => ({
    productTypeId: typeId,
    categoryId: catId,
    brandId: brandId,
    name: `Vestido ${sku}`,
    slug: `vestido-${sku.toLowerCase()}`,
    status,
    tags: ["verano"],
    variants: values.map((v) => ({
      sku: `${sku}-${v.slug.toUpperCase()}`,
      price: 1500,
      stock: 3,
      cost: { price: 5, currency: "USD" },
      attributeValues: [{ attributeId: attrId, valueId: v.id }],
    })),
  });
  r = await staffA("POST", `${A}/products`, product("V1"));
  check("staff creates a product with 2 variants -> 201", r.status === 201, r);
  const productId = r.body.id;
  r = await ownerA("POST", `${A}/products`, product("V1"));
  check("duplicated SKU -> 409", r.status === 409 && /SKU|URL/.test(r.body.error.message), r);
  r = await ownerB("PUT", `${B}/products/${productId}`, product("V1"));
  check(
    "owner B cannot update A's product through B -> rejected (400/404)",
    r.status === 400 || r.status === 404,
    r,
  );

  const { data: variants } = await service
    .from("product_variants")
    .select("id, sku")
    .eq("product_id", productId)
    .order("sort_order");
  const keep = {
    ...product("V1", "published"),
    variants: [{ ...product("V1").variants[0], id: variants[0].id }],
  };
  r = await ownerA("PUT", `${A}/products/${productId}`, keep);
  check("update keeps 1 variant and publishes -> 200", r.status === 200, r);
  const { count } = await service
    .from("product_variants")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  check("removed variant is gone", count === 1, count);

  const { data: whA } = await service.from("warehouses").select("id").eq("store_id", storeA.id).single();
  const { data: whB } = await service.from("warehouses").select("id").eq("store_id", storeB.id).single();
  r = await staffA("PUT", `${A}/stock`, { variantId: variants[0].id, warehouseId: whA.id, quantity: 10 });
  check("set stock -> 200", r.status === 200 && r.body.quantity === 10, r);
  r = await staffA("PUT", `${A}/stock`, { variantId: variants[0].id, warehouseId: whB.id, quantity: 10 });
  check("stock in another store's warehouse -> 400", r.status === 400, r);
  const { data: moves } = await service
    .from("stock_movements")
    .select("quantity")
    .eq("variant_id", variants[0].id);
  check(
    "stock movements recorded (+3, +7)",
    moves
      ?.map((m) => m.quantity)
      .sort()
      .join(",") === "3,7",
    moves,
  );

  r = await ownerA("POST", `${A}/warehouses`, { name: "Otro" });
  check(
    "Base: second warehouse -> 403 module_not_enabled",
    r.status === 403 && r.body.error.code === "module_not_enabled",
    r,
  );
  r = await ownerB("POST", `${B}/warehouses`, { name: "Otro" });
  check("Pro: second warehouse -> 201", r.status === 201, r);
  r = await ownerA("PUT", `${A}/currencies`, { currency: "USD", rateToBase: 300, sells: true });
  check("Base: extra sale currency -> 403", r.status === 403, r);
  r = await ownerA("PUT", `${A}/currencies`, { currency: "USD", rateToBase: 300, sells: false });
  check("Base: cost-only currency -> 200", r.status === 200 && r.body.rateToBase === 300, r);
  r = await ownerB("PUT", `${B}/currencies`, {
    currency: "CUP",
    rateToBase: 0.0033,
    sells: true,
    rounding: 5,
  });
  check("Pro: extra sale currency -> 200", r.status === 200, r);

  r = await staffA("POST", `${A}/products/status`, { productIds: [productId], status: "archived" });
  check("bulk status -> updated 1", r.status === 200 && r.body.updated === 1, r);
  r = await staffA("POST", `${A}/products/${productId}/media`, {
    storageKey: `stores/${storeB.id}/products/x-1600.webp`,
    url: "https://evil.example.com/x.webp",
  });
  check("media from another store / URL -> 400", r.status === 400, r);
  r = await staffA("DELETE", `${A}/products/${productId}`);
  check("staff cannot delete products (admin) -> 403", r.status === 403, r);
  r = await ownerA("DELETE", `${A}/products/${productId}`);
  check("owner deletes the product -> 204", r.status === 204, r);

  // Storefront content (phase 2): admins of the store only, store-scoped references.
  const CA = `/stores/${storeA.id}/content`;
  const CB = `/stores/${storeB.id}/content`;
  const media = (storeId) =>
    `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/store-media/stores/${storeId}/banners/x-1920.webp`;
  r = await staffA("PUT", `${CA}/theme`, { preset: "warm" });
  check("content: staff cannot change the theme -> 403", r.status === 403, r);
  r = await ownerB("PUT", `${CA}/theme`, { preset: "warm" });
  check("content: owner of B cannot change A -> 403", r.status === 403, r);
  r = await ownerA("PUT", `${CA}/theme`, { preset: "nope" });
  check("content: invalid preset -> 400", r.status === 400, r);
  r = await ownerA("PUT", `${CA}/theme`, { preset: "warm", colors: { accent: "#112233" } });
  check("content: theme saved -> 200", r.status === 200 && r.body.theme.colors.accent === "#112233", r);
  r = await ownerA("POST", `${CA}/banners`, { imageUrl: media(storeB.id) });
  check("content: banner image of another store -> 400", r.status === 400, r);
  r = await ownerA("POST", `${CA}/banners`, {
    imageUrl: media(storeA.id),
    link: { type: "url", url: "javascript:x" },
  });
  check("content: banner link must be http(s) or a path -> 400", r.status === 400, r);
  r = await ownerB("POST", `${CB}/banners`, { imageUrl: media(storeB.id), title: "B" });
  check("content: banner of B -> 201", r.status === 201, r);
  const bannerB = r.body.id;
  r = await ownerA("POST", `${CA}/sections`, { type: "banner", bannerIds: [bannerB] });
  check("content: section of A with a banner of B -> 4xx", r.status >= 400 && r.status < 500, r);
  r = await ownerA("POST", `${CA}/sections`, { type: "rich_text", settings: { markdown: "**Hola**" } });
  check("content: rich text section -> 201", r.status === 201, r);
  r = await ownerA("POST", `${CA}/pages`, { title: "Envíos", slug: "envios", isPublished: true });
  check("content: page -> 201", r.status === 201, r);
  const pageId = r.body.id;
  r = await ownerA("POST", `${CA}/pages`, { title: "Otra", slug: "envios" });
  check("content: duplicated page slug -> 409", r.status === 409, r);
  r = await ownerA("PUT", `${CA}/menus/header`, {
    items: [{ label: "Envíos", link: { type: "page", targetId: pageId }, children: [] }],
  });
  check("content: header menu -> 204", r.status === 204, r);
  r = await ownerA("PUT", `${CA}/menus/sidebar`, { items: [] });
  check("content: unknown menu -> 400", r.status === 400, r);
  r = await ownerA("POST", `${A}/collections`, { name: "Ofertas", rules: {} });
  check("content: automatic collection without rules -> 400", r.status === 400, r);
  r = await ownerA("POST", `${A}/collections`, { name: "Ofertas", rules: { onSale: true } });
  check("content: automatic collection -> 201", r.status === 201, r);

  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}

try {
  await run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup();
}
