// Browser QA of phase 6 (pnpm dev running). Creates a temporary Pro store qa-pro-xxxxx with its owner, two warehouses, a
// zone, two products and USD as a sale currency; screenshots go to .titan/qa/fase-6/. Everything is deleted at the end.
//   1. Almacenes (1280 px): overview, zone served by Norte, transfer, movements; the overview at 390 px.
//   2. Monedas (1280 px): change the USD rate and see the history.
//   3. Finanzas (1280 and 390 px): summary with the daily close, everything in USD, margin, inventory, expenses.
//   4. Dominio propio (dry_run): connect {slug}.localhost, see the DNS records, check it, open the store on it (390 px)
//      and the subdomain redirecting there.
//
//   node scripts/qa-pro.mjs

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
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

// A new subdomain per run: the store card is cached for minutes per slug, so reusing "qa-pro" right after deleting
// it would show the previous store.
const SLUG = `qa-pro-${Date.now().toString(36).slice(-5)}`;
const BASE = `http://${SLUG}.kshop.localhost:3000`;
const OUT = join(root, ".titan/qa/fase-6");
const OWNER = { email: "qa-pro-owner@e2e.kshop.test", password: randomBytes(12).toString("base64url") };
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

async function cleanup() {
  await service.from("stores").delete().like("slug", "qa-pro-%");
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (u.email === OWNER.email) await service.auth.admin.deleteUser(u.id);
  }
}

async function seed() {
  const { data: owner } = await service.auth.admin.createUser({
    email: OWNER.email,
    password: OWNER.password,
    email_confirm: true,
  });
  const { data: store, error } = await service
    .rpc("create_store", {
      p_name: "QA Pro",
      p_slug: SLUG,
      p_owner_id: owner.user.id,
      p_base_currency: "CUP",
      p_order_prefix: "QP",
      p_whatsapp_phone: "+5350000000",
      p_plan_code: "pro",
      p_trial_days: 0,
      p_platform_domain: "kshop.fullkod.com",
      p_created_by: null,
    })
    .single();
  if (error) throw error;
  const { data: type } = await service
    .from("product_types")
    .insert({ store_id: store.id, name: "Simple", slug: "simple" })
    .select("id")
    .single();
  for (const [sku, name, price, stock] of [
    ["GOR-1", "Gorra", 1000, 4],
    ["BOL-1", "Bolso", 3000, 2],
  ]) {
    const { error: saveError } = await service.rpc("save_product", {
      p_store_id: store.id,
      p_input: {
        product_type_id: type.id,
        name,
        slug: name.toLowerCase(),
        status: "published",
        variants: [{ sku, price, stock, cost: { price: 2, currency: "USD" } }],
      },
      p_user_id: owner.user.id,
    });
    if (saveError) throw saveError;
  }
  const { data: north } = await service
    .from("warehouses")
    .insert({ store_id: store.id, name: "Norte", address: "Calle 5 e/ 6 y 8" })
    .select("id")
    .single();
  const { data: cap } = await service
    .from("product_variants")
    .select("id")
    .eq("store_id", store.id)
    .eq("sku", "GOR-1")
    .single();
  await service.rpc("set_stock_quantity", {
    p_store_id: store.id,
    p_variant_id: cap.id,
    p_warehouse_id: north.id,
    p_quantity: 6,
    p_type: "adjustment",
    p_note: null,
    p_user_id: owner.user.id,
  });
  await service.from("shipping_zones").insert({ store_id: store.id, name: "Centro Habana" });
  await service.rpc("set_store_currency", {
    p_store_id: store.id,
    p_currency: "USD",
    p_rate_to_base: 300,
    p_sells: true,
    p_rounding: null,
    p_user_id: owner.user.id,
  });

  // Orders of the last 10 days (CUP and USD), most paid, for Finanzas.
  const { data: bag } = await service
    .from("product_variants")
    .select("id")
    .eq("store_id", store.id)
    .eq("sku", "BOL-1")
    .single();
  await service.rpc("set_stock_quantity", {
    p_store_id: store.id,
    p_variant_id: bag.id,
    p_warehouse_id: (
      await service.from("warehouses").select("id").eq("store_id", store.id).eq("is_default", true).single()
    ).data.id,
    p_quantity: 40,
    p_type: "adjustment",
    p_note: null,
    p_user_id: owner.user.id,
  });
  const { data: main } = await service
    .from("warehouses")
    .select("id")
    .eq("store_id", store.id)
    .eq("is_default", true)
    .single();
  await service.rpc("set_stock_quantity", {
    p_store_id: store.id,
    p_variant_id: cap.id,
    p_warehouse_id: main.id,
    p_quantity: 40,
    p_type: "adjustment",
    p_note: null,
    p_user_id: owner.user.id,
  });
  for (let day = 0; day < 10; day++) {
    for (let n = 0; n < 1 + (day % 3); n++) {
      const usd = (day + n) % 4 === 0;
      const { data: result, error: orderError } = await service.rpc("checkout_create_order", {
        p_store_id: store.id,
        p_input: {
          idempotency_key: `qa-pro-${day}-${n}`,
          channel: "admin",
          currency: usd ? "USD" : "CUP",
          lines: [{ variant_id: n % 2 ? cap.id : bag.id, quantity: 1 + (n % 2) }],
          customer: { name: `Cliente ${day}${n}`, phone: "+5353123456" },
          notify_customer: false,
        },
      });
      if (orderError) throw orderError;
      const at = new Date(Date.now() - day * 86_400_000).toISOString();
      const { data: o } = await service.from("orders").select("subtotal").eq("id", result.order_id).single();
      const { error: dateError } = await service
        .from("orders")
        .update({ created_at: at, shipping_total: 0, total: o.subtotal })
        .eq("id", result.order_id);
      if (dateError) throw dateError;
      if ((day + n) % 3 !== 0) {
        await service.rpc("order_record_payment", {
          p_store_id: store.id,
          p_order_id: result.order_id,
          p_input: { amount: Number(o.subtotal) },
          p_user_id: owner.user.id,
        });
        await service.from("payments").update({ created_at: at }).eq("order_id", result.order_id);
      }
    }
  }
  await service.from("expenses").insert([
    {
      store_id: store.id,
      spent_on: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10),
      category: "Alquiler",
      amount: 5000,
      currency: "CUP",
    },
    {
      store_id: store.id,
      spent_on: new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10),
      category: "Envases y bolsas",
      amount: 3,
      currency: "USD",
    },
  ]);
  return store;
}

