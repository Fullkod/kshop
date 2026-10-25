// Browser QA of the WhatsApp notices of phase 4 on the Tienda Demo (pnpm dev running, pnpm demo:seed done, platform
// mode "dry_run"). Screenshots go to .titan/qa/fase-4/qa-1*.png.
//   1. A guest (390 px) buys with the «Recibir avisos» box ticked; a customer with an account opens its order from
//      the notice link (/account/orders/{id}).
//   2. The owner (1280 px) sees the order's notices, the log with «Abrir en WhatsApp», the contacts and the message
//      editor with its preview.
//   3. A temporary superadmin sees «WhatsApp de la plataforma».
// At the end the QA orders are cancelled, the stock put back and the QA customer and superadmin deleted.
//
//   node scripts/qa-notifications.mjs

import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
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

const BASE = env.QA_STORE_URL ?? "http://demo.kshop.localhost:3000";
const PLATFORM = env.QA_PLATFORM_URL ?? "http://kshop.localhost:3000";
const OUT = join(root, ".titan/qa/fase-4");
const GUEST_PHONE = "5359990600";
const CUSTOMER_PHONE = "5359990601";
const CUSTOMER_PASSWORD = "clave-qa-avisos-1234";
const SUPER = { email: "qa-super@e2e.kshop.test", password: randomBytes(12).toString("base64url") };
mkdirSync(OUT, { recursive: true });

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
function check(name, ok, detail) {
  results.push(ok);
  console.log(`${ok ? "ok" : "not ok"} - ${name}${ok || detail === undefined ? "" : ` (${String(detail).slice(0, 400)})`}`);
}

function chromiumPath() {
  if (env.QA_CHROMIUM_PATH) return env.QA_CHROMIUM_PATH;
  const cache = join(env.LOCALAPPDATA ?? join(env.HOME ?? "", ".cache"), "ms-playwright");
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)) : [];
  dirs.sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const dir of dirs) {
    for (const exe of ["chrome-win64/chrome.exe", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
      if (existsSync(join(cache, dir, exe))) return join(cache, dir, exe);
    }
  }
  throw new Error(`No Chromium in ${cache}; install one (npx playwright install chromium) or set QA_CHROMIUM_PATH`);
}

const { data: store } = await service.from("stores").select("id").eq("slug", "demo").single();
const { data: product } = await service.from("products").select("id").eq("store_id", store.id).eq("slug", "vestido-nandu").single();
const { data: variants } = await service.from("product_variants").select("id").eq("product_id", product.id);
const { data: stockBefore } = await service
  .from("stocks")
  .select("variant_id, warehouse_id, quantity")
  .in("variant_id", variants.map((v) => v.id));
const startedAt = new Date().toISOString();

async function removeQaUsers() {
  const { data } = await service.from("customers").select("user_id").eq("store_id", store.id).eq("phone", `+${CUSTOMER_PHONE}`);
  for (const c of data ?? []) await service.auth.admin.deleteUser(c.user_id);
  const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users?.users ?? []) if (u.email === SUPER.email) await service.auth.admin.deleteUser(u.id);
}
await removeQaUsers();

