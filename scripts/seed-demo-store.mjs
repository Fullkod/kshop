// Creates (or repairs) the permanent test store "Tienda Demo" (http://demo.kshop.localhost:3000) on plan Pro,
// with an owner and a staff account. Idempotent: run it again to recreate whatever is missing and to reset the
// passwords to the ones in .env.local (DEMO_OWNER_PASSWORD / DEMO_STAFF_PASSWORD, generated on first run).
//
//   pnpm demo:seed
//
// Accounts use the reserved .test TLD (no real inbox). `pnpm e2e:cleanup` never touches them.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

function loadEnv() {
  const env = { ...process.env };
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !env[match[1]]) env[match[1]] = match[2].trim();
    }
  }
  return env;
}

let env = loadEnv();
const additions = [];
if (!env.DEMO_OWNER_PASSWORD) additions.push(`DEMO_OWNER_PASSWORD=${randomBytes(12).toString("base64url")}`);
if (!env.DEMO_STAFF_PASSWORD) additions.push(`DEMO_STAFF_PASSWORD=${randomBytes(12).toString("base64url")}`);
if (additions.length) {
  appendFileSync(
    envPath,
    `\n# Permanent test store "Tienda Demo" (pnpm demo:seed)\n${additions.join("\n")}\n`,
  );
  env = loadEnv();
}

export const DEMO = {
  slug: "demo",
  name: "Tienda Demo",
  owner: "dueno@demo.kshop.test",
  staff: "empleado@demo.kshop.test",
};

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureUser(email, password) {
  const { data, error } = await service.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((u) => u.email === email);
  if (existing) {
    const { error: updateError } = await service.auth.admin.updateUserById(existing.id, { password });
    if (updateError) throw updateError;
    return existing.id;
  }
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw createError;
  return created.user.id;
}

const ownerId = await ensureUser(DEMO.owner, env.DEMO_OWNER_PASSWORD);
const staffId = await ensureUser(DEMO.staff, env.DEMO_STAFF_PASSWORD);

let { data: store, error } = await service
  .from("stores")
  .select("id, status")
  .eq("slug", DEMO.slug)
  .maybeSingle();
if (error) throw error;

if (!store) {
  const result = await service
    .rpc("create_store", {
      p_name: DEMO.name,
      p_slug: DEMO.slug,
      p_owner_id: ownerId,
      p_base_currency: "CUP",
      p_order_prefix: "DEMO",
      p_whatsapp_phone: "+5352564206",
      p_plan_code: "pro",
      p_trial_days: 0,
      p_platform_domain: env.PLATFORM_CANONICAL_DOMAIN ?? "kshop.fullkod.com",
      p_created_by: null,
    })
    .single();
  if (result.error) throw result.error;
  store = result.data;
  console.log(`Created store ${DEMO.name} (${store.id})`);
} else {
  if (store.status !== "active") {
    const { error: statusError } = await service
      .from("stores")
      .update({ status: "active" })
      .eq("id", store.id);
    if (statusError) throw statusError;
  }
  console.log(`Store ${DEMO.name} already exists (${store.id})`);
}

// The platform's test store is never billed (phase 5): courtesy, Pro.
{
  const { error: compedError } = await service.rpc("subscription_update", {
    p_store_id: store.id,
    p_patch: { comped: true, notes: "Tienda de pruebas de la plataforma" },
    p_actor: null,
  });
  if (compedError) throw compedError;
}

const { error: memberError } = await service
  .from("store_members")
  .upsert(
    { store_id: store.id, user_id: staffId, role: "staff" },
    { onConflict: "store_id,user_id", ignoreDuplicates: true },
  );
if (memberError) throw memberError;

// Checkout options (phase 3), created only when the store has none, so the staff can edit them freely.
// PostgREST bulk inserts send null for keys missing in a row (no column default): every row has every key.
const { count: zoneCount } = await service
  .from("shipping_zones")
  .select("id", { count: "exact", head: true })
  .eq("store_id", store.id);
