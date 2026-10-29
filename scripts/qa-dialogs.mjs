// R13 QA in the browser: the create/edit forms of the store admin open in a dialog (Tienda Demo, owner). For each
// screen: the button opens a modal dialog with the focus inside, the list stays where it was, Esc closes it. One brand
// is created through its dialog (and removed at the end) and an invalid category keeps its dialog open with the error.
// Screenshots in .titan/qa/r13-dialogos/ (1280 and 390, light and dark). Needs pnpm dev (QA_BASE_URL for another port).
//
//   pnpm qa:dialogs

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
const OUT = join(root, ".titan/qa/r13-dialogos");
const BRAND = "QA Marca R13";
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

// [admin path, button that opens the dialog, screenshot name]
const SCREENS = [
  ["/admin/catalog/brands", "Nuevo", "marcas"],
  ["/admin/catalog/collections", "Nuevo", "colecciones"],
  ["/admin/catalog/warehouses", "Nuevo", "almacenes"],
  ["/admin/catalog/categories", "Nueva categoría", "categorias"],
  ["/admin/catalog/attributes", "Nuevo atributo", "atributos"],
  ["/admin/catalog/product-types", "Nuevo tipo", "tipos"],
  ["/admin/shipping", "Nueva zona", "zonas"],
  ["/admin/shipping", "Nuevo método", "metodos-entrega"],
  ["/admin/orders/payment-methods", "Nuevo método", "metodos-pago"],
  ["/admin/discounts", "Nueva promoción", "promociones"],
  ["/admin/discounts/vouchers", "Nuevo cupón", "cupones"],
  ["/admin/finance/expenses", "Añadir gasto", "gastos"],
  ["/admin/whatsapp-notifications", "Nuevo contacto", "contactos"],
  ["/admin/team", "Invitar persona", "equipo"],
  ["/admin/themes/home", "Añadir sección", "portada"],
  ["/admin/themes/banners", "Nuevo banner", "banners"],
  ["/admin/themes/pages", "Nueva página", "paginas"],
];

const browser = await chromium.launch({ executablePath: chromiumPath() });
const consoleErrors = [];

async function newPage({ width = 1280, height = 900, dark = false } = {}) {
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
    [storageKey, JSON.stringify(signIn.session)],
  );
  const page = await context.newPage();
  page.on("console", (m) => {
    // Not errors: the dev-only «instant navigation» notice of Next (see qa-billing.mjs), Realtime reconnects and the
    // 400 of the invalid category this script submits on purpose.
    if (m.type() === "error" && !/instant navigation|WebSocket|realtime|status of 400/i.test(m.text())) {
      consoleErrors.push(`${page.url()}: ${m.text().slice(0, 200)}`);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()}: pageerror ${String(e).slice(0, 200)}`));
  return page;
}

/** The page's button (not one inside an open dialog) with that exact name. */
const opener = (page, name) => page.locator("main").getByRole("button", { name, exact: true }).first();
const dialog = (page) => page.locator("dialog[open]");

try {
  const page = await newPage();
  for (const [path, button, name] of SCREENS) {
    await page.goto(`${BASE}${path}`);
    const open = opener(page, button);
    const found = await open
      .waitFor({ timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    if (!found) {
      check(`${name}: «${button}» is on the page`, false, path);
      continue;
    }
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await open.click();
    await dialog(page).waitFor({ timeout: 10000 });
    const focusInside = await page.evaluate(() => !!document.activeElement?.closest("dialog[open]"));
    const modal = await page.evaluate(
      () => document.querySelector("dialog[open]")?.matches(":modal") ?? false,
    );
    check(
      `${name}: opens a modal dialog with the focus inside`,
      modal && focusInside,
      `${modal} ${focusInside}`,
    );
    await page.screenshot({ path: join(OUT, `${name}-1280.png`) });
    await page.keyboard.press("Escape");
    const closed = await dialog(page)
      .waitFor({ state: "detached", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    check(`${name}: Esc closes it and the list stays in place`, closed && scrollAfter === scrollBefore);
  }

  // Create a brand through its dialog: it closes and the list shows it.
  await page.goto(`${BASE}/admin/catalog/brands`);
  await opener(page, "Nuevo").click();
  await dialog(page).locator("#name").fill(BRAND);
  await dialog(page).getByRole("button", { name: "Guardar" }).click();
  await dialog(page).waitFor({ state: "detached", timeout: 15000 });
  await page.getByText(BRAND).first().waitFor({ timeout: 15000 });
  check("brand: saved from the dialog, which closes and the list shows it", true);

  // An invalid category keeps its dialog open with the error inside.
  await page.goto(`${BASE}/admin/catalog/categories`);
  await opener(page, "Nueva categoría").click();
  await dialog(page).getByRole("button", { name: "Guardar" }).click();
  await page.waitForTimeout(2500);
  const stillOpen = (await dialog(page).count()) === 1;
  const errorInside =
    (await dialog(page).locator("[role=alert], p.text-destructive, .text-destructive").count()) > 0;
  check("category: an invalid form stays open with the error inside", stillOpen && errorInside);
  await page.screenshot({ path: join(OUT, "categorias-error-1280.png") });
  await page.context().close();

  // Phone (full-screen sheet) and dark mode.
  for (const [width, dark] of [
    [390, false],
    [390, true],
    [1280, true],
  ]) {
    const p = await newPage({ width, height: width === 390 ? 844 : 900, dark });
    const tag = `${width}${dark ? "-dark" : ""}`;
    for (const [path, button, name] of [SCREENS[6], SCREENS[9]]) {
      await p.goto(`${BASE}${path}`);
      await opener(p, button).click();
      await dialog(p).waitFor({ timeout: 10000 });
      if (width === 390 && !dark) {
        const box = await dialog(p).boundingBox();
        check(
          `${name} 390: the dialog fills the screen`,
          box && box.width >= 389 && box.height >= 840,
          JSON.stringify(box),
        );
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check(`${name} 390: no horizontal scroll`, overflow <= 0, overflow);
      }
      await p.screenshot({ path: join(OUT, `${name}-${tag}.png`) });
      await dialog(p).getByRole("button", { name: "Cerrar" }).click();
      await dialog(p).waitFor({ state: "detached", timeout: 5000 });
    }
    await p.context().close();
  }
} catch (error) {
  check("unexpected error", false, error?.stack ?? error);
} finally {
  await service.from("brands").delete().eq("store_id", demo.id).eq("name", BRAND);
  await browser.close();
}

check("no console errors", consoleErrors.length === 0, consoleErrors.join("\n"));
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed; screenshots in ${OUT}`);
process.exit(passed === results.length ? 0 : 1);
