// R12 QA in the browser: visibility of the admin menu sections on the Tienda Demo (owner) and the superadmin panel
// (store list v3, store page with shortcuts and the «Menú de la tienda» block). Screenshots in .titan/qa/r12-superadmin-v3/
// (1280 and 390, light and dark). The Demo's section settings are restored at the end, and the temporary superadmin
// (@e2e.kshop.test) is removed, also on failure. Needs pnpm dev (QA_BASE_URL for another port).
//
//   pnpm qa:sections

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
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
const STORE_URL = `http://demo.kshop.localhost:${PORT}`;
const PLATFORM_URL = `http://kshop.localhost:${PORT}`;
const OUT = join(root, ".titan/qa/r12-superadmin-v3");
const ROOT_EMAIL = "qa-sections-root@e2e.kshop.test";
const ROOT_PASSWORD = randomBytes(12).toString("base64url");
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
const storageKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

async function sessionOf(email, password) {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in of ${email} failed: ${error.message}`);
  return data.session;
}

async function setSection(storeId, section, visibility) {
  const { error } =
    visibility === "visible"
      ? await service.from("store_section_settings").delete().eq("store_id", storeId).eq("section", section)
      : await service.from("store_section_settings").upsert({ store_id: storeId, section, visibility });
  if (error) throw error;
}

async function removeRoot() {
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) if (u.email === ROOT_EMAIL) await service.auth.admin.deleteUser(u.id);
}

const { data: demo, error: demoError } = await service
  .from("stores")
  .select("id")
  .eq("slug", "demo")
  .single();
if (demoError) throw demoError;
const { data: saved } = await service.from("store_section_settings").select("*").eq("store_id", demo.id);

const browser = await chromium.launch({ executablePath: chromiumPath() });
const consoleErrors = [];

async function newPage(session, { width = 1280, height = 900, dark = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: dark ? "dark" : "light",
  });
  await context.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // storage blocked: the page will show the login
      }
    },
    [storageKey, JSON.stringify(session)],
  );
  const page = await context.newPage();
  page.on("console", (m) => {
    // Realtime reconnects and the dev-only «instant navigation» notice of Next (see qa-billing.mjs) are not errors.
    if (m.type() === "error" && !/instant navigation|WebSocket|realtime/i.test(m.text())) {
      consoleErrors.push(`${page.url()}: ${m.text().slice(0, 200)}`);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()}: pageerror ${String(e).slice(0, 200)}`));
  return page;
}

const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });

