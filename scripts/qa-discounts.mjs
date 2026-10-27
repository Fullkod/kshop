// Browser QA of the discounts of phase 4 on the Tienda Demo (pnpm dev running, pnpm demo:seed done: promotion
// «Rebajas de vestidos» -20 % and voucher BIENVENIDA10). Screenshots go to .titan/qa/fase-4/qa-*.png.
//   1. A guest (390 px) sees the -20 % badge, buys 2 dresses with BIENVENIDA10 and sees the discounts in the
//      cart, the checkout and the order page.
//   2. The owner (1280 px) creates and deletes a promotion from the admin, sees the voucher usage and the
//      discounts of the order.
// At the end the QA order is cancelled (voucher use and stock released) and the QA promotion removed.
//
//   node scripts/qa-discounts.mjs

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

const BASE = env.QA_STORE_URL ?? "http://demo.kshop.localhost:3000";
const OUT = join(root, ".titan/qa/fase-4");
const PHONE = "5359990500";
mkdirSync(OUT, { recursive: true });

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

const { data: store } = await service.from("stores").select("id").eq("slug", "demo").single();
const { data: product } = await service
  .from("products")
  .select("id")
  .eq("store_id", store.id)
  .eq("slug", "vestido-nandu")
  .single();
const { data: variants } = await service.from("product_variants").select("id").eq("product_id", product.id);
const { data: stockBefore } = await service
  .from("stocks")
  .select("variant_id, warehouse_id, quantity")
  .in(
    "variant_id",
    variants.map((v) => v.id),
  );
const startedAt = new Date().toISOString();

const browser = await chromium.launch({ executablePath: chromiumPath() });
const errors = [];
async function newPage(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      !m.text().includes("instant navigation") &&
      errors.push(`${page.url()} :: ${m.text()}`),
  );
  return page;
}
// caret "initial": the default hides the caret with an inline style that breaks hydration if React has not
// hydrated yet (a false "attributes didn't match" error).
const shot = (page, name) =>
  page.screenshot({ path: join(OUT, `qa-${name}.png`), fullPage: true, caret: "initial" });

const guest = await newPage({ width: 390, height: 844 });
const admin = await newPage({ width: 1280, height: 900 });

