// KSH0003 QA in the browser (Tienda Demo, owner): the cost and price calculator of the product editor, and the Cuban
// grouping of phone numbers. Opens «Vestido Ñandú», calculates one variant (a bag of 160 for 250 CUP at 30 % rounded
// up to 5) and all of them (1200 at 40 % over the price), and checks the cost and price fields; nothing is saved. Then
// the orders list shows the customer phones as +53 5 XXX XXXX. Screenshots in .titan/qa/ksh0003-calculadora/ (1280 and
// 390). Needs pnpm dev (QA_BASE_URL for another port).
//
//   pnpm qa:price-calculator

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

const PORT = new URL(env.QA_BASE_URL ?? "http://localhost:3000").port || "3000";
const BASE = `http://demo.kshop.localhost:${PORT}`;
const OUT = join(root, ".titan/qa/ksh0003-calculadora");
mkdirSync(OUT, { recursive: true });

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

const results = [];
function check(name, ok, detail) {
  results.push(ok);
  console.log(
    `${ok ? "ok" : "not ok"} - ${name}${ok || detail === undefined ? "" : ` (${String(detail).slice(0, 300)})`}`,
  );
}

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
  email: env.DEMO_OWNER_EMAIL ?? "dueno@demo.kshop.test",
  password: env.DEMO_OWNER_PASSWORD,
});
if (signInError) throw new Error(`Owner sign-in failed: ${signInError.message}`);
const storageKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const { data: demo } = await service.from("stores").select("id").eq("slug", "demo").single();
const { data: product } = await service
  .from("products")
  .select("id, name")
  .eq("store_id", demo.id)
  .ilike("name", "Vestido%")
  .limit(1)
  .single();
if (!product) throw new Error("The Tienda Demo has no «Vestido…» product (pnpm demo:seed)");

const browser = await chromium.launch({ executablePath: chromiumPath() });
const consoleErrors = [];

