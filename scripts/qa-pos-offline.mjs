// Browser QA of POS phase 3: Kshop Admin (Vite) opens without a connection on what it saved, on the Tienda Demo. The page
// assets stay reachable, like in the app where they are inside the APK; the server and Supabase do not answer. Native
// files and a real phone are a separate check (docs/APPS.md). Screenshots go to .titan/qa/pos/.
//
//   pnpm dev + pnpm --filter @kshop/admin-app dev, then: pnpm qa:pos-offline   (QA_BASE_URL, QA_ADMIN_APP_URL)

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

  // A sale in the queue survives closing the app.
  const storeId = await page.evaluate(
    () => JSON.parse(localStorage.getItem("kshop.offline.boot")).stores.find((s) => s.slug === "demo")?.id,
  );
  const saleKey = `${storeId}/qa-offline-sale`;
  await page.evaluate(
    ([k]) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("kshop-pos");
        open.onerror = reject;
        open.onsuccess = () => {
          const tx = open.result.transaction("sales", "readwrite");
          tx.objectStore("sales").put({ sale: { id: "qa-offline-sale" } }, k);
          tx.oncomplete = () => resolve(null);
          tx.onerror = reject;
        };
      }),
    [saleKey],
  );
  await page.goto(`${ADMIN}/admin/pos`);
  await page.getByTestId("pos-pending").waitFor({ timeout: 30000 });
  check(
    "a saved sale is still there after closing",
    /: 1$/.test(await page.getByTestId("pos-pending").innerText()),
  );
  await page.evaluate(
    ([k]) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("kshop-pos");
        open.onerror = reject;
        open.onsuccess = () => {
          const tx = open.result.transaction("sales", "readwrite");
          tx.objectStore("sales").delete(k);
          tx.oncomplete = () => resolve(null);
          tx.onerror = reject;
        };
      }),
    [saleKey],
  );

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
  await browser.close();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