if (!zoneCount) {
  const { data: zones, error: zonesError } = await service
    .from("shipping_zones")
    .insert([
      { store_id: store.id, name: "La Habana", sort_order: 1 },
      { store_id: store.id, name: "Mayabeque y Artemisa", sort_order: 2 },
    ])
    .select("id, name");
  if (zonesError) throw zonesError;
  const habana = zones.find((z) => z.name === "La Habana").id;
  const other = zones.find((z) => z.name !== "La Habana").id;
  const { data: warehouse } = await service
    .from("warehouses")
    .update({ is_pickup_point: true, address: "Calle 23 #100, Vedado" })
    .eq("store_id", store.id)
    .eq("is_default", true)
    .select("id")
    .single();
  const { error: methodsError } = await service.from("shipping_methods").insert([
    {
      store_id: store.id,
      zone_id: habana,
      type: "delivery",
      name: "Mensajería",
      price: 500,
      free_over_subtotal: 20000,
      min_days: 1,
      max_days: 2,
      warehouse_id: null,
      sort_order: 1,
    },
    {
      store_id: store.id,
      zone_id: other,
      type: "to_agree",
      name: "Mensajería (precio a convenir)",
      price: 0,
      warehouse_id: null,
      sort_order: 2,
    },
    {
      store_id: store.id,
      zone_id: null,
      type: "pickup",
      name: "Recoger en la tienda",
      price: 0,
      warehouse_id: warehouse.id,
      sort_order: 3,
    },
  ]);
  if (methodsError) throw methodsError;
  const { error: paymentsError } = await service.from("payment_methods").insert([
    {
      store_id: store.id,
      name: "Efectivo al recibir",
      currencies: [],
      instructions: "Pagas al recibir el pedido.",
      sort_order: 1,
    },
    {
      store_id: store.id,
      name: "Transferencia",
      currencies: ["CUP"],
      instructions: "Transfiere a la tarjeta que te enviamos por WhatsApp y manda el comprobante.",
      sort_order: 2,
    },
    {
      store_id: store.id,
      name: "Zelle",
      currencies: ["USD"],
      instructions: "Te enviamos los datos de Zelle por WhatsApp.",
      sort_order: 3,
    },
  ]);
  if (paymentsError) throw paymentsError;
  console.log("Created shipping zones, shipping methods and payment methods");
}

// Discounts (phase 4): a -20 % promotion on «Vestidos» and the voucher BIENVENIDA10, only when the store has none.
const { count: promoCount } = await service
  .from("promotions")
  .select("id", { count: "exact", head: true })
  .eq("store_id", store.id);
if (!promoCount) {
  const { data: category } = await service
    .from("categories")
    .select("id")
    .eq("store_id", store.id)
    .eq("slug", "vestidos")
    .maybeSingle();
  if (category) {
    const { data: promo, error: promoError } = await service
      .from("promotions")
      .insert({ store_id: store.id, name: "Rebajas de vestidos", reward: "percent", value: 20 })
      .select("id")
      .single();
    if (promoError) throw promoError;
    const { error: targetError } = await service.from("promotion_targets").insert({
      store_id: store.id,
      promotion_id: promo.id,
      target_type: "category",
      target_id: category.id,
    });
    if (targetError) throw targetError;
    const { error: refreshError } = await service.rpc("refresh_promotions", { p_store_id: store.id });
    if (refreshError) throw refreshError;
    console.log("Created the promotion «Rebajas de vestidos» (-20 % on Vestidos)");
  }
}
const { error: voucherError } = await service.from("vouchers").upsert(
  {
    store_id: store.id,
    code: "BIENVENIDA10",
    name: "Bienvenida",
    scope: "order",
    reward: "percent",
    value: 10,
    min_subtotal: 2000,
    usage_per_customer: 1,
  },
  { onConflict: "store_id,code", ignoreDuplicates: true },
);
if (voucherError) throw voucherError;

// WhatsApp notices (phase 4): the store's WhatsApp gets the new orders and is shown to customers.
const { error: contactError } = await service.from("store_notification_contacts").upsert(
  {
    store_id: store.id,
    name: "Tienda Demo",
    phone: "+5353077035",
    notify_new_order: true,
    show_to_customer: true,
  },
  { onConflict: "store_id,phone", ignoreDuplicates: true },
);
if (contactError) throw contactError;

