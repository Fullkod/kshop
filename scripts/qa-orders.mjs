// Browser QA of phase 3 on the Tienda Demo (pnpm dev running, pnpm demo:seed done). Screenshots go to
// .titan/qa/fase-3/qa-*.png. Three flows:
//   1. A customer signs up (390 px), buys with shipping «a convenir» and sees the order in «Mis pedidos».
//   2. The owner (1280 px) sets the shipping cost, runs the order to delivered and adds an internal note;
//      the customer sees «Entregado» and the new shipping cost, never the note.
//   3. A guest order is cancelled from the admin, and an admin «Nuevo pedido» (pickup) is created and cancelled.
// At the end the QA customer is deleted, open QA orders are cancelled and the stock sold is put back.
// Chromium comes from the Playwright browsers cache (or QA_CHROMIUM_PATH).
//
//   node scripts/qa-orders.mjs

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
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
const OUT = join(root, ".titan/qa/fase-3");
const PHONE = "5359990400";
const PASSWORD = "clave-qa-orders-1234";
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

async function removeQaCustomer() {
  const { data } = await service.from("customers").select("user_id").eq("store_id", store.id).eq("phone", `+${PHONE}`);
  for (const c of data ?? []) await service.auth.admin.deleteUser(c.user_id);
}
await removeQaCustomer();

const browser = await chromium.launch({ executablePath: chromiumPath() });
const errors = [];
async function newPage(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  // The dev-only notice of the admin instant navigation is not an app error.
  page.on("console", (m) => m.type() === "error" && !m.text().includes("instant navigation") && errors.push(m.text()));
  return page;
}
const shot = (page, name) => page.screenshot({ path: join(OUT, `qa-${name}.png`), fullPage: true });

const customer = await newPage({ width: 390, height: 844 });
const admin = await newPage({ width: 1280, height: 900 });
const badge = (text) => admin.locator("h2").getByText(text, { exact: true }).first();

