// Browser QA of the phase 7 apps: the store app bundle of the Tienda Demo and the admin app in Chromium at 390 px
// (the same React code the APKs run; native plugins fall back to the web). Needs `pnpm dev` (API) and the Vite
// servers of both apps:
//   pnpm --filter @kshop/store-app dev        (http://localhost:5173, KSHOP_STORE=demo)
//   pnpm --filter @kshop/admin-app dev        (http://localhost:5174)
//   pnpm qa:apps
// 1. Home, listing, product, cart and checkout as a guest → the order is created with channel «app».
// 2. Sign up and «Mi cuenta» (session kept by the app).
// 3. Offline: a page seen before is shown from the device with «Sin conexión».
// 4. app_info (intercepted): newer version → «Actualizar»; no mobile_app → not available; suspended store.
// 5. Admin app: the owner signs in, confirms the app order, changes a stock and uploads a photo (file); the staff
//    member does not see costs; without the catalog module (entitlements intercepted) «Productos» is gone.
// Screenshots in .titan/qa/fase-7/. The QA order is cancelled, the stock and photos put back and the QA customer
// deleted at the end.

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const line of existsSync(join(root, ".env.local"))
  ? readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
  : []) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !env[match[1]]) env[match[1]] = match[2].trim();
}

const APP = env.QA_STORE_APP_URL ?? "http://localhost:5173";
const ADMIN = env.QA_ADMIN_APP_URL ?? "http://localhost:5174";
const OUT = join(root, ".titan/qa/fase-7");
const GUEST_PHONE = "5359990700";
const PHONE = "5359990701";
const PASSWORD = "qa-apps-2026";
mkdirSync(OUT, { recursive: true });

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: store } = await service.from("stores").select("id").eq("slug", "demo").single();
const { data: product } = await service
  .from("products")
  .select("id")
  .eq("store_id", store.id)
  .eq("slug", "vestido-nandu")
  .single();
const { data: variants } = await service.from("product_variants").select("id").eq("product_id", product.id);
const variantIds = variants.map((v) => v.id);
const { data: stockBefore } = await service
  .from("stocks")
  .select("variant_id, warehouse_id, quantity")
  .in("variant_id", variantIds);
const { data: mediaBefore } = await service.from("product_media").select("id").eq("product_id", product.id);
const startedAt = new Date().toISOString();

const results = [];
function check(name, ok, detail) {
  results.push(ok);
  console.log(
    `${ok ? "ok" : "not ok"} - ${name}${ok || detail === undefined ? "" : ` (${String(detail).slice(0, 400)})`}`,
  );
}

function chromiumPath() {
  if (env.QA_CHROMIUM_PATH) return env.QA_CHROMIUM_PATH;
  const cache = join(env.LOCALAPPDATA ?? join(env.HOME ?? "", ".cache"), "ms-playwright");
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)) : [];
  dirs.sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const dir of dirs) {
    for (const exe of [
      "chrome-win64/chrome.exe",
      "chrome-linux/chrome",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    ]) {
      if (existsSync(join(cache, dir, exe))) return join(cache, dir, exe);
    }
  }
  throw new Error(
    `No Chromium in ${cache}; install one (npx playwright install chromium) or set QA_CHROMIUM_PATH`,
  );
}

async function removeQaCustomers() {
  const { data } = await service
    .from("customers")
    .select("user_id")
    .eq("store_id", store.id)
    .eq("phone", `+${PHONE}`);
  for (const c of data ?? []) await service.auth.admin.deleteUser(c.user_id);
}

await removeQaCustomers();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const errors = [];
async function newPhone() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${page.url()} :: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${page.url()} :: ${e.message}`));
  page.on(
    "response",
    (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.request().method()} ${r.url()}`),
  );
  return page;
}
const shot = (page, name) =>
  page.screenshot({ path: join(OUT, `qa-${name}.png`), fullPage: false, caret: "initial" });
/** app_info answered by the test (D10, D15). */
const fakeAppInfo = (page, body) =>
  page.route("**/rest/v1/rpc/app_info", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }),
  );

