// Browser QA of POS phase 3: Kshop Admin (Vite) opens without a connection on what it saved, on the Tienda Demo. The page
// assets stay reachable, like in the app where they are inside the APK; the server and Supabase do not answer. Native
// files and a real phone are a separate check (docs/APPS.md). Screenshots go to .titan/qa/pos/.
//
//   pnpm dev + pnpm --filter @kshop/admin-app dev, then: pnpm qa:pos-offline   (QA_BASE_URL, QA_ADMIN_APP_URL)

import { createClient } from "@supabase/supabase-js";
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

const ADMIN = env.QA_ADMIN_APP_URL ?? "http://localhost:5174";
const API = env.QA_BASE_URL ?? "http://localhost:3000";
const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const OUT = join(root, ".titan/qa/pos");
mkdirSync(OUT, { recursive: true });

const service = createClient(SUPABASE, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
/** Counter sales this run left in the Tienda Demo; cancelled at the end, which puts the stock back. */
const created = new Set();

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

const browser = await chromium.launch({ executablePath: chromiumPath(), headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// The phone says it has no connection and nothing answers.
let cut = false;
await context.addInitScript(() => {
  if (sessionStorage.getItem("qa-offline") === "1")
    Object.defineProperty(navigator, "onLine", { get: () => false });
});
const silence = async (route) => (cut ? route.abort("internetdisconnected") : route.continue());
await context.route(`${SUPABASE}/**`, silence);
await context.route(`${API}/**`, silence);
async function setConnection(up) {
  cut = !up;
  await page.evaluate((flag) => sessionStorage.setItem("qa-offline", flag), up ? "0" : "1");
}

const catalogText = () => page.getByTestId("pos-catalog").innerText();
const count = (text) => Number(text.match(/(\d+) productos/)?.[1] ?? -1);
const authKey = () =>
  page.evaluate(() =>
    Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token")),
  );

try {
  // With a connection: sign in and download.
  await page.goto(ADMIN);
  await page.fill("#email", "dueno@demo.kshop.test");
  await page.fill("#password", env.DEMO_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  const picker = page.getByTestId("store-picker");
  const storeName = page.getByTestId("admin-store-name");
  await Promise.race([picker.waitFor({ timeout: 60000 }), storeName.waitFor({ timeout: 60000 })]);
  if (await picker.isVisible()) await picker.getByRole("button", { name: /Tienda Demo/ }).click();
  await storeName.waitFor({ timeout: 60000 });

  const tabs = await page.getByRole("navigation", { name: "Secciones" }).innerText();
  check(
    "tabs: Inicio · Caja · Pedidos · Productos · Más",
    /Inicio\s+Caja\s+Pedidos\s+Productos\s+Más/.test(tabs),
    tabs,
  );
  await page.getByRole("link", { name: "Más", exact: true }).click();
  await page.getByTestId("more-sales").waitFor({ timeout: 15000 });
  check("Ventas is reachable from Más", true);

  await page.getByRole("link", { name: "Caja", exact: true }).click();
  await page.getByTestId("pos-catalog").waitFor({ timeout: 60000 });
  const downloaded = count(await catalogText());
  check("the catalog downloads", downloaded > 0, await catalogText());
  await page.screenshot({ path: join(OUT, "fase3-caja-con-red.png") });

  // No connection, the token still valid.
  await setConnection(false);
  await page.goto(`${ADMIN}/admin/pos`);
  await page.getByTestId("pos-offline").waitFor({ timeout: 30000 });
  check("no connection: opens without asking to sign in", (await page.locator("#password").count()) === 0);
  check(
    "no connection: the catalog is still there",
    count(await catalogText()) === downloaded,
    await catalogText(),
  );
  await page.screenshot({ path: join(OUT, "fase3-caja-sin-red.png") });

  // No connection and the token expired: the sign-in screen would lock the cashier out.
  const key = await authKey();
  await page.evaluate((k) => {
    const session = JSON.parse(localStorage.getItem(k));
    session.expires_at = Math.floor(Date.now() / 1000) - 3600;
    localStorage.setItem(k, JSON.stringify(session));
  }, key);
  await page.goto(`${ADMIN}/admin/pos`);
  await page.getByTestId("pos-status").waitFor({ timeout: 30000 });
  check(
    "expired token: still in, without asking to sign in",
    (await page.locator("#password").count()) === 0,
  );
  check(
    "expired token: the session is kept to renew later",
    !!(await page.evaluate((k) => localStorage.getItem(k), key)),
  );

  // Selling without a connection: the piece of the name, the cart and a payment in two currencies.
  const readSales = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open("kshop-pos");
          open.onerror = reject;
          open.onsuccess = () => {
            const get = open.result.transaction("sales").objectStore("sales").getAll();
            get.onsuccess = () => resolve(get.result);
            get.onerror = reject;
          };
        }),
    );
  await page.goto(`${ADMIN}/admin/pos`);
  await page.getByTestId("pos-search").waitFor({ timeout: 30000 });
  await page.getByTestId("pos-search").fill("vestido");
  const firstResult = page.getByTestId("pos-results").getByRole("button").first();
  await firstResult.waitFor({ timeout: 10000 });
  check(
    "sell offline: finds by a piece of the name",
    /vestido/i.test(await firstResult.innerText()),
    await firstResult.innerText(),
  );
  await page.screenshot({ path: join(OUT, "fase4-busqueda.png") });
  await firstResult.click();
  await page.getByRole("button", { name: /Añadir uno de/ }).click();
  check(
    "sell offline: the search clears and the line goes to 2",
    (await page.getByTestId("pos-quantity").innerText()) === "2",
  );
  const totalCup = Number(
    (await page.getByTestId("pos-total").innerText()).replace(/[^\d,]/g, "").replace(",", "."),
  );
  await page.screenshot({ path: join(OUT, "fase4-carrito.png") });
  await page.getByTestId("pos-charge").click();
  await page.selectOption("#pos-currency", "USD");
  await page.fill("#pos-rate", "320");
  await page.fill("#pos-amount", String(Math.round((totalCup / 2 / 320) * 100) / 100));
  await page.getByTestId("pos-preview").getByText("Faltan").waitFor({ timeout: 10000 });
  await page.screenshot({ path: join(OUT, "fase4-cobro.png") });
  await page.getByTestId("pos-submit").click();
  await page.getByTestId("pos-payments").waitFor({ timeout: 10000 });
  const rest = Number(await page.inputValue("#pos-amount"));
  check("sell offline: proposes the rest", rest > 0 && rest < totalCup, rest);
  await page.getByTestId("pos-submit").click();
  await page.getByTestId("pos-saved").waitFor({ timeout: 10000 });
  check(
    "sell offline: the sale is saved and the cart is empty",
    (await page.getByTestId("pos-cart").count()) === 0,
  );
  check(
    "sell offline: one sale waits",
    /: 1$/.test(await page.getByTestId("pos-pending").innerText()),
    await page.getByTestId("pos-pending").innerText(),
  );
  await page.screenshot({ path: join(OUT, "fase4-guardada.png") });
  await page.goto(`${ADMIN}/admin/pos`);
  await page.getByTestId("pos-pending").waitFor({ timeout: 30000 });
  const [queued] = await readSales();
  check(
    "sell offline: survives closing the app",
    queued?.sale?.lines?.[0]?.quantity === 2 && queued.sale.payments.length === 2,
    JSON.stringify(queued),
  );
  check(
    "sell offline: the dollars keep their rate",
    queued?.sale?.payments?.[0]?.currency === "USD" && queued.sale.payments[0].rate === 320,
    JSON.stringify(queued?.sale?.payments),
  );
  // Too many dollars in one payment: change.
  await page.getByTestId("pos-search").fill("vestido");
  await page.getByTestId("pos-results").getByRole("button").first().click();
  await page.getByTestId("pos-charge").click();
  await page.selectOption("#pos-currency", "USD");
  await page.fill("#pos-rate", "320");
  await page.fill("#pos-amount", "50");
  await page
    .getByTestId("pos-preview")
    .getByText(/^Vuelto:/)
    .waitFor({ timeout: 10000 });
  check("sell offline: says the change", true);
  await page.getByRole("button", { name: "Volver" }).click();
  await page.getByRole("button", { name: /Quitar uno de/ }).click();

  const storeId = await page.evaluate(
    () => JSON.parse(localStorage.getItem("kshop.offline.boot")).stores.find((s) => s.slug === "demo")?.id,
  );
  const pendingCount = async () =>
    Number((await page.getByTestId("pos-pending").innerText()).match(/(\d+)$/)?.[1]);
  const waitPending = async (expected) => {
    for (let i = 0; i < 60; i++) {
      if ((await pendingCount()) === expected) return true;
      await page.waitForTimeout(500);
    }
    return false;
  };
  const orderOf = async (id) => {
    const { data } = await service
      .from("orders")
      .select("id, number, status, channel, customer_phone, notify_customer")
      .eq("store_id", storeId)
      .eq("idempotency_key", `pos:${id}`);
    for (const o of data ?? []) created.add(o.id);
    return data ?? [];
  };
  const sellOne = async () => {
    await page.getByTestId("pos-search").fill("vestido");
    await page.getByTestId("pos-results").getByRole("button").first().click();
    await page.getByTestId("pos-charge").click();
    await page.getByTestId("pos-submit").click();
    await page.getByTestId("pos-saved").waitFor({ timeout: 10000 });
  };

  check(
    "day: says what the phone charged, per currency",
    /USD/.test(await page.getByTestId("pos-day-summary").innerText()) &&
      /CUP/.test(await page.getByTestId("pos-day-summary").innerText()),
    await page.getByTestId("pos-day-summary").innerText(),
  );
  await page.screenshot({ path: join(OUT, "fase5-dia-sin-red.png"), fullPage: true });

  // The answer is lost after the server saved the sale: the next try must not create another order.
  const saleId = (await readSales())[0].sale.id;
  let lost = 0;
  let inFlight = false;
  await context.route(`${API}/api/v1/stores/*/pos/sales`, async (route) => {
    if (lost === 0 && !inFlight) {
      inFlight = true;
      await route.fetch().catch(() => {});
      lost += 1;
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  await setConnection(true);
  await page.goto(`${ADMIN}/admin/pos`);
  await page.getByTestId("pos-pending").waitFor({ timeout: 60000 });
  for (let i = 0; i < 60 && lost === 0; i++) await page.waitForTimeout(500);
  check(
    "answer lost: the sale stays in the queue",
    lost === 1 && (await pendingCount()) === 1,
    await pendingCount(),
  );
  check("answer lost: the server did save it", (await orderOf(saleId)).length === 1);
  await page.getByTestId("pos-upload").click();
  check("answer lost: the retry empties the queue", await waitPending(0), await pendingCount());
  const [uploaded, ...twin] = await orderOf(saleId);
  check("answer lost: one order, not two", !!uploaded && twin.length === 0, twin.length);
  check(
    "upload: a counter sale, delivered, without phone or notices",
    uploaded?.channel === "pos" &&
      uploaded.status === "delivered" &&
      uploaded.customer_phone === null &&
      uploaded.notify_customer === false,
    JSON.stringify(uploaded),
  );
  await page.getByTestId("pos-day-list").getByText(`Pedido ${uploaded?.number}`).waitFor({ timeout: 10000 });
  check("upload: the phone shows the real number", true);
  await context.unroute(`${API}/api/v1/stores/*/pos/sales`);

  // Refused by the server: kept, with the reason in view, and it goes up when that is solved.
  await context.route(`${API}/api/v1/stores/*/pos/sales`, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "section_managed", message: "La caja está gestionada por el administrador." },
      }),
    }),
  );
  await sellOne();
  await page.getByTestId("pos-held").waitFor({ timeout: 30000 });
  check(
    "refused: held with the reason",
    /gestionada/.test(await page.getByTestId("pos-held").innerText()),
    await page.getByTestId("pos-held").innerText(),
  );
  check("refused: nothing is lost", (await pendingCount()) === 1);
  await page.screenshot({ path: join(OUT, "fase5-retenida.png"), fullPage: true });
  await context.unroute(`${API}/api/v1/stores/*/pos/sales`);
  await page.getByTestId("pos-upload").click();
  check("refused: goes up when it is solved", await waitPending(0), await pendingCount());
  check("refused: no longer held", (await page.getByTestId("pos-held").count()) === 0);

  // Voided before uploading: it arrives cancelled, without money or stock.
  await setConnection(false);
  await page.goto(`${ADMIN}/admin/pos`);
  await page.getByTestId("pos-search").waitFor({ timeout: 30000 });
  await sellOne();
  const voidedId = (await readSales()).find((q) => !q.uploaded).sale.id;
  await page.getByTestId("pos-day-list").getByRole("button", { name: "Anular" }).first().click();
  await page.getByRole("button", { name: "Anular venta" }).click();
  await page.getByTestId("pos-day-list").getByText("Anulada").waitFor({ timeout: 10000 });
  check("void: marked on the phone", true);

  // Signing out with sales waiting asks first.
  await page.getByRole("link", { name: "Más", exact: true }).click();
  await page.getByTestId("sign-out").click();
  await page.getByText(/1 venta sin subir/).waitFor({ timeout: 10000 });
  check("sign out with sales waiting: asks first", true);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("link", { name: "Caja", exact: true }).click();

  await setConnection(true);
  await page.goto(`${ADMIN}/admin/pos`);
  await page.getByTestId("pos-pending").waitFor({ timeout: 60000 });
  check("void: uploads by itself when the connection returns", await waitPending(0), await pendingCount());
  const [voided] = await orderOf(voidedId);
  check("void: the owner sees it cancelled", voided?.status === "cancelled", JSON.stringify(voided));
  await setConnection(false);

  // A week without the server confirming the access.
  const oldBoot = await page.evaluate(() => localStorage.getItem("kshop.offline.boot"));
  await page.evaluate(() => {
    const boot = JSON.parse(localStorage.getItem("kshop.offline.boot"));
    boot.confirmedAt = Date.now() - 8 * 86_400_000;
    localStorage.setItem("kshop.offline.boot", JSON.stringify(boot));
  });
  await page.goto(`${ADMIN}/admin/pos`);
  await page.getByTestId("offline-expired").waitFor({ timeout: 30000 });
  check("more than 7 days offline: asks to connect", true);
  await page.evaluate((b) => localStorage.setItem("kshop.offline.boot", b), oldBoot);

  // Back online: the session renews by itself.
  await setConnection(true);
  await page.goto(`${ADMIN}/admin`);
  await storeName.waitFor({ timeout: 60000 });
  check(
    "back online: renews the session and opens normally",
    (await page.locator("#password").count()) === 0,
  );
  await page.goto(`${ADMIN}/admin/pos`);
  await page.getByTestId("pos-status").waitFor({ timeout: 30000 });
  check("back online: no offline notice", (await page.getByTestId("pos-offline").count()) === 0);

  // A refusal is not a lack of connection: what is saved does not open the store.
  await context.route(`${API}/api/v1/me**`, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: '{"error":{"code":"forbidden","message":"No"}}',
    }),
  );
  await page.goto(`${ADMIN}/admin/pos`);
  await page.getByRole("button", { name: "Reintentar" }).waitFor({ timeout: 30000 });
  check(
    "refused by the server: the saved access does not open it",
    (await page.getByTestId("pos-status").count()) === 0,
  );
  await context.unroute(`${API}/api/v1/me**`);

  // Signing out leaves nothing to open without a session.
  await page.goto(`${ADMIN}/admin/more`);
  await page.getByTestId("sign-out").click();
  await page.locator("#password").waitFor({ timeout: 30000 });
  check(
    "sign out: forgets the saved access",
    (await page.evaluate(() => localStorage.getItem("kshop.offline.boot"))) === null,
  );

  check("no errors in the page", pageErrors.length === 0, pageErrors.join(" | "));
} finally {
  const { data: demo } = await service.from("stores").select("id").eq("slug", "demo").single();
  for (const id of created) {
    await service.rpc("order_cancel", {
      p_store_id: demo.id,
      p_order_id: id,
      p_reason: "QA",
      p_user_id: null,
    });
  }
  await browser.close();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