try {
  // 1. Customer: sign up, buy with shipping to agree, see the order in «Mis pedidos».
  await customer.goto(`${BASE}/account/register`);
  await customer.fill("#firstName", "Clienta QA Pedidos");
  await customer.fill("#phone", PHONE);
  await customer.fill("#password", PASSWORD);
  await customer.click("button[type=submit]");
  await customer.waitForURL(`${BASE}/account`, { timeout: 30000 });
  check("customer signs up and lands on /account", true);

  await customer.goto(`${BASE}/product/vestido-nandu`);
  await customer.getByRole("button", { name: "Añadir al carrito" }).click();
  await customer.getByText("Añadido al carrito.").waitFor({ timeout: 15000 });
  await customer.goto(`${BASE}/checkout`);
  await customer.getByLabel("Zona").waitFor({ timeout: 15000 });
  check(
    "checkout is prefilled with the account data",
    (await customer.inputValue("#name")) === "Clienta QA Pedidos" && (await customer.inputValue("#phone")) !== "",
  );
  await customer.getByLabel("Zona").selectOption({ label: "Mayabeque y Artemisa" });
  await customer.getByRole("radio", { name: /A convenir/ }).check();
  await customer.fill("#address", "Calle QA 4, Artemisa");
  await customer.getByRole("radio", { name: /Efectivo al recibir/ }).check();
  await shot(customer, "01-checkout-a-convenir-390");
  await customer.getByRole("button", { name: "Confirmar pedido" }).click();
  await customer.waitForURL(/\/order\/[0-9a-f-]+\?new=1/, { timeout: 30000 });
  const orderUrl = customer.url().split("?")[0];
  const token = orderUrl.split("/").pop();
  await customer.getByText(/recibido!/).waitFor({ timeout: 15000 });
  check("order page shows the shipping as «A convenir»", await customer.getByText("A convenir").first().isVisible());
  await shot(customer, "02-pedido-a-convenir-390");

  await customer.goto(`${BASE}/account`);
  await customer.getByText("Mis pedidos").waitFor({ timeout: 15000 });
  await customer.getByText("Por confirmar").first().waitFor({ timeout: 15000 });
  check("«Mis pedidos» lists the order as «Por confirmar»", true);
  await shot(customer, "03-mis-pedidos-390");

  // 2. Owner: set the shipping cost, run the life cycle, add an internal note.
  const { data: order } = await service.from("orders").select("id").eq("public_token", token).single();
  await admin.goto(`${BASE}/admin/login`);
  await admin.fill("#email", "dueno@demo.kshop.test");
  await admin.fill("#password", env.DEMO_OWNER_PASSWORD);
  await admin.click("button[type=submit]");
  await admin.waitForURL(`${BASE}/admin`, { timeout: 30000 });
  await admin.goto(`${BASE}/admin/orders/${order.id}`);
  await admin.getByText("Productos").waitFor({ timeout: 15000 });
  check("«Confirmar» is disabled while the shipping is to agree", await admin.getByRole("button", { name: "Confirmar" }).isDisabled());
  await admin.fill("#shipping-cost", "300");
  await admin.getByRole("button", { name: "Fijar" }).click();
  await admin.getByText("Costo de envío fijado").waitFor({ timeout: 15000 });
  for (const [button, status] of [
    ["Confirmar", "Pendiente de pago"],
    ["Marcar pagado", "Pagado"],
    ["Preparar", "En preparación"],
    ["Enviar", "Enviado"],
    ["Entregado", "Entregado"],
  ]) {
    await admin.getByRole("button", { name: button, exact: true }).click();
    await badge(status).waitFor({ timeout: 15000 });
  }
  check("life cycle: shipping set, confirmed, paid, processing, shipped, delivered", true);
  await admin.getByLabel("Nota interna").fill("Nota interna de QA");
  await admin.getByRole("button", { name: "Añadir" }).click();
  await admin.getByText("Nota interna de QA").waitFor({ timeout: 15000 });
  await shot(admin, "04-admin-pedido-entregado-1280");

  await customer.goto(orderUrl);
  await customer.getByText("Entregado").first().waitFor({ timeout: 15000 });
  const publicText = await customer.locator("main").innerText();
  check("the customer sees «Entregado» and the shipping cost set by the store", !publicText.includes("A convenir") && publicText.includes("300"));
  check("the customer never sees the internal note", !publicText.includes("Nota interna de QA"));
  await shot(customer, "05-pedido-entregado-390");

  // 3. A guest order cancelled from the admin.
  const guest = await newPage({ width: 1280, height: 900 });
  await guest.goto(`${BASE}/product/vestido-nandu`);
  await guest.getByRole("button", { name: "Añadir al carrito" }).click();
  await guest.getByText("Añadido al carrito.").waitFor({ timeout: 15000 });
  await guest.goto(`${BASE}/checkout`);
  await guest.getByLabel("Zona").waitFor({ timeout: 15000 });
  await guest.fill("#name", "QA Invitado Cancelado");
  await guest.fill("#phone", "5359990401");
  await guest.getByLabel("Zona").selectOption({ label: "La Habana" });
  await guest.getByRole("radio", { name: /Mensajería/ }).check();
  await guest.fill("#address", "Calle 10 #200, Vedado");
  await guest.getByRole("button", { name: "Confirmar pedido" }).click();
  await guest.waitForURL(/\/order\/[0-9a-f-]+\?new=1/, { timeout: 30000 });
  const guestUrl = guest.url().split("?")[0];
  const { data: guestOrder } = await service.from("orders").select("id").eq("public_token", guestUrl.split("/").pop()).single();
  check("guest order placed", !!guestOrder);

  await admin.goto(`${BASE}/admin/orders/${guestOrder.id}`);
  await admin.getByRole("button", { name: "Cancelar pedido" }).click();
  await admin.getByLabel("Motivo").fill("Prueba de QA");
  await admin.getByRole("button", { name: "Confirmar cancelación" }).click();
  await badge("Cancelado").waitFor({ timeout: 15000 });
  const { count: held } = await service
    .from("inventory_reservations")
    .select("id", { count: "exact", head: true })
    .eq("order_id", guestOrder.id)
    .eq("status", "active");
  check("cancelling releases the reserved stock", held === 0, held);
  await guest.goto(guestUrl);
  await guest.getByText("Cancelado").first().waitFor({ timeout: 15000 });
  check("the guest sees the order cancelled", true);
  await shot(guest, "06-pedido-cancelado-1280");

  // Admin «Nuevo pedido» with pickup, then cancelled.
  await admin.goto(`${BASE}/admin/orders/new`);
  await admin.getByLabel("Buscar productos").fill("Vestido");
  await admin.getByRole("button", { name: "Añadir" }).first().click();
  await admin.fill("#phone", "5359990402");
  await admin.fill("#name", "QA Pedido Admin");
  const pickup = await admin.locator("#method option", { hasText: "Recoger en la tienda" }).getAttribute("value");
  await admin.getByLabel("Método de entrega").selectOption(pickup);
  await admin.getByRole("button", { name: "Crear pedido" }).click();
  await admin.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}$/, { timeout: 30000 });
  await admin.getByText("Creado desde el admin").waitFor({ timeout: 15000 });
  await admin.getByRole("button", { name: "Cancelar pedido" }).click();
  await admin.getByRole("button", { name: "Confirmar cancelación" }).click();
  await badge("Cancelado").waitFor({ timeout: 15000 });
  check("admin «Nuevo pedido» created and cancelled", true);

  check("no console errors", errors.length === 0, errors.join(" | "));
} catch (error) {
  check("flow", false, error);
  await shot(customer, "error-cliente");
  await shot(admin, "error-admin");
} finally {
  await browser.close();
  // Cancel any QA order of this run left open, then put back the stock sold and delete the QA customer.
  const { data: open } = await service
    .from("orders")
    .select("id")
    .eq("store_id", store.id)
    .gte("created_at", startedAt)
    .like("customer_phone", "+53599904%")
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
  await removeQaCustomer();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