// Pro (phase 6): zones served by each warehouse, a USD rate history and a custom domain waiting for DNS. Only what
// is missing, so the staff can change it freely.
{
  const { count: servedCount } = await service
    .from("warehouse_shipping_zones")
    .select("zone_id", { count: "exact", head: true })
    .eq("store_id", store.id);
  const { data: warehouses } = await service
    .from("warehouses")
    .select("id, is_default")
    .eq("store_id", store.id)
    .eq("is_active", true)
    .order("is_default", { ascending: false });
  const { data: zones } = await service.from("shipping_zones").select("id, name").eq("store_id", store.id);
  if (!servedCount && warehouses?.length > 1 && zones?.length) {
    const [main, second] = warehouses;
    for (const zone of zones) {
      const order = zone.name === "La Habana" ? [main.id, second.id] : [second.id, main.id];
      const { error } = await service.rpc("set_zone_warehouses", {
        p_store_id: store.id,
        p_zone_id: zone.id,
        p_warehouse_ids: order,
      });
      if (error) throw error;
    }
    console.log("Set the warehouses that serve each zone");
  }

  // The USD rate the history belongs to (a fresh database, e.g. the local one of R11, does not have it yet).
  const { error: usdError } = await service
    .from("store_currencies")
    .upsert(
      { store_id: store.id, currency: "USD", is_base: false, sells: true, rate_to_base: 300 },
      { onConflict: "store_id,currency", ignoreDuplicates: true },
    );
  if (usdError) throw usdError;

  const { count: historyCount } = await service
    .from("currency_rate_history")
    .select("id", { count: "exact", head: true })
    .eq("store_id", store.id)
    .eq("currency", "USD");
  if (historyCount < 3) {
    const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
    const { error } = await service.from("currency_rate_history").insert([
      { store_id: store.id, currency: "USD", rate: 280, set_by: ownerId, set_at: daysAgo(45) },
      { store_id: store.id, currency: "USD", rate: 290, set_by: ownerId, set_at: daysAgo(20) },
    ]);
    if (error) throw error;
    console.log("Added the USD rate history (280 → 290 → current)");
  }

  // Pending on purpose: the database is shared with production, and a verified domain would send the real
  // demo.kshop.fullkod.com storefront to a .localhost host. Verify it by hand in local dev if needed.
  const { error: domainError } = await service.from("store_domains").upsert(
    {
      store_id: store.id,
      domain: "demo-tienda.localhost",
      type: "custom",
      status: "pending",
      dns_records: [
        { type: "A", name: "@", value: "76.76.21.21" },
        { type: "CNAME", name: "www", value: "cname.vercel-dns.com" },
      ],
      requested_by: ownerId,
    },
    { onConflict: "domain", ignoreDuplicates: true },
  );
  if (domainError) throw domainError;
}

