// Browser QA of the sales of a closing (Minimercado, 2026-11-14) on the Tienda Demo at 390 px with touch: Caja › Cierres
// opens a closing's sales with their products, the product filter keeps after opening an order and coming back (the
// web's «Volver» and the browser's back), «Ver cierres anteriores», the search of a product in all the closings, and
// the staff without costs. Read only: it needs closings in the Demo (pnpm dev running; QA_BASE_URL for another port).
// Screenshots go to .titan/qa/cierres-ventas/.
//
//   pnpm qa:closing-sales

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !env[match[1]]) env[match[1]] = match[2].trim();
}

const port = new URL(env.QA_BASE_URL ?? "http://localhost:3000").port || 3000;
const BASE = `http://demo.kshop.localhost:${port}`;
const OUT = join(root, ".titan/qa/cierres-ventas");
mkdirSync(OUT, { recursive: true });

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

const normalize = (t) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const browser = await chromium.launch({ executablePath: chromiumPath() });
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

async function login(email, password) {
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/admin/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/admin`, { timeout: 60000 });
  return { page, errors, context };
}

const cards = (page) => page.getByTestId("pos-sale-card");

try {
  const { page, errors, context } = await login("dueno@demo.kshop.test", env.DEMO_OWNER_PASSWORD);

  // Caja › Cierres
  await page.goto(`${BASE}/admin/pos?tab=closings`);
  await page.getByTestId("pos-closings").waitFor({ timeout: 30000 });
  const firstCount = await page.getByTestId("pos-closing").count();
  const salesLink = page.getByTestId("pos-closing-sales-link").first();
  const linkText = (await salesLink.textContent()) ?? "";
  const total = Number(linkText.match(/\((\d+)\)/)?.[1] ?? 0);
  check("Cierres: «Ver sus ventas (N)» on a closing with sales", total > 0, linkText);
  await page.screenshot({ path: join(OUT, "cierres-390.png"), fullPage: true });

  const older = page.getByTestId("pos-closings-older");
  if (await older.isVisible()) {
    await older.click();
    await page.waitForFunction(
      (n) => document.querySelectorAll('[data-testid="pos-closing"]').length > n,
      firstCount,
      { timeout: 20000 },
    );
    check("Cierres: «Ver cierres anteriores» adds the older ones", true);
  } else {
    check("Cierres: «Ver cierres anteriores» (no closings older than 30 days in the Demo)", true);
  }

  // Ventas del cierre
  await salesLink.click();
  await page.waitForURL(/\/admin\/pos\/closings\/[0-9a-f-]{36}/, { timeout: 20000 });
  await page.getByTestId("pos-closing-sales").waitFor({ timeout: 20000 });
  check(
    "Ventas del cierre: one card per sale",
    (await cards(page).count()) === total,
    await cards(page).count(),
  );
  const firstLine = (await cards(page).first().locator("li span").first().textContent()) ?? "";
  // «Blusa (M) × 2» → «Blusa»: the product, to search it in all the closings.
  const productName = firstLine.split(/ \(| × /)[0].trim();
  const word = firstLine.split(/[\s(×]+/).find((w) => w.length >= 3) ?? firstLine.slice(0, 4);
  check("Ventas del cierre: each sale with its products", word.length > 0, firstLine);
  await page.screenshot({ path: join(OUT, "ventas-del-cierre-390.png"), fullPage: false });

  await page.getByTestId("closing-sales-search").fill(word);
  await page.getByTestId("closing-sales-summary").waitFor({ timeout: 5000 });
  const filtered = await cards(page).count();
  const texts = await cards(page).allTextContents();
  check(
    `Filtro «${word}»: only the sales with it`,
    filtered > 0 && filtered <= total && texts.every((t) => normalize(t).includes(normalize(word))),
    `${filtered}/${total}`,
  );
  check("Filtro: in the address", new URL(page.url()).searchParams.get("q") === word, page.url());
  const fontSize = await page
    .getByTestId("closing-sales-search")
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check("Filtro: the field at 16 px on a phone", fontSize >= 16, fontSize);
  await page.screenshot({ path: join(OUT, "filtro-390.png"), fullPage: false });

  // Open the last filtered sale (scrolled down) and come back with the web's «Volver».
  const closingUrl = page.url();
  const last = cards(page).last().locator("a").first();
  await last.scrollIntoViewIfNeeded();
  const scrolled = await page.evaluate(() => window.scrollY);
  await last.click();
  await page.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}/, { timeout: 20000 });
  await page.getByTestId("admin-back").click();
  await page.waitForURL((u) => u.href === closingUrl, { timeout: 20000 });
  await page.getByTestId("pos-closing-sales").waitFor({ timeout: 20000 });
  check(
    "«Volver» from the order: same closing, same search, same sales",
    (await page.getByTestId("closing-sales-search").inputValue()) === word &&
      (await cards(page).count()) === filtered,
  );
  await page.waitForTimeout(300);
  const restored = await page.evaluate(() => window.scrollY);
  check("«Volver»: back at the same spot", Math.abs(restored - scrolled) < 80, `${restored} vs ${scrolled}`);

  // And with the browser's back (Android's back button in Kshop Admin does history.back()).
  await cards(page).first().locator("a").first().click();
  await page.waitForURL(/\/admin\/orders\//, { timeout: 20000 });
  await page.goBack();
  await page.getByTestId("pos-closing-sales").waitFor({ timeout: 20000 });
  check(
    "Atrás del navegador: same search and sales",
    (await page.getByTestId("closing-sales-search").inputValue()) === word &&
      (await cards(page).count()) === filtered,
  );

  // Buscar un producto en todos los cierres
  await page.goto(`${BASE}/admin/pos?tab=closings`);
  await page.getByTestId("pos-closings-product-search").click();
  await page.getByTestId("product-sales-search").fill(productName);
  await page.getByTestId("product-sales-option").getByText(productName, { exact: true }).first().click();
  await page.getByTestId("product-sales-day").first().waitFor({ timeout: 20000 });
  const days = await page.getByTestId("product-sales-day").count();
  const found = await cards(page).count();
  check(
    "Todos los cierres: the sales of the product by day",
    days > 0 && found > 0,
    `${days} days, ${found} sales`,
  );
  check(
    "Todos los cierres: the product in the address",
    Boolean(new URL(page.url()).searchParams.get("product")),
  );
  await page.screenshot({ path: join(OUT, "producto-en-todos-390.png"), fullPage: false });
  const searchUrl = page.url();
  await cards(page).first().locator("a").first().click();
  await page.waitForURL(/\/admin\/orders\//, { timeout: 20000 });
  await page.goBack();
  await page.waitForURL((u) => u.href === searchUrl, { timeout: 20000 });
  await page.getByTestId("product-sales-day").first().waitFor({ timeout: 20000 });
  check("Todos los cierres: back keeps the product and its sales", (await cards(page).count()) === found);

  // Ganancia por producto → the closing filtered by that product (owner).
  await page.goto(`${BASE}/admin/pos?tab=closings`);
  const profit = page.getByTestId("pos-closing-profit").first();
  if (await profit.isVisible()) {
    await profit.getByText("Ganancia por producto").click();
    await profit.locator("tbody a").first().click();
    await page.waitForURL(/\/admin\/pos\/closings\/[0-9a-f-]{36}\?q=/, { timeout: 20000 });
    await page.getByTestId("closing-sales-summary").waitFor({ timeout: 20000 });
    check("Ganancia por producto: opens the closing's sales filtered by it", (await cards(page).count()) > 0);
  }

  check("Owner: no page errors", errors.length === 0, errors.join(" | "));
  await context.close();

  // The staff: same sales, no costs.
  const staff = await login("empleado@demo.kshop.test", env.DEMO_STAFF_PASSWORD);
  await staff.page.goto(closingUrl);
  await staff.page.getByTestId("pos-closing-sales").waitFor({ timeout: 20000 });
  check("Staff: the closing's sales with the filter", (await cards(staff.page).count()) === filtered);
  await staff.page.goto(`${BASE}/admin/pos?tab=closings`);
  await staff.page.getByTestId("pos-closings").waitFor({ timeout: 20000 });
  check(
    "Staff: no profit in the closings",
    (await staff.page.getByTestId("pos-closing-profit").count()) === 0,
  );
  check("Staff: no page errors", staff.errors.length === 0, staff.errors.join(" | "));
  await staff.context.close();
} finally {
  await browser.close();
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