await cleanup();
await seed();

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
  page.on("dialog", (d) => d.accept());
  return page;
}
// caret "initial": see qa-orders.mjs (false hydration error otherwise).
const shot = (page, name) =>
  page.screenshot({ path: join(OUT, `qa-${name}.png`), fullPage: true, caret: "initial" });

async function login(page, url, account, landing) {
  await page.goto(`${url}/login`);
  await page.fill("#email", account.email);
  await page.fill("#password", account.password);
  await page.click("button[type=submit]");
  await page.waitForURL(landing, { timeout: 30000 });
}

const admin = await newPage({ width: 1280, height: 900 });
const phone = await newPage({ width: 390, height: 844 });

try {
  // 1. Almacenes.
  await login(admin, `${BASE}/admin`, OWNER, `${BASE}/admin`);
  await admin.goto(`${BASE}/admin/multi-warehouse`);
  await admin.getByTestId("warehouse-Norte").waitFor({ timeout: 20000 });
  check(
    "overview: Norte with 6 units",
    (await admin.getByTestId("warehouse-Norte").innerText()).includes("6"),
  );
  const zone = admin.getByTestId("zone-Centro Habana");
  await zone.getByRole("combobox").selectOption({ label: "Norte" });
  await zone.getByRole("button", { name: "Guardar" }).click();
  await zone.getByText("Guardado.").waitFor({ timeout: 15000 });
  check(
    "zones: Centro Habana served by Norte",
    (await zone.innerText()).includes("1.\nNorte") || (await zone.innerText()).includes("Norte"),
  );
  await shot(admin, "01-almacenes-resumen-1280");

  await admin.getByRole("link", { name: "Traspasar" }).click();
  await admin.selectOption("#transfer-from", { label: "Norte" });
  await admin.selectOption("#transfer-to", { label: "Principal" });
  await admin.fill("#transfer-search", "gorra");
  await admin.getByTestId("transfer-results").getByText("GOR-1").waitFor({ timeout: 15000 });
  await admin.getByTestId("transfer-results").getByRole("button", { name: "Añadir" }).click();
  await admin.getByLabel("Unidades de GOR-1").fill("2");
  await admin.fill("#transfer-note", "Reponer la tienda");
  await admin.getByRole("button", { name: "Traspasar", exact: true }).click();
  await admin.getByText("Traspaso hecho: 2 unidades de 1 producto.").waitFor({ timeout: 15000 });
  check("transfer: 2 caps moved", true);
  await shot(admin, "02-almacenes-traspaso-1280");

  await admin.getByRole("link", { name: "Movimientos" }).click();
  await admin.getByTestId("movements").getByText("Traspaso recibido").waitFor({ timeout: 15000 });
  check(
    "movements: sent and received transfer listed",
    (await admin.getByTestId("movements").innerText()).includes("Traspaso enviado"),
  );
  await shot(admin, "03-almacenes-movimientos-1280");

  await login(phone, `${BASE}/admin`, OWNER, `${BASE}/admin`);
  await phone.goto(`${BASE}/admin/multi-warehouse`);
  await phone.getByTestId("warehouse-Norte").waitFor({ timeout: 20000 });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("warehouses at 390 px: no horizontal scroll of the page", overflow <= 1, overflow);
  await shot(phone, "04-almacenes-390");

  // 2. Monedas.
  await admin.goto(`${BASE}/admin/multi-currency`);
  const usd = admin.getByTestId("currency-USD");
  await usd.waitFor({ timeout: 20000 });
  await admin.fill("#rate-USD", "320");
  await usd.getByRole("button", { name: "Actualizar tasa" }).click();
  await usd.getByText("Guardado.", { exact: false }).waitFor({ timeout: 15000 });
  await usd.getByText("Historial de tasas").click();
  const history = await admin.getByTestId("history-USD").innerText();
  check("rates: history with 320 and 300", history.includes("320") && history.includes("300"), history);
  await shot(admin, "05-monedas-1280");

  // 3. Finanzas (last 7 days).
  await admin.goto(`${BASE}/admin/finance`);
  await admin.getByTestId("kpi-sold").waitFor({ timeout: 20000 });
  await admin.getByRole("button", { name: "7 días" }).click();
  await admin.waitForURL(/from=/);
  await admin.locator('[data-testid="finance-summary"][aria-busy="false"]').waitFor({ timeout: 15000 });
  const sold = await admin.getByTestId("kpi-sold").innerText();
  check("finance: sold in CUP and USD", sold.includes("CUP") && sold.includes("USD"), sold);
  const days = await admin.getByTestId("daily-close").locator("tbody tr").count();
  check(
    "finance: the daily close of the last 7 days (one row per day with activity)",
    days >= 5 && days <= 7,
    days,
  );
  await shot(admin, "06-finanzas-resumen-1280");
  await admin.selectOption("#finance-currency", "USD");
  await admin.waitForURL(/currency=USD/);
  await admin.locator('[data-testid="finance-summary"][aria-busy="false"]').waitFor({ timeout: 15000 });
  check(
    "finance: everything in USD on request",
    (await admin.getByTestId("kpi-collected").innerText()).includes("USD"),
  );

  await admin.getByRole("link", { name: "Margen" }).click();
  await admin.getByTestId("margin-rows").getByText("Bolso").waitFor({ timeout: 15000 });
  check("margin: per product", (await admin.getByTestId("margin-rows").innerText()).includes("Gorra"));
  await shot(admin, "07-finanzas-margen-1280");

  await admin.getByRole("link", { name: "Inventario" }).click();
  await admin.getByTestId("inventory-rows").getByText("GOR-1").waitFor({ timeout: 15000 });
  const costValue = await admin.getByTestId("inventory-cost").innerText();
  check("inventory: valued at cost in USD", /[1-9][\d.,]*\s*USD/.test(costValue), costValue);
  await shot(admin, "08-finanzas-inventario-1280");

  await admin.getByRole("link", { name: "Gastos" }).click();
  await admin.getByTestId("expenses").getByText("Alquiler").waitFor({ timeout: 15000 });
  await admin.fill("#expense-category", "Mensajería");
  await admin.fill("#expense-amount", "450");
  await admin.getByRole("button", { name: "Añadir gasto" }).click();
  await admin.getByTestId("expenses").getByText("Mensajería").waitFor({ timeout: 15000 });
  check(
    "expenses: added from the form",
    (await admin.getByTestId("expenses-total").innerText()).includes("CUP"),
  );
  await shot(admin, "09-finanzas-gastos-1280");

  await phone.goto(`${BASE}/admin/finance`);
  await phone.getByTestId("kpi-sold").waitFor({ timeout: 20000 });
  const financeOverflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check("finance at 390 px: no horizontal scroll of the page", financeOverflow <= 1, financeOverflow);
  await shot(phone, "10-finanzas-390");

  // 4. Dominio propio. Chrome resolves any *.localhost; the domain is new, so the proxy has nothing cached for it.
  const DOMAIN = `${SLUG}.localhost`;
  await admin.goto(`${BASE}/admin/custom-domain`);
  await admin.fill("#domain", DOMAIN);
  await admin.getByRole("button", { name: "Conectar dominio" }).click();
  await admin.getByTestId("dns-records").waitFor({ timeout: 20000 });
  check(
    "domain: DNS records to set",
    (await admin.getByTestId("dns-records").innerText()).includes("76.76.21.21"),
  );
  await shot(admin, "11-dominio-dns-1280");
  await admin.getByRole("button", { name: "Comprobar" }).click();
  await admin.getByText("¡Listo!").waitFor({ timeout: 20000 });
  check(
    "domain: verified and active",
    (await admin.getByTestId("custom-domain").innerText()).includes("Activo"),
  );
  await shot(admin, "12-dominio-activo-1280");
  await phone.goto(`http://${DOMAIN}:3000/`);
  await phone.getByText("QA Pro").first().waitFor({ timeout: 30000 });
  check(
    "domain: the store is served on its domain",
    new URL(phone.url()).host === `${DOMAIN}:3000`,
    phone.url(),
  );
  await shot(phone, "13-tienda-en-su-dominio-390");
  await phone.goto(`${BASE}/`);
  await phone.waitForLoadState("domcontentloaded");
  check("domain: the subdomain redirects to it", new URL(phone.url()).host === `${DOMAIN}:3000`, phone.url());

  if (errors.length) writeFileSync(join(OUT, "console-errors.txt"), errors.join("\n\n"));
  check("no console errors", errors.length === 0, errors.map((e) => e.slice(0, 300)).join(" | "));
} catch (error) {
  check("flow", false, error);
  if (errors.length) console.log(errors.map((e) => e.slice(0, 500)).join("\n"));
  await shot(admin, "error-admin");
  await shot(phone, "error-movil");
} finally {
  await browser.close();
  await cleanup();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
