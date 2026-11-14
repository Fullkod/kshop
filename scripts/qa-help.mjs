// KSH0005 QA in the browser: the in-app help. On the Tienda Demo as the owner, the «?» of each screen opens
// «Ayuda · <vista>» with that screen's guides (the first one unfolded) and «Toda la ayuda»; the Ayuda page searches,
// filters by audience (and remembers it), keeps «Tu primer día» and fits a phone. The employee only gets their
// guides; a temporary superadmin gets the panel's. Kshop Admin (QA_ADMIN_APP_URL, skipped when it is not running)
// has the «?» and Más › Ayuda. Screenshots in .titan/qa/ksh0005-ayuda/. Needs pnpm dev (QA_BASE_URL for another port).
//
//   pnpm qa:help

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
const PLATFORM_URL = env.QA_PLATFORM_URL ?? `http://kshop.localhost:${PORT}`;
const ADMIN_APP = env.QA_ADMIN_APP_URL ?? "http://localhost:5174";
const OUT = join(root, ".titan/qa/ksh0005-ayuda");
const ROOT_EMAIL = "qa-help-root@e2e.kshop.test";
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
  // Repeated runs hit Auth's sign-in rate limit: wait it out instead of failing.
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (!error) return data.session;
    if (!/rate limit/i.test(error.message) || attempt === 6) throw new Error(`${email}: ${error.message}`);
    console.log(`# ${email}: sign-in rate limit, waiting 60 s`);
    await new Promise((r) => setTimeout(r, 60000));
  }
}

async function removeRoot() {
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) if (u.email === ROOT_EMAIL) await service.auth.admin.deleteUser(u.id);
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
const consoleErrors = [];