/** Admin app signed in as a staff member of the Tienda Demo (picks it when the account has several stores). */
async function signIn(email, password, screenshot, setup) {
  const page = await newPhone();
  if (setup) await setup(page);
  await page.goto(ADMIN);
  await page.fill("#email", email);
  await page.fill("#password", password);
  if (screenshot) await shot(page, screenshot);
  await page.getByRole("button", { name: "Entrar" }).click();
  const picker = page.getByTestId("store-picker");
  const storeName = page.getByTestId("admin-store-name");
  await Promise.race([picker.waitFor({ timeout: 30000 }), storeName.waitFor({ timeout: 30000 })]);
  if (await picker.isVisible()) await picker.getByRole("button", { name: /Tienda Demo/ }).click();
  await storeName.waitFor({ timeout: 30000 });
  return page;
}

const phone = await newPhone();

try {
  // 1. Browse and buy as a guest.
  await phone.goto(APP);
  await phone.getByRole("heading", { name: "Tienda Demo" }).waitFor({ state: "attached", timeout: 30000 });
  await phone.locator("main img").first().waitFor({ timeout: 30000 });
  check("home: the store's sections", true);
  await shot(phone, "01-app-portada-390");

  await phone.goto(`${APP}/products`);
  await phone
    .getByText(/\d+ productos?/)
    .first()
    .waitFor({ timeout: 30000 });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("listing: products and no horizontal scroll", overflow <= 1, overflow);
  await shot(phone, "02-app-listado-390");

  await phone.goto(`${APP}/product/vestido-nandu`);
  await phone.getByRole("button", { name: "Añadir al carrito" }).click();
  await phone
    .getByText(/añadido|en el carrito/i)
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => null);
  await shot(phone, "03-app-producto-390");

  await phone.goto(`${APP}/checkout`);
  await phone.getByLabel("Zona").waitFor({ timeout: 20000 });
  await phone.fill("#name", "QA App Invitada");
  await phone.fill("#phone", GUEST_PHONE);
  await phone.getByLabel("Zona").selectOption({ label: "La Habana" });
  await phone
    .getByRole("radio", { name: /Mensajería/ })
    .first()
    .check();
  await phone.fill("#address", "Calle 10 #200, Vedado");
  await shot(phone, "04-app-checkout-390");
  await phone.getByRole("button", { name: "Confirmar pedido" }).click();
  await phone.waitForURL(/\/order\/[0-9a-f-]+\?new=1/, { timeout: 30000 });
  const token = new URL(phone.url()).pathname.split("/").pop();
  const { data: order } = await service
    .from("orders")
    .select("id, channel")
    .eq("public_token", token)
    .single();
  check("checkout: the order is created with channel «app»", order?.channel === "app", order?.channel);
  const sendToWhatsapp = phone.getByRole("link", { name: "Enviar pedido por WhatsApp" });
  await sendToWhatsapp.waitFor({ timeout: 20000 });
  check(
    "order page: «Enviar pedido por WhatsApp» opens wa.me",
    (await sendToWhatsapp.getAttribute("href"))?.startsWith("https://wa.me/"),
  );
  await shot(phone, "05-app-pedido-390");

  // 2. Account.
  await phone.goto(`${APP}/account/register`);
  await phone.fill("#firstName", "Clienta QA App");
  await phone.fill("#phone", PHONE);
  await phone.fill("#password", PASSWORD);
  await phone.click("button[type=submit]");
  await phone.waitForURL(`${APP}/account`, { timeout: 30000 });
  await phone.getByText("+53 5999 0701").first().waitFor({ timeout: 15000 });
  await phone.reload();
  await phone.getByText("+53 5999 0701").first().waitFor({ timeout: 15000 });
  check("account: signs up and the session survives a restart", true);
  await shot(phone, "06-app-cuenta-390");

  // 3. Offline: back to a page read before, served from the device.
  await phone.goto(`${APP}/products`);
  await phone
    .getByText(/\d+ productos?/)
    .first()
    .waitFor({ timeout: 30000 });
  await phone.context().setOffline(true);
  await phone.getByRole("link", { name: "Inicio" }).first().click();
  await phone.getByTestId("offline").waitFor({ timeout: 15000 });
  const imagesOffline = await phone.locator("main img").count();
  check("offline: «Sin conexión» and the home kept on the device", imagesOffline > 0, imagesOffline);
  await shot(phone, "07-app-sin-conexion-390");
  await phone.context().setOffline(false);
  // The offline reads are expected failures.
  errors.length = 0;

  // 4. app_info.
  const update = await newPhone();
  await fakeAppInfo(update, {
    available: true,
    store_status: "active",
    latest: { version_code: 99, version_name: "9.9.0", apk_path: "stores/x/app/v99.apk", size_bytes: 1 },
  });
  await update.goto(APP);
  await update.getByTestId("update").waitFor({ timeout: 20000 });
  check(
    "update: a newer version shows «Actualizar»",
    (await update.getByTestId("update").innerText()).includes("9.9.0"),
  );
  await shot(update, "08-app-version-nueva-390");

  const off = await newPhone();
  await fakeAppInfo(off, { available: false, store_status: "active", latest: null });
  await off.goto(APP);
  await off.getByText("La app de esta tienda no está disponible.").waitFor({ timeout: 20000 });
  check("no mobile_app: the app says so and links to the web", await off.getByTestId("web-link").isVisible());
  await shot(off, "09-app-no-disponible-390");

  const suspended = await newPhone();
  await fakeAppInfo(suspended, { available: false, store_status: "suspended", latest: null });
  await suspended.goto(APP);
  await suspended.getByText("Tienda temporalmente no disponible.").waitFor({ timeout: 20000 });
  check("suspended store: the notice", true);

  // 5. Admin app.
  const owner = await signIn("dueno@demo.kshop.test", env.DEMO_OWNER_PASSWORD, "10-admin-login-390");
  check(
    "admin: the owner signs in to the Tienda Demo",
    (await owner.getByTestId("admin-store-name").innerText()).includes("Tienda Demo"),
  );
  check(
    "admin: «Abrir el panel completo» points to the web admin",
    (await owner.getByTestId("open-panel").getAttribute("href"))?.endsWith("/admin"),
  );
  await shot(owner, "11-admin-inicio-390");

  await owner.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Pedidos" }).click();
  const appOrder = owner.getByRole("link", { name: /QA App Invitada/ }).first();
  await appOrder.waitFor({ timeout: 30000 });
  check("admin: the app order is in the list", true);
  await shot(owner, "12-admin-pedidos-390");
  await appOrder.click();
  await owner.getByRole("button", { name: "Confirmar" }).click();
  let confirmed = null;
  for (let i = 0; i < 30 && confirmed?.status !== "pending_payment"; i++) {
    if (i) await new Promise((r) => setTimeout(r, 500));
    ({ data: confirmed } = await service.from("orders").select("status").eq("id", order.id).single());
  }
  await owner.getByRole("button", { name: "Confirmar" }).waitFor({ state: "detached", timeout: 20000 });
  check("admin: the owner confirms the order", confirmed?.status === "pending_payment", confirmed?.status);
  await shot(owner, "13-admin-pedido-390");

  await owner.goto(`${ADMIN}/admin/catalog/products/${product.id}`);
  const stockInput = owner.locator('input[aria-label^="Stock "]:not([aria-label="Stock para todas"])').first();
  await stockInput.waitFor({ timeout: 30000 });
  const costInputs = await owner.locator('input[aria-label^="Costo "]').count();
  await stockInput.fill("37");
  await owner.getByTestId("save-product").click();
  await owner.getByRole("button", { name: "Guardar" }).waitFor({ timeout: 20000 });
  let stockSaved = false;
  for (let i = 0; i < 20 && !stockSaved; i++) {
    const { data: stocks } = await service.from("stocks").select("quantity").in("variant_id", variantIds);
    stockSaved = stocks.some((s) => s.quantity === 37);
    if (!stockSaved) await new Promise((r) => setTimeout(r, 500));
  }
  check("admin: the owner changes a stock", stockSaved);
  check("admin: the owner sees the costs", costInputs > 0, costInputs);
  await owner.getByTestId("media-input").setInputFiles({
    name: "qa-foto.png",
    mimeType: "image/png",
    // 1×1 PNG: the same upload path as the camera's (compressed to WebP).
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await owner
    .getByTestId("product-media")
    .locator("img")
    .nth((mediaBefore ?? []).length)
    .waitFor({ timeout: 30000 });
  check("admin: the owner uploads a photo", true);
  await shot(owner, "14-admin-producto-390");

  const staff = await signIn("empleado@demo.kshop.test", env.DEMO_STAFF_PASSWORD);
  await staff.goto(`${ADMIN}/admin/catalog/products/${product.id}`);
  await staff.locator('input[aria-label^="Stock "]').first().waitFor({ timeout: 30000 });
  check(
    "admin: the staff member does not see costs",
    (await staff.locator('input[aria-label^="Costo "]').count()) === 0,
  );
  await shot(staff, "15-admin-empleado-390");

  // Without the catalog module: the entitlements read (pg_graphql) answered without it.
  const noCatalog = await signIn("empleado@demo.kshop.test", env.DEMO_STAFF_PASSWORD, null, async (page) =>
    page.route("**/graphql/v1", async (route) => {
      if (!route.request().postData()?.includes("StoreEntitlements")) return route.continue();
      const response = await route.fetch();
      const body = await response.json();
      const edges = body.data?.storeEntitlements?.edges;
      if (edges) body.data.storeEntitlements.edges = edges.filter((e) => e.node.moduleCode !== "catalog");
      await route.fulfill({ response, json: body });
    }),
  );
  const productsTab = await noCatalog
    .getByRole("navigation", { name: "Secciones" })
    .getByText("Productos")
    .count();
  await noCatalog.goto(`${ADMIN}/admin/catalog`);
  await noCatalog.getByText("Esto está en el panel completo").waitFor({ timeout: 20000 });
  check("admin: without the catalog module «Productos» is not shown", productsTab === 0, productsTab);
  await shot(noCatalog, "16-admin-sin-modulo-390");

  if (errors.length) writeFileSync(join(OUT, "console-errors.txt"), errors.join("\n\n"));
  check("no console errors", errors.length === 0, errors.map((e) => e.slice(0, 300)).join(" | "));
} catch (error) {
  check("flow", false, error);
  if (errors.length) console.log(errors.map((e) => e.slice(0, 300)).join("\n"));
  await shot(phone, "error-app");
} finally {
  await browser.close();
  const { data: open } = await service
    .from("orders")
    .select("id")
    .eq("store_id", store.id)
    .gte("created_at", startedAt)
    .like("customer_phone", "+53599907%")
    .not("status", "in", "(delivered,cancelled)");
  for (const o of open ?? []) {
    await service.rpc("order_cancel", {
      p_store_id: store.id,
      p_order_id: o.id,
      p_reason: "Pedido de QA",
      p_user_id: null,
    });
  }
  await removeQaCustomers();
  for (const s of stockBefore ?? []) {
    await service
      .from("stocks")
      .update({ quantity: s.quantity })
      .eq("variant_id", s.variant_id)
      .eq("warehouse_id", s.warehouse_id);
  }
  const keep = new Set((mediaBefore ?? []).map((m) => m.id));
  const { data: mediaAfter } = await service
    .from("product_media")
    .select("id, storage_key")
    .eq("product_id", product.id);
  for (const m of (mediaAfter ?? []).filter((m) => !keep.has(m.id))) {
    await service.from("product_media").delete().eq("id", m.id);
    if (m.storage_key)
      await service.storage
        .from("store-media")
      .remove([m.storage_key, m.storage_key.replace(/-1600\.webp$/, "-480.webp")]);
  }
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