try {
  // 1. Guest: badge, cart with the voucher, checkout and order page.
  await guest.goto(`${BASE}/category/vestidos`);
  await guest.getByText("-20%").first().waitFor({ timeout: 15000 });
  check("listing shows the -20% badge of the promotion", true);
  await shot(guest, "01-listado-oferta-390");

  await guest.goto(`${BASE}/product/vestido-nandu`);
  await guest.getByText("Rebajas de vestidos").waitFor({ timeout: 15000 });
  check(
    "product page shows the promotion name and the struck price",
    await guest.locator("p s, p .line-through").first().isVisible(),
  );
  await shot(guest, "02-ficha-oferta-390");
  // Two units: phones have no quantity stepper on the product page (redesign R4), the buy bar adds one each time.
  await guest.getByRole("button", { name: "Añadir al carrito" }).click();
  await guest.getByText("Añadido al carrito.").waitFor({ timeout: 15000 });
  await Promise.all([
    guest.waitForResponse((r) => r.url().includes("/cart") && r.request().method() === "PUT" && r.ok()),
    guest.getByRole("button", { name: "Añadir al carrito" }).click(),
  ]);

  await guest.goto(`${BASE}/cart`);
  await guest.getByLabel("Código de cupón").fill("bienvenida10");
  await guest.getByRole("button", { name: "Aplicar" }).click();
  await guest.getByText("Cupón BIENVENIDA10").first().waitFor({ timeout: 15000 });
  const cartText = await guest.locator("main").innerText();
  check(
    "cart: voucher applied (−240) and the saving of the offer",
    cartText.includes("240") && /Descuentos/.test(cartText),
    cartText,
  );
  await shot(guest, "03-carrito-cupon-390");

  await guest.goto(`${BASE}/checkout`);
  await guest.getByLabel("Zona").waitFor({ timeout: 15000 });
  await guest.fill("#name", "QA Descuentos");
  await guest.fill("#phone", PHONE);
  await guest.getByLabel("Zona").selectOption({ label: "La Habana" });
  await guest.getByRole("radio", { name: /Mensajería/ }).check();
  await guest.fill("#address", "Calle QA 5, Vedado");
  await guest.getByRole("radio", { name: /Efectivo al recibir/ }).check();
  await shot(guest, "04-checkout-cupon-390");
  await guest.getByRole("button", { name: "Confirmar pedido" }).click();
  await guest.waitForURL(/\/order\/[0-9a-f-]+\?new=1/, { timeout: 30000 });
  await guest.getByText(/recibido!/).waitFor({ timeout: 15000 });
  const orderText = await guest.locator("main").innerText();
  check(
    "order page: voucher line and total 2400 − 240 + 500",
    orderText.includes("Cupón BIENVENIDA10") && orderText.includes("2660"),
    orderText,
  );
  await shot(guest, "05-pedido-descuento-390");
  const token = guest.url().split("?")[0].split("/").pop();
  const { data: order } = await service
    .from("orders")
    .select("id, number")
    .eq("public_token", token)
    .single();

  // 2. Owner: promotion created and deleted from the admin, voucher usage, order discounts.
  await admin.goto(`${BASE}/admin/login`);
  await admin.fill("#email", "dueno@demo.kshop.test");
  await admin.fill("#password", env.DEMO_OWNER_PASSWORD);
  await admin.click("button[type=submit]");
  await admin.waitForURL(`${BASE}/admin`, { timeout: 30000 });

  await admin.goto(`${BASE}/admin/discounts`);
  await admin.getByTestId("promotions-list").getByText("Rebajas de vestidos").waitFor({ timeout: 15000 });
  await admin.getByRole("button", { name: "Nueva promoción" }).click();
  await admin.fill("#name", "QA Complementos");
  await admin.fill("#value", "15");
  const categorySelect = admin.getByLabel("Añadir categoría");
  // Labels carry the tree indent ("— Complementos"): select by value.
  await categorySelect.selectOption(
    await categorySelect.locator("option", { hasText: "Complementos" }).getAttribute("value"),
  );
  await shot(admin, "06-admin-nueva-promocion-1280");
  await admin.getByRole("button", { name: "Guardar" }).click();
  await admin.getByTestId("promotions-list").getByText("QA Complementos").waitFor({ timeout: 15000 });
  check("admin: promotion created from the form", true);
  await shot(admin, "07-admin-promociones-1280");
  const row = admin.getByTestId("promotions-list").locator("li", { hasText: "QA Complementos" });
  await row.getByRole("button", { name: "Borrar" }).click();
  await row.waitFor({ state: "detached", timeout: 15000 });
  check("admin: promotion deleted", true);

  await admin.goto(`${BASE}/admin/discounts/vouchers`);
  const voucherRow = admin.getByTestId("vouchers-list").locator("li", { hasText: "BIENVENIDA10" }).first();
  await voucherRow.getByRole("button", { name: "Usos" }).click();
  await voucherRow.getByText("QA Descuentos").first().waitFor({ timeout: 15000 });
  check("admin: voucher usage lists the QA order", true);
  await shot(admin, "08-admin-cupones-1280");

  await admin.goto(`${BASE}/admin/orders/${order.id}`);
  await admin.getByText("Cupón BIENVENIDA10").waitFor({ timeout: 15000 });
  check(
    "admin: order detail shows the offer and the voucher",
    await admin.getByText(/Oferta «Rebajas de vestidos»/).isVisible(),
  );
  await shot(admin, "09-admin-pedido-descuentos-1280");

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
    .eq("customer_phone", `+${PHONE}`)
    .not("status", "in", "(delivered,cancelled)");
  for (const o of open ?? []) {
    await service.rpc("order_cancel", {
      p_store_id: store.id,
      p_order_id: o.id,
      p_reason: "Pedido de QA",
      p_user_id: null,
    });
  }
  const { data: leftover } = await service
    .from("promotions")
    .select("id")
    .eq("store_id", store.id)
    .eq("name", "QA Complementos");
  if (leftover?.length) {
    await service
      .from("promotions")
      .delete()
      .in(
        "id",
        leftover.map((p) => p.id),
      );
    await service.rpc("refresh_promotions", { p_store_id: store.id });
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
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