async function newPage(session, { width = 1280, height = 900, dark = false } = {}) {
  const phone = width < 640;
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: dark ? "dark" : "light",
    isMobile: phone,
    hasTouch: phone,
  });
  if (session) {
    await context.addInitScript(
      ([key, value]) => {
        // Only once: on later loads the app has refreshed the token, and putting the old one back gets the
        // reused refresh token revoked (signed out after a few pages).
        try {
          if (!localStorage.getItem(key)) localStorage.setItem(key, value);
        } catch {
          // storage blocked: the page will show the login
        }
      },
      [storageKey, JSON.stringify(session)],
    );
  }
  const page = await context.newPage();
  page.on("console", (m) => {
    // Not errors: the dev-only «instant navigation» notice of Next, Realtime reconnects and the screenshots that
    // are not shot yet (help-shots, phase 3). A 429 is the Auth sign-in limit hit by this script's own sign-ins.
    if (
      m.type() === "error" &&
      !/instant navigation|WebSocket|realtime|help\/screens|status of 404|status of 429/i.test(m.text())
    ) {
      consoleErrors.push(`${page.url()}: ${m.text().slice(0, 200)}`);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()}: pageerror ${String(e).slice(0, 200)}`));
  return page;
}

const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
const dialog = (page) => page.locator("dialog[open]");
const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Opens the «?» of `path` and returns the dialog's title and guides. */
async function openHelp(page, base, path) {
  await page.goto(`${base}${path}`);
  const button = page.getByTestId("help-button").first();
  await button.waitFor({ timeout: 60000 }).catch(async (e) => {
    await shot(page, `error-${path.replaceAll("/", "_")}`);
    throw e;
  });
  await button.click();
  await dialog(page).getByTestId("help-dialog").waitFor({ timeout: 10000 });
  const title = (await dialog(page).locator("h2").first().textContent())?.trim() ?? "";
  const guides = await dialog(page).locator("details summary span.font-semibold").allTextContents();
  const firstOpen = await dialog(page)
    .locator("details")
    .first()
    .evaluate((d) => d.open)
    .catch(() => false);
  return { title, guides, firstOpen };
}

// [admin path, dialog title, a guide it must list (null: the empty message)]
const OWNER_SCREENS = [
  ["/admin", "Ayuda · Inicio", "Me llegó un pedido"],
  ["/admin/orders", "Ayuda · Pedidos", "Me llegó un pedido"],
  ["/admin/orders/new", "Ayuda · Nuevo pedido", "Quiero crear un pedido a mano"],
  ["/admin/catalog", "Ayuda · Productos", "Quiero subir mi primer producto"],
  ["/admin/catalog/product-types", "Ayuda · Tipos de producto", "Quiero subir mi primer producto"],
  ["/admin/excel-import", "Ayuda · Importar Excel", "Tengo el catálogo en un Excel"],
  ["/admin/pos", "Ayuda · Caja", "Quiero vender en el mostrador"],
  ["/admin/team", "Ayuda · Equipo", "Quiero que mi empleado entre al admin"],
  ["/admin/billing", "Ayuda · Plan y facturación", "Quiero ver mi plan y cómo pago"],
  ["/admin/shipping", "Ayuda · Entregas", "Quiero organizar las entregas"],
];

try {
  // A fresh sign-in per browser context: one context refreshing the token revokes the session of the others.
  const owner = () => sessionOf(env.DEMO_OWNER_EMAIL ?? "dueno@demo.kshop.test", env.DEMO_OWNER_PASSWORD);
  const staff = () => sessionOf("empleado@demo.kshop.test", env.DEMO_STAFF_PASSWORD);

  // --- Owner, desktop: the «?» of each screen ---------------------------------------------------------------
  const page = await newPage(await owner());
  for (const [path, title, guide] of OWNER_SCREENS) {
    const got = await openHelp(page, STORE_URL, path).catch((e) => ({ error: String(e) }));
    if (got.error) {
      check(`${path}: «?» opens the help`, false, got.error);
      continue;
    }
    const empty = (await dialog(page).getByTestId("help-empty").count()) > 0;
    check(
      `${path}: «${title}» ${guide ? `lists «${guide}», the first one unfolded` : "says there are no guides yet"}`,
      got.title === title && (guide ? got.guides.includes(guide) && got.firstOpen : empty),
      JSON.stringify(got),
    );
    if (path === "/admin/catalog") await shot(page, "01-ayuda-productos-1280");
    await page.keyboard.press("Escape");
    check(`${path}: Esc closes it`, (await dialog(page).count()) === 0);
  }

  // «Toda la ayuda» goes to the Ayuda page.
  await openHelp(page, STORE_URL, "/admin/orders");
  await dialog(page).getByRole("link", { name: "Toda la ayuda" }).click();
  await page.getByTestId("help-center").waitFor({ timeout: 30000 });
  check("«Toda la ayuda» opens /admin/help", new URL(page.url()).pathname === "/admin/help");
  check(
    "the sidebar has «Ayuda», active",
    (await page.getByTestId("nav-help").first().getAttribute("aria-current")) === "page",
  );

  // --- Owner, the Ayuda page -------------------------------------------------------------------------------
  await page.evaluate(() => {
    localStorage.removeItem("kshop:help-audience");
    localStorage.removeItem("kshop:help-first-day");
  });
  await page.reload();
  await page.getByTestId("help-center").waitFor({ timeout: 30000 });
  const pressed = async (label) =>
    page.getByRole("group", { name: "Ayuda para" }).getByRole("button", { name: label, exact: true });
  const isActive = async (label) => (await (await pressed(label)).getAttribute("aria-pressed")) === "true";
  check("the owner's filter starts on «Dueño»", await isActive("Dueño"));
  const excel = page.getByTestId("help-article-excel-catalog");
  check("«Dueño» lists the Excel guide", (await excel.count()) === 1);
  await (await pressed("Empleado")).click();
  check("«Empleado» hides the owner-only Excel guide", (await excel.count()) === 0);
  check(
    "«Empleado» keeps the counter guide",
    (await page.getByTestId("help-article-counter-sale").count()) === 1,
  );
  await page.reload();
  await page.getByTestId("help-center").waitFor({ timeout: 30000 });
  check("the filter is remembered", await isActive("Empleado"));
  await (await pressed("Todo")).click();

  await page.getByTestId("help-search").fill("excel");
  const results = page.getByTestId("help-results");
  await results.waitFor({ timeout: 5000 });
  check(
    "search «excel» finds the Excel guide first",
    ((await results.locator("a").first().textContent()) ?? "").includes("Tengo el catálogo en un Excel"),
  );
  await results.locator("a").first().click();
  await page.waitForTimeout(300);
  check(
    "a result unfolds its guide",
    await page.getByTestId("help-article-excel-catalog").evaluate((d) => d.open),
  );
  await page.getByTestId("help-search").fill("zzzz qqqq");
  check("a search with no match says so", ((await results.textContent()) ?? "").includes("No hay nada"));
  await page.getByTestId("help-search").fill("");

  await page.getByTestId("first-day-look-around").click();
  check(
    "a first-day box counts",
    ((await page.getByTestId("first-day-progress").textContent()) ?? "").startsWith("1 de"),
  );
  await page.reload();
  await page.getByTestId("help-center").waitFor({ timeout: 30000 });
  check(
    "the first day is remembered",
    (await page.getByTestId("first-day-look-around").getAttribute("aria-checked")) === "true",
  );
  await page.evaluate(() => localStorage.removeItem("kshop:help-first-day"));

  // Downloads: the PDF and the Markdown answer on the store host (paths with an extension skip the proxy).
  const links = await page
    .getByTestId("help-downloads")
    .locator("a")
    .evaluateAll((as) => as.map((a) => a.href));
  check("the Ayuda page offers the PDF and three Markdown files", links.length === 4, links.join(" "));
  // The manuals of every plan (pnpm help:guides): all six for every store.
  const guides = await page
    .getByTestId("help-guides")
    .locator("a")
    .evaluateAll((as) => as.map((a) => a.href));
  check(
    "the Ayuda page offers the six manuals (app and web of Caja, Base and Pro)",
    guides.length === 6,
    guides.join(" "),
  );
  links.push(...guides);
  for (const href of links) {
    // From the page: Node does not resolve *.localhost subdomains on Windows, Chromium does.
    const got = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return { status: res.status, head: (await res.text()).slice(0, 20) };
    }, href);
    check(
      `download ${new URL(href).pathname} answers 200`,
      got.status === 200 &&
        (href.endsWith(".pdf") ? got.head.startsWith("%PDF") : got.head.startsWith("# Ayuda de Kshop")),
      JSON.stringify(got),
    );
  }
  await shot(page, "02-ayuda-pagina-1280");
  await page.context().close();

  // --- Owner, phone: sheet and page fit ----------------------------------------------------------------------
  const phone = await newPage(await owner(), { width: 390, height: 844 });
  for (const dark of [false, true]) {
    const tag = dark ? "390-oscuro" : "390";
    await phone.emulateMedia({ colorScheme: dark ? "dark" : "light" });
    await openHelp(phone, STORE_URL, "/admin/orders");
    const box = await dialog(phone).boundingBox();
    check(
      `${tag}: the «?» opens a full-screen sheet`,
      !!box && box.height >= 800 && box.width >= 380,
      JSON.stringify(box),
    );
    const help = await phone.getByTestId("help-button").first().boundingBox();
    check(
      `${tag}: the «?» is at least 40 px`,
      !!help && help.width >= 40 && help.height >= 40,
      JSON.stringify(help),
    );
    await shot(phone, `03-ayuda-pedidos-${tag}`);
    await phone.keyboard.press("Escape");
    check(`${tag}: the admin header does not overflow`, (await overflow(phone)) <= 0, await overflow(phone));
    await phone.goto(`${STORE_URL}/admin/help`);
    await phone.getByTestId("help-center").waitFor({ timeout: 30000 });
    check(`${tag}: the Ayuda page does not overflow`, (await overflow(phone)) <= 0, await overflow(phone));
    const fontSize = await phone
      .getByTestId("help-search")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    check(`${tag}: the search field is 16 px (no zoom)`, fontSize >= 16, fontSize);
    await shot(phone, `04-ayuda-pagina-${tag}`);
  }
  await phone.context().close();

  // --- Employee: only their guides -----------------------------------------------------------------------------
  const emp = await newPage(await staff());
  const got = await openHelp(emp, STORE_URL, "/admin/catalog");
  check(
    "employee: the «?» of Productos has no owner-only guide",
    got.guides.includes("Quiero subir mi primer producto") &&
      !got.guides.includes("Tengo el catálogo en un Excel"),
    JSON.stringify(got.guides),
  );
  await emp.keyboard.press("Escape");
  await emp.evaluate(() => localStorage.removeItem("kshop:help-audience"));
  await emp.goto(`${STORE_URL}/admin/help`);
  await emp.getByTestId("help-center").waitFor({ timeout: 30000 });
  check(
    "employee: the filter starts on «Empleado»",
    (await emp
      .getByRole("group", { name: "Ayuda para" })
      .getByRole("button", { name: "Empleado", exact: true })
      .getAttribute("aria-pressed")) === "true",
  );
  await emp.context().close();

  // --- Superadmin ----------------------------------------------------------------------------------------------
  await removeRoot();
  const { error: rootError } = await service.auth.admin.createUser({
    email: ROOT_EMAIL,
    password: ROOT_PASSWORD,
    email_confirm: true,
    app_metadata: { role: "superadmin" },
  });
  if (rootError) throw rootError;
  const rootPage = await newPage(await sessionOf(ROOT_EMAIL, ROOT_PASSWORD));
  const sa = await openHelp(rootPage, PLATFORM_URL, "/superadmin/stores/new");
  check(
    "superadmin: «Ayuda · Nueva tienda» lists «Quiero dar de alta una tienda»",
    sa.title === "Ayuda · Nueva tienda" && sa.guides.includes("Quiero dar de alta una tienda"),
    JSON.stringify(sa),
  );
  await shot(rootPage, "05-ayuda-superadmin-1280");
  await rootPage.keyboard.press("Escape");
  await rootPage.goto(`${PLATFORM_URL}/superadmin/help`);
  await rootPage.getByTestId("help-center").waitFor({ timeout: 30000 });
  check(
    "superadmin: the Ayuda page has only the panel's guides and no audience filter",
    (await rootPage.getByTestId("help-article-superadmin-new-store").count()) === 1 &&
      (await rootPage.getByTestId("help-article-counter-sale").count()) === 0 &&
      (await rootPage.getByRole("group", { name: "Ayuda para" }).count()) === 0,
  );
  await rootPage.context().close();

  // --- Kshop Admin (optional) ----------------------------------------------------------------------------------
  const appUp = await fetch(ADMIN_APP)
    .then((r) => r.ok)
    .catch(() => false);
  if (!appUp) {
    console.log(`# Kshop Admin not running at ${ADMIN_APP}: skipped`);
  } else {
    const app = await newPage(null, { width: 390, height: 844 });
    await app.goto(ADMIN_APP);
    await app.fill("#email", "dueno@demo.kshop.test");
    await app.fill("#password", env.DEMO_OWNER_PASSWORD);
    await app.getByRole("button", { name: "Entrar" }).click();
    const picker = app.getByTestId("store-picker");
    const storeName = app.getByTestId("admin-store-name");
    await Promise.race([picker.waitFor({ timeout: 60000 }), storeName.waitFor({ timeout: 60000 })]).catch(
      async (e) => {
        await shot(app, "error-app-login");
        throw e;
      },
    );
    if (await picker.isVisible()) await picker.getByRole("button", { name: /Tienda Demo/ }).click();
    await storeName.waitFor({ timeout: 60000 });
    await app.getByTestId("help-button").first().click();
    await dialog(app).getByTestId("help-dialog").waitFor({ timeout: 10000 });
    check(
      "Kshop Admin: the «?» of Inicio opens its guides",
      (await dialog(app).locator("details").count()) > 0,
    );
    await shot(app, "06-app-inicio-ayuda");
    await app.keyboard.press("Escape");
    await app.getByRole("link", { name: "Más", exact: true }).click();
    await app.getByTestId("more-help").click();
    await app.getByTestId("help-center").waitFor({ timeout: 15000 });
    check("Kshop Admin: Más › Ayuda opens the help page", true);
    check("Kshop Admin: the help page does not overflow", (await overflow(app)) <= 0, await overflow(app));
    await shot(app, "07-app-ayuda");
    await app.context().close();
  }

  // kshop.fullkod.com/help: the help without signing in, linked from the landing; manuals first, nothing into the admin.
  const visitor = await (
    await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  ).newPage();
  const visitorErrors = [];
  visitor.on("pageerror", (e) => visitorErrors.push(e.message));
  await visitor.goto(PLATFORM_URL);
  await visitor.getByTestId("landing-help").click();
  await visitor.getByTestId("help-center").waitFor({ timeout: 30000 });
  check("landing: «Ayuda y manuales» opens the public help", new URL(visitor.url()).pathname === "/help");
  check(
    "public help: the six manuals, and no «Ir ahora» into the admin",
    (await visitor.getByTestId("help-guides").locator("a").count()) === 6 &&
      (await visitor.getByText("Ir ahora").count()) === 0,
  );
  await visitor.getByLabel("Buscar en la ayuda").fill("cierre");
  check(
    "public help: the search finds guides",
    (await visitor.getByTestId("help-results").locator("a").count()) > 0,
  );
  check("public help: does not overflow on a phone", (await overflow(visitor)) <= 0, await overflow(visitor));
  check("public help: no page errors", visitorErrors.length === 0, visitorErrors.join(" | "));
  await shot(visitor, "08-ayuda-publica-390");
  await visitor.context().close();
} finally {
  await removeRoot().catch(() => {});
  await browser.close();
}

check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