// Home of the redesign (R5): every section type, as in docs/design-v2/referencias/TiendaPortada.dc.html. Built once
// (when the home has no «Opiniones» section yet) from what the store has: its photos, categories and products. Later
// runs only keep the countdown alive, so the staff can change the home freely.
{
  const { data: hasHome } = await service
    .from("home_sections")
    .select("id")
    .eq("store_id", store.id)
    .eq("type", "testimonials")
    .limit(1);
  const nextWeek = () => new Date(Date.now() + 6 * 86_400_000).toISOString();

  if (!hasHome?.length) {
    // By slug and by its last part («mujer-blusas» is also «blusas»).
    const categories = Object.fromEntries(
      ((await service.from("categories").select("id, slug").eq("store_id", store.id)).data ?? []).flatMap(
        (c) => [
          [c.slug.split("-").at(-1), c.id],
          [c.slug, c.id],
        ],
      ),
    );
    // Photos already in the store's media (banners and product photos), so the demo uploads nothing.
    const { data: media } = await service
      .from("product_media")
      .select("url, products!inner(id, slug, status)")
      .eq("store_id", store.id)
      .eq("products.status", "published")
      .order("sort_order")
      .limit(20);
    const photos = [...new Map((media ?? []).map((m) => [m.products.slug, m])).values()];
    const photo = (i) => photos[i % Math.max(photos.length, 1)]?.url ?? null;
    const { data: oldBanner } = await service
      .from("banners")
      .select("id, title, image_url")
      .eq("store_id", store.id)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    const { data: featured } = await service
      .from("products")
      .select("id")
      .eq("store_id", store.id)
      .eq("slug", "vestido-nandu")
      .maybeSingle();

    // Brands and automatic collections for the brand strip and the collection cards.
    for (const name of ["Lino Habana", "Brisa", "Malecón", "Sol Caribe"]) {
      const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");
      const { error: brandError } = await service
        .from("brands")
        .upsert({ store_id: store.id, name, slug }, { onConflict: "store_id,slug", ignoreDuplicates: true });
      if (brandError) throw brandError;
    }
    const collectionDefs = [
      { slug: "vestidos-de-verano", name: "Vestidos de verano", rules: { categoryId: categories.vestidos } },
      { slug: "blusas-y-camisas", name: "Blusas y camisas", rules: { categoryId: categories.blusas } },
      { slug: "recien-llegados", name: "Recién llegados", rules: { newerThanDays: 365 } },
    ].filter((c) => Object.values(c.rules).every(Boolean));
    for (const [i, c] of collectionDefs.entries()) {
      const { error: colError } = await service
        .from("collections")
        .upsert(
          { store_id: store.id, ...c, image_url: photo(i), sort_order: 10 + i },
          { onConflict: "store_id,slug", ignoreDuplicates: true },
        );
      if (colError) throw colError;
    }
    const collections = (
      (await service.from("collections").select("id, slug").eq("store_id", store.id)).data ?? []
    ).filter((c) => collectionDefs.some((d) => d.slug === c.slug));
    for (const [slug, i] of [
      ["vestidos", 0],
      ["blusas", 1],
    ]) {
      if (categories[slug] && photo(i)) {
        await service
          .from("categories")
          .update({ image_url: photo(i) })
          .eq("id", categories[slug])
          .is("image_url", null);
      }
    }

    // Banners: three hero slides and the photo of the mosaic.
    const link = (type, id) => (id ? { link_type: type, link_target_id: id } : {});
    const bannerRows = [
      {
        eyebrow: "Nueva temporada",
        title: "Colores que se quedan contigo",
        subtitle: "Vestidos, blusas y complementos de lino. Pide hoy y recíbelo en casa.",
        cta_label: "Ver colección",
        image_url: photo(0),
        product_id: featured?.id ?? null,
        ...link("collection", collections[0]?.id),
      },
      {
        eyebrow: "Rebajas",
        title: "Vestidos con un 20 % menos",
        subtitle: "Solo esta semana, en todas las tallas que quedan.",
        cta_label: "Ver ofertas",
        image_url: photo(0),
        link_type: "url",
        link_url: "/products?sale=1",
      },
      {
        eyebrow: "Para cada día",
        title: "Blusas frescas para el calor",
        subtitle: "Algodón y lino, en colores de verano.",
        cta_label: "Ver blusas",
        image_url: photo(1),
        ...link("category", categories.blusas),
      },
      {
        eyebrow: "Colección",
        title: "Verano en lino",
        cta_label: "Descubrir",
        image_url: photo(2),
        ...link("collection", collections[0]?.id),
      },
    ].filter((b) => b.image_url);
    const { data: banners, error: bannerError } = await service
      .from("banners")
      .insert(bannerRows.map((b, i) => ({ store_id: store.id, sort_order: 10 + i, alt: b.title, ...b })))
      .select("id, title");
    if (bannerError) throw bannerError;
    const bannerId = (title) => banners.find((b) => b.title === title)?.id;

    // The old home (one plain banner) is replaced by the full one; the old banner stays as the simple banner.
    await service.from("home_sections").delete().eq("store_id", store.id);
    const sections = [
      {
        type: "announcement_bar",
        settings: {
          text: "Envío gratis en La Habana desde 20 000 CUP",
          secondaryText: "Pagas al recibir",
          linkLabel: "Ver ofertas",
          link: { type: "url", url: "/products?sale=1" },
          icon: "truck",
        },
      },
      {
        type: "hero_slider",
        settings: { autoplaySeconds: 6, whatsapp: true },
        banners: [
          "Colores que se quedan contigo",
          "Vestidos con un 20 % menos",
          "Blusas frescas para el calor",
        ],
      },
      {
        type: "benefits",
        settings: {
          items: [
            { icon: "truck", title: "Envío a domicilio", text: "En La Habana en 1–2 días" },
            { icon: "banknote", title: "Paga al recibir", text: "Efectivo o transferencia" },
            { icon: "message-circle", title: "Pide por WhatsApp", text: "Te respondemos al momento" },
            { icon: "store", title: "Recoge en la tienda", text: "Calle 23, Vedado" },
          ],
        },
      },
      {
        type: "category_grid",
        title: "Compra por categoría",
        settings: {
          eyebrow: "Explora",
          categoryIds: ["vestidos", "blusas", "faldas", "complementos", "mujer"].flatMap(
            (s) => categories[s] ?? [],
          ),
        },
      },
      {
        type: "product_carousel",
        title: "Novedades de la semana",
        settings: { eyebrow: "Recién llegados", limit: 8, sort: "newest" },
      },
      {
        type: "banner_mosaic",
        banners: ["Verano en lino"],
        settings: {
          block: {
            eyebrow: "Solo esta semana",
            title: "Hasta -20 % en vestidos",
            text: "Todos los vestidos con su precio rebajado, mientras queden tallas.",
            ctaLabel: "Ver ofertas",
            link: { type: "url", url: "/products?sale=1" },
            bigText: "20%",
          },
        },
      },
      {
        type: "offer_countdown",
        title: "Rebajas de vestidos hasta el domingo",
        settings: {
          eyebrow: "Oferta flash",
          text: "Vestidos de verano con descuento. Unidades limitadas.",
          limit: 3,
        },
        ends_at: nextWeek(),
      },
      featured && {
        type: "featured_product",
        settings: { eyebrow: "Producto destacado", productId: featured.id, badge: "Más vendido" },
      },
      collections.length >= 2 && {
        type: "collection_cards",
        title: "Colecciones",
        settings: { eyebrow: "Para cada momento", collectionIds: collections.map((c) => c.id) },
      },
      { type: "brand_strip", title: "Marcas que vendemos", settings: {} },
      oldBanner && { type: "banner", settings: {}, bannerIds: [oldBanner.id] },
      {
        type: "testimonials",
        title: "Lo que dicen nuestros clientes",
        settings: {
          eyebrow: "Opiniones",
          items: [
            {
              quote:
                "Pedí el vestido por WhatsApp a las diez y a las cinco ya lo tenía en casa. La talla, perfecta.",
              name: "Yanet Rodríguez",
              place: "Plaza",
              product: "Vestido Ñandú",
              rating: 5,
            },
            {
              quote:
                "Me gusta que se paga al recibir. La blusa es igual que en la foto y la tela es fresquita.",
              name: "Dayana Pérez",
              place: "Playa",
              product: "una blusa de lino",
              rating: 5,
            },
            {
              quote:
                "Buena atención y me ayudaron a escoger la talla. Repetiré para el cumpleaños de mi madre.",
              name: "Lisandra Gómez",
              place: "Centro Habana",
              product: "una falda",
              rating: 4,
            },
          ],
          summary: { rating: 4.9, count: 312 },
        },
      },
      {
        type: "rich_text",
        title: "Una tienda de barrio, ahora en tu teléfono",
        settings: {
          eyebrow: "Sobre nosotros",
          markdown:
            "Empezamos vendiendo ropa a los vecinos y hoy llevamos moda a toda La Habana. Elige, pide por WhatsApp y paga cuando lo recibas.",
          linkLabel: "Ver la tienda",
          link: { type: "url", url: "/products" },
        },
      },
    ].filter(Boolean);
    for (const [index, s] of sections.entries()) {
      const { data: row, error: sectionError } = await service
        .from("home_sections")
        .insert({
          store_id: store.id,
          type: s.type,
          title: s.title ?? null,
          settings: s.settings,
          ends_at: s.ends_at ?? null,
          sort_order: index,
        })
        .select("id")
        .single();
      if (sectionError) throw sectionError;
      const ids = s.bannerIds ?? (s.banners ?? []).map(bannerId).filter(Boolean);
      if (ids.length) {
        const { error: linkError } = await service
          .from("home_section_banners")
          .insert(
            ids.map((banner_id, sort_order) => ({
              store_id: store.id,
              section_id: row.id,
              banner_id,
              sort_order,
            })),
          );
        if (linkError) throw linkError;
      }
    }
    console.log(`Built the home with ${sections.length} sections`);
  }

  await spreadBrands();

  // Brands without products take a few of the most common brand's, so no brand page of the strip is empty.
  async function spreadBrands() {
    const { data: brands } = await service.from("brands").select("id, name").eq("store_id", store.id);
    const { data: products } = await service
      .from("products")
      .select("id, brand_id, slug")
      .eq("store_id", store.id)
      .eq("status", "published")
      .neq("slug", "vestido-nandu")
      .order("created_at", { ascending: false })
      .limit(1000);
    const counts = new Map((brands ?? []).map((b) => [b.id, 0]));
    for (const p of products ?? []) if (p.brand_id) counts.set(p.brand_id, (counts.get(p.brand_id) ?? 0) + 1);
    const [biggest] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const pool = (products ?? []).filter((p) => p.brand_id === biggest?.[0]);
    for (const [brandId, count] of counts) {
      if (count > 0) continue;
      const ids = pool.splice(0, 6).map((p) => p.id);
      if (ids.length) await service.from("products").update({ brand_id: brandId }).in("id", ids);
    }
  }

  // The countdown of the demo never runs out: an expired one starts again for another week.
  const { data: expired } = await service
    .from("home_sections")
    .update({ ends_at: nextWeek() })
    .eq("store_id", store.id)
    .eq("type", "offer_countdown")
    .lt("ends_at", new Date().toISOString())
    .select("id");
  if (expired?.length) console.log("Restarted the countdown of the offer");
}

console.log(`Owner: ${DEMO.owner} (DEMO_OWNER_PASSWORD) · Staff: ${DEMO.staff} (DEMO_STAFF_PASSWORD)`);
console.log("Admin: http://demo.kshop.localhost:3000/admin");