try {
  await setSection(demo.id, "shipping", "managed");
  await setSection(demo.id, "finance", "hidden");
  await setSection(demo.id, "vouchers", "visible");
  const owner = await sessionOf(env.DEMO_OWNER_EMAIL ?? "dueno@demo.kshop.test", env.DEMO_OWNER_PASSWORD);

  // --- Store admin as the owner -------------------------------------------------------------------------------
  for (const dark of [false, true]) {
    const page = await newPage(owner, { dark });
    await page.goto(`${STORE_URL}/admin`);
    await page.getByTestId("nav-home").first().waitFor({ timeout: 60000 });
    if (!dark) {
      check(
        "owner: «Finanzas» (hidden) is not in the menu",
        (await page.getByTestId("nav-finance").count()) === 0,
      );
      const shipping = page.getByTestId("nav-shipping").first();
      check(
        "owner: «Entregas» (managed) is in the menu with «Admin»",
        (await shipping.textContent())?.includes("Admin"),
      );
    }
    await shot(page, `01-owner-menu-1280${dark ? "-dark" : ""}`);

    await page.goto(`${STORE_URL}/admin/shipping`);
    await page.getByTestId("section-notice").waitFor({ timeout: 30000 });
    if (!dark) {
      check(
        "owner: managed section shows the notice",
        (await page.getByTestId("section-notice").textContent())?.includes("la gestiona el administrador"),
      );
    }
    await shot(page, `02-owner-managed-1280${dark ? "-dark" : ""}`);

    await page.goto(`${STORE_URL}/admin/finance`);
    await page.getByTestId("section-hidden").waitFor({ timeout: 30000 });
    if (!dark) check("owner: hidden section by its URL says it is not available", true);
    await shot(page, `03-owner-hidden-1280${dark ? "-dark" : ""}`);

    if (!dark) {
      // Realtime: hiding «Cupones» from the superadmin's side takes it out of the open menu.
      await page.goto(`${STORE_URL}/admin`);
      await page.getByTestId("nav-vouchers").first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(2000); // the Realtime channel joins
      await setSection(demo.id, "vouchers", "hidden");
      const gone = await page
        .getByTestId("nav-vouchers")
        .first()
        .waitFor({ state: "detached", timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      check("owner: a section hidden while the admin is open leaves the menu (Realtime)", gone);
      await setSection(demo.id, "vouchers", "visible");
    }
    await page.context().close();
  }

  const mobile = await newPage(owner, { width: 390, height: 844 });
  await mobile.goto(`${STORE_URL}/admin/shipping`);
  await mobile.getByTestId("section-notice").waitFor({ timeout: 60000 });
  await shot(mobile, "04-owner-managed-390");
  await mobile.getByRole("button", { name: "Abrir menú" }).click();
  await mobile.getByRole("dialog", { name: "Menú" }).waitFor();
  await shot(mobile, "05-owner-menu-390");
  await mobile.context().close();

  // --- Store admin as the superadmin ---------------------------------------------------------------------------
  await removeRoot();
  const { error: rootError } = await service.auth.admin.createUser({
    email: ROOT_EMAIL,
    password: ROOT_PASSWORD,
    email_confirm: true,
    app_metadata: { role: "superadmin" },
  });
  if (rootError) throw rootError;
  const rootSession = await sessionOf(ROOT_EMAIL, ROOT_PASSWORD);

  const rootPage = await newPage(rootSession);
  await rootPage.goto(`${STORE_URL}/admin`);
  await rootPage.getByTestId("nav-home").first().waitFor({ timeout: 60000 });
  const rootFinance = rootPage.getByTestId("nav-finance").first();
  check(
    "superadmin: sees the hidden «Finanzas» marked «Oculta»",
    (await rootFinance.count()) > 0 && (await rootFinance.textContent())?.includes("Oculta"),
  );
  await rootPage.goto(`${STORE_URL}/admin/finance`);
  await rootPage.getByTestId("section-notice").waitFor({ timeout: 30000 });
  check(
    "superadmin: the hidden section opens with its notice",
    (await rootPage.getByTestId("section-notice").textContent())?.includes("oculta al personal"),
  );
  await shot(rootPage, "06-superadmin-hidden-1280");
  await rootPage.context().close();

  // --- Superadmin › Tiendas (list v3) ---------------------------------------------------------------------------
  for (const [width, dark] of [
    [1280, false],
    [1280, true],
    [390, false],
    [390, true],
  ]) {
    const page = await newPage(rootSession, { width, height: width === 390 ? 844 : 900, dark });
    let listRequests = 0;
    page.on(
      "request",
      (r) => r.url().includes("/api/v1/platform/stores") && r.method() === "GET" && listRequests++,
    );
    await page.goto(`${PLATFORM_URL}/superadmin`);
    const row = page.getByTestId(width === 390 ? "store-card-demo" : "store-row-demo");
    await row.waitFor({ timeout: 60000 });
    const tag = `${width}${dark ? "-dark" : ""}`;
    if (!dark) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`superadmin list ${width}: no horizontal scroll`, overflow <= 0, overflow);
      // Each request is one SQL statement (platform_stores_overview); dev mounts effects twice (React StrictMode).
      check(`superadmin list ${width}: at most one list request per mount`, listRequests <= 2, listRequests);
      for (const text of ["Por cobrar", "Vence", "pedidos 30 d", "Último pedido", "productos"]) {
        check(`superadmin list ${width}: shows «${text}»`, (await page.getByText(text).count()) > 0);
      }
    }
    await shot(page, `07-superadmin-list-${tag}`);
    if (width === 1280 && !dark) {
      await page.getByTestId("store-search").fill("zzz-no-such-store");
      check(
        "superadmin list: search with no match",
        (await page.getByText("Ninguna tienda coincide").count()) === 1,
      );
      await page.getByTestId("store-search").fill("demo");
      await row.waitFor();
      check("superadmin list: search by slug finds the Demo", true);
      await page.getByTestId("store-search").fill("");
      await page.getByTestId("store-actions-demo").first().locator("summary").click();
      await shot(page, "08-superadmin-list-actions-1280");
      await page.getByRole("button", { name: "Enviar acceso al dueño" }).first().click();
      check(
        "superadmin list: «Enviar acceso al dueño» opens from the row",
        (await page.getByTestId("row-owner-access").count()) === 1,
      );
    }
    await page.context().close();
  }
} catch (error) {
  check("unexpected error", false, error?.stack ?? error);
} finally {
  await service.from("store_section_settings").delete().eq("store_id", demo.id);
  if (saved?.length) await service.from("store_section_settings").insert(saved);
  await removeRoot();
  await browser.close();
}

check("no console errors", consoleErrors.length === 0, consoleErrors.join("\n"));
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed; screenshots in ${OUT}`);
process.exit(passed === results.length ? 0 : 1);