// The customer with an account and its order, through the API (what the storefront does).
const apiBase = `http://localhost:3000/api/v1/stores/${store.id}`;
const call = (method, path, body, tokenValue) =>
  fetch(`${apiBase}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(tokenValue && { Authorization: `Bearer ${tokenValue}` }) },
    body: body && JSON.stringify(body),
  }).then((r) => r.json());
const registered = await call("POST", "/customer-auth/register", {
  firstName: "Clienta QA Avisos", phone: CUSTOMER_PHONE, password: CUSTOMER_PASSWORD,
});
const customerToken = registered.session.accessToken;
const { data: zone } = await service.from("shipping_zones").select("id").eq("store_id", store.id).eq("name", "La Habana").single();
const { data: delivery } = await service.from("shipping_methods").select("id").eq("store_id", store.id).eq("type", "delivery").single();
await call("PUT", "/cart", { lines: [{ variantId: variants[0].id, quantity: 1 }], mode: "add" }, customerToken);
const accountOrder = await call("POST", "/checkout", {
  idempotencyKey: randomUUID(), customer: { name: "Clienta QA Avisos", phone: CUSTOMER_PHONE },
  shipping: { zoneId: zone.id, methodId: delivery.id, address: "Calle QA 6" },
}, customerToken);

await service.auth.admin.createUser({ email: SUPER.email, password: SUPER.password, email_confirm: true, app_metadata: { role: "superadmin" } });

const browser = await chromium.launch({ executablePath: chromiumPath() });
const errors = [];
async function newPage(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && !m.text().includes("instant navigation") && errors.push(`${page.url()} :: ${m.text()}`));
  return page;
}
// caret "initial": see qa-orders.mjs (false hydration error otherwise).
const shot = (page, name) => page.screenshot({ path: join(OUT, `qa-${name}.png`), fullPage: true, caret: "initial" });

const guest = await newPage({ width: 390, height: 844 });
const admin = await newPage({ width: 1280, height: 900 });

try {
  // 1. Guest checkout with the notices box, and the account order page.
  await guest.goto(`${BASE}/product/vestido-nandu`);
  await guest.getByRole("button", { name: "Añadir al carrito" }).click();
  await guest.getByText("Añadido al carrito.").waitFor({ timeout: 15000 });
  await guest.goto(`${BASE}/checkout`);
  await guest.getByLabel("Zona").waitFor({ timeout: 15000 });
  await guest.fill("#name", "QA Avisos");
  await guest.fill("#phone", GUEST_PHONE);
  await guest.getByLabel("Zona").selectOption({ label: "La Habana" });
  await guest.getByRole("radio", { name: /Mensajería/ }).check();
  await guest.fill("#address", "Calle QA 7, Vedado");
  const box = guest.getByLabel(/Recibir por WhatsApp los avisos/);
  check("checkout: «Recibir avisos» is ticked by default", await box.isChecked());
  await shot(guest, "10-checkout-avisos-390");
  await guest.getByRole("button", { name: "Confirmar pedido" }).click();
  await guest.waitForURL(/\/order\/[0-9a-f-]+\?new=1/, { timeout: 30000 });
  const token = guest.url().split("?")[0].split("/").pop();
  const { data: order } = await service.from("orders").select("id").eq("public_token", token).single();
  const { data: queued } = await service.from("notification_log").select("audience, status").eq("order_id", order.id);
  check("order: notices to the store and to the customer, simulated",
    queued.map((n) => `${n.audience}:${n.status}`).sort().join(" ") === "customer:simulated store:simulated", JSON.stringify(queued));

  await guest.goto(`${BASE}/account/login`);
  await guest.fill("#phone", CUSTOMER_PHONE);
  await guest.fill("#password", CUSTOMER_PASSWORD);
  await guest.click("button[type=submit]");
  await guest.waitForURL(`${BASE}/account`, { timeout: 30000 });
  await guest.goto(`${BASE}/account/orders/${accountOrder.orderId}`);
  await guest.getByText(accountOrder.order.code).first().waitFor({ timeout: 15000 });
  check("account: the order of the notice link opens inside the profile", true);
  await shot(guest, "11-cuenta-pedido-390");

  // 2. Owner: notices of the order, log, contacts and templates.
  await admin.goto(`${BASE}/admin/login`);
  await admin.fill("#email", "dueno@demo.kshop.test");
  await admin.fill("#password", env.DEMO_OWNER_PASSWORD);
  await admin.click("button[type=submit]");
  await admin.waitForURL(`${BASE}/admin`, { timeout: 30000 });
  await admin.goto(`${BASE}/admin/orders/${order.id}`);
  await admin.getByText("Avisos por WhatsApp").waitFor({ timeout: 15000 });
  check("order detail: the notices of the order", (await admin.getByTestId("notification-log").getByText("Simulado").count()) >= 2);
  await shot(admin, "12-admin-pedido-avisos-1280");

  await admin.goto(`${BASE}/admin/whatsapp-notifications/log`);
  const waLink = admin.getByTestId("notification-log").getByRole("link", { name: "Abrir en WhatsApp" }).first();
  await waLink.waitFor({ timeout: 15000 });
  check("log: «Abrir en WhatsApp» opens wa.me with the message", (await waLink.getAttribute("href")).startsWith("https://wa.me/"));
  await shot(admin, "13-admin-historial-1280");

  await admin.goto(`${BASE}/admin/whatsapp-notifications`);
  await admin.getByTestId("contacts-list").getByText("Tienda Demo").waitFor({ timeout: 15000 });
  await shot(admin, "14-admin-contactos-1280");

  await admin.goto(`${BASE}/admin/whatsapp-notifications/templates`);
  const row = admin.getByTestId("templates-list").locator("li", { hasText: "Pedido recibido" });
  await row.getByRole("button", { name: "Editar" }).click();
  await admin.getByTestId("template-preview").getByText("*Tienda Demo*").waitFor({ timeout: 15000 });
  check("templates: the preview starts with the store name", true);
  await shot(admin, "15-admin-mensajes-1280");

  // 3. Superadmin.
  const platform = await newPage({ width: 1280, height: 900 });
  await platform.goto(`${PLATFORM}/superadmin/login`);
  await platform.fill("#email", SUPER.email);
  await platform.fill("#password", SUPER.password);
  await platform.click("button[type=submit]");
  await platform.waitForURL(`${PLATFORM}/superadmin`, { timeout: 30000 });
  await platform.goto(`${PLATFORM}/superadmin/whatsapp`);
  await platform.getByTestId("whatsapp-queue").waitFor({ timeout: 15000 });
  check("superadmin: platform WhatsApp page with mode and queue", await platform.getByLabel("Modo").isVisible());
  await shot(platform, "16-superadmin-whatsapp-1280");

  if (errors.length) writeFileSync(join(OUT, "console-errors.txt"), errors.join("\n\n"));
  check("no console errors", errors.length === 0, errors.map((e) => e.slice(0, 300)).join(" | "));
} catch (error) {
  check("flow", false, error);
  await shot(guest, "error-cliente");
  await shot(admin, "error-admin");
} finally {
  await browser.close();
  const { data: open } = await service
    .from("orders")
    .select("id")
    .eq("store_id", store.id)
    .gte("created_at", startedAt)
    .in("customer_phone", [`+${GUEST_PHONE}`, `+${CUSTOMER_PHONE}`])
    .not("status", "in", "(delivered,cancelled)");
  for (const o of open ?? []) {
    await service.rpc("order_cancel", { p_store_id: store.id, p_order_id: o.id, p_reason: "Pedido de QA", p_user_id: null });
  }
  for (const row of stockBefore) {
    const { data: now } = await service
      .from("stocks")
      .select("quantity")
      .eq("variant_id", row.variant_id)
      .eq("warehouse_id", row.warehouse_id)
      .single();
    if (now.quantity !== row.quantity) {
      await service.rpc("set_stock_quantity", {
        p_store_id: store.id,
        p_variant_id: row.variant_id,
        p_warehouse_id: row.warehouse_id,
        p_quantity: row.quantity,
        p_type: "adjustment",
        p_note: "Reposición tras QA",
        p_user_id: null,
      });
    }
  }
  await removeQaUsers();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