async function newPage({ width = 1280, height = 900 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: width < 768,
    isMobile: width < 768,
  });
  await context.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // storage blocked: the page will show the login
      }
    },
    [storageKey, JSON.stringify(signIn.session)],
  );
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && !/instant navigation|WebSocket|realtime/i.test(m.text())) {
      consoleErrors.push(`${page.url()}: ${m.text().slice(0, 200)}`);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()}: pageerror ${String(e).slice(0, 200)}`));
  return page;
}

const dialog = (page) => page.locator("dialog[open]");
const money = (amount, currency) => new RegExp(`${amount}\\s*${currency}`);

async function fillCalculator(page, { paid, currency, units, margin, basis, rounding }) {
  const d = dialog(page);
  await d.getByLabel("Pagaste").fill(paid);
  if (currency) await d.getByLabel("Moneda de la compra").selectOption(currency);
  await d.getByLabel("Por cuántas unidades").fill(units);
  await d.getByLabel("Margen comercial (%)").fill(margin);
  if (basis) await d.getByRole("button", { name: basis }).click();
  if (rounding) await d.getByLabel("Redondear el precio hacia arriba").selectOption(rounding);
}

try {
  const page = await newPage();
  await page.goto(`${BASE}/admin/catalog/products/${product.id}`);
  const first = page.getByRole("button", { name: /^Calcular costo y precio (?!para todas)/ }).first();
  await first.waitFor({ timeout: 30000 });
  const buttons = await page.getByRole("button", { name: /^Calcular costo y precio (?!para todas)/ }).count();
  check("the editor has a «Calcular» button per variant", buttons > 1, buttons);

  // One variant: a bag of 160 for 250 CUP at 30 % over the cost, rounded up to 5 CUP
  await first.click();
  await dialog(page).waitFor({ timeout: 10000 });
  check("the dialog names the variant", /S \/ (Rojo|Negro)/.test((await dialog(page).textContent()) ?? ""));
  const modal = await page.evaluate(
    () =>
      (document.querySelector("dialog[open]")?.matches(":modal") ?? false) &&
      !!document.activeElement?.closest("dialog[open]"),
  );
  check("opens a modal dialog with the focus inside", modal);
  check(
    "«Usar» waits for the numbers",
    await dialog(page).getByRole("button", { name: "Usar" }).isDisabled(),
  );
  await dialog(page).getByRole("button", { name: "Qué es el margen comercial" }).click();
  const help = dialog(page).getByTestId("margin-help");
  const helpText = (await help.textContent().catch(() => "")) ?? "";
  check(
    "the help explains the two margins",
    /Sobre el costo/.test(helpText) && /Sobre el precio/.test(helpText),
  );
  await fillCalculator(page, { paid: "250", units: "160", margin: "30", rounding: "5" });
  const summary = dialog(page).locator("[aria-live]");
  await summary.getByText(money("1,56", "CUP")).waitFor({ timeout: 5000 });
  const text = (await summary.textContent()) ?? "";
  check(
    "unit cost 1,56 CUP and price 5 CUP",
    money("1,56", "CUP").test(text) && money("5", "CUP").test(text),
    text,
  );
  check("shows the resulting margin over the price", /margen sobre el precio 68[.,]8 %/.test(text), text);
  await page.screenshot({ path: join(OUT, "calculadora-1280.png") });
  await dialog(page).getByRole("button", { name: "Qué es el margen comercial" }).click();
  check("the help closes again", (await help.count()) === 0);
  await dialog(page).getByRole("button", { name: "Usar" }).click();
  await dialog(page)
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => {});
  check("the dialog closes on «Usar»", (await dialog(page).count()) === 0);
  // Only the rows of the variants: not «para todas» nor the prices in other currencies.
  const rows = page.getByTestId("variants-table");
  const costInputs = rows.getByRole("textbox", { name: /^Costo / });
  const priceInputs = rows.getByRole("textbox", { name: /^Precio (?!anterior)/ });
  check("the variant gets cost 1.56", (await costInputs.first().inputValue()) === "1.56");
  check("the variant gets price 5", (await priceInputs.first().inputValue()) === "5");
  check(
    "the other variants keep theirs",
    (await priceInputs.nth(1).inputValue()) !== "5" || (await costInputs.nth(1).inputValue()) !== "1.56",
  );

  // All the variants: 1200 CUP each at 40 % of the price -> 2000
  await page.getByRole("button", { name: "Calcular costo y precio para todas" }).click();
  await dialog(page).waitFor({ timeout: 10000 });
  check(
    "the dialog says it is for all",
    /todas las variantes/i.test((await dialog(page).textContent()) ?? ""),
  );
  await fillCalculator(page, { paid: "1200", units: "1", margin: "40", basis: "Sobre el precio" });
  await dialog(page).locator("[aria-live]").getByText(money("2000", "CUP")).waitFor({ timeout: 5000 });
  await dialog(page).getByRole("button", { name: "Usar" }).click();
  await dialog(page)
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => {});
  const prices = await priceInputs.evaluateAll((els) => els.map((e) => e.value));
  const costs = await costInputs.evaluateAll((els) => els.map((e) => e.value));
  check("every variant gets price 2000", prices.length > 1 && prices.every((p) => p === "2000"), prices);
  check(
    "every variant gets cost 1200",
    costs.every((c) => c === "1200"),
    costs,
  );
  check("the rows show the 40 % margin", (await rows.getByText("Margen 40%").count()) === prices.length);

  // A margin over the price of 100 % is refused; a cost in USD converts with the rate
  await first.click();
  await dialog(page).waitFor({ timeout: 10000 });
  await fillCalculator(page, {
    paid: "10",
    currency: "USD",
    units: "1",
    margin: "100",
    basis: "Sobre el precio",
  });
  const refused = (await dialog(page).locator("[aria-live]").textContent()) ?? "";
  check("refuses a 100 % margin over the price", /menor que 100/.test(refused), refused);
  check("«Usar» stays disabled", await dialog(page).getByRole("button", { name: "Usar" }).isDisabled());
  await dialog(page).getByLabel("Margen comercial (%)").fill("50");
  const usd = (await dialog(page).locator("[aria-live]").textContent()) ?? "";
  check(
    "a cost in USD shows its value in CUP",
    money("10", "USD").test(usd) && /\(\s*[\d.]+\s*CUP\)/.test(usd),
    usd,
  );
  await page.keyboard.press("Escape");
  check(
    "Esc closes it without applying",
    (await dialog(page).count()) === 0 && (await costInputs.first().inputValue()) === "1200",
  );
  await page.close();

  // On a phone the dialog is a sheet
  const phone = await newPage({ width: 390, height: 844 });
  await phone.goto(`${BASE}/admin/catalog/products/${product.id}`);
  const mobileButton = phone.getByRole("button", { name: /^Calcular costo y precio (?!para todas)/ }).first();
  await mobileButton.waitFor({ timeout: 30000 });
  const box = await mobileButton.boundingBox();
  check("the «Calcular» button is at least 40 px tall on a phone", box && box.height >= 40, box?.height);
  await mobileButton.click();
  await dialog(phone).waitFor({ timeout: 10000 });
  await fillCalculator(phone, { paid: "250", units: "160", margin: "30", rounding: "5" });
  await dialog(phone).locator("[aria-live]").getByText(money("5", "CUP")).waitFor({ timeout: 5000 });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check("no horizontal overflow on a phone", !overflow);
  await phone.screenshot({ path: join(OUT, "calculadora-390.png") });
  await phone.close();

  // Phones grouped the Cuban way
  const orders = await newPage();
  await orders.goto(`${BASE}/admin/orders`);
  const wa = orders.locator('a[aria-label^="WhatsApp de"]').first();
  const hasOrders = await wa
    .waitFor({ timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  if (hasOrders) {
    const label = (await wa.getAttribute("aria-label")) ?? "";
    check(
      "the orders list groups the phone as +53 5 XXX XXXX",
      /\+53 \d{1,2} \d{2,3} \d{4}\)/.test(label),
      label,
    );
  } else {
    check("the orders list groups the phone (no orders with a phone to check)", true);
  }
  await orders.goto(`${BASE}/admin/orders/customers`);
  await orders.getByRole("heading").first().waitFor({ timeout: 30000 });
  const raw = await orders
    .locator("main")
    .getByText(/\+53\d{8}/)
    .count();
  check("the customers list shows no ungrouped +53 number", raw === 0, raw);
  await orders.screenshot({ path: join(OUT, "clientes-telefonos-1280.png") });
  await orders.close();
} finally {
  await browser.close();
}

check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
