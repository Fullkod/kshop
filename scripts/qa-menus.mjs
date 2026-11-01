// KSH0007 QA in the browser: the footer menu editor (Admin › Apariencia › Menús, Tienda Demo, owner) shows and edits
// the links of each footer column. It builds a column with two links, reorders them, saves, checks the storefront
// footer, removes a link and then the whole column, and leaves the Demo menus as they were (empty). Screenshots in
// .titan/qa/ksh0007-menus/ (1280 and 390). Needs pnpm dev (QA_BASE_URL for another port).
//
//   pnpm qa:menus

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
const OUT = join(root, ".titan/qa/ksh0007-menus");
const COLUMN = "QA Información";
const LINK_A = { label: "Sobre QA", url: "/categories" };
const LINK_B = { label: "Contacto QA", url: "/products" };
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
const storageKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const { data: demo } = await service.from("stores").select("id").eq("slug", "demo").single();
if (!demo) throw new Error("Tienda Demo not found");

/** The Demo footer menu as saved: [{ label, children: [label…] }]. */
async function savedFooter() {
  const { data: menu } = await service
    .from("menus")
    .select("id")
    .eq("store_id", demo.id)
    .eq("location", "footer")
    .maybeSingle();
  if (!menu) return [];
  const { data: items } = await service
    .from("menu_items")
    .select("id, label, parent_id, sort_order")
    .eq("menu_id", menu.id)
    .order("sort_order");
  return (items ?? [])
    .filter((i) => !i.parent_id)
    .map((p) => ({
      label: p.label,
      children: items.filter((c) => c.parent_id === p.id).map((c) => c.label),
    }));
}
const before = await savedFooter();
if (before.length) {
  throw new Error(`The Demo footer menu is not empty (${JSON.stringify(before)}); this QA expects it empty`);
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
const consoleErrors = [];
const failedResponses = [];

async function newPage({ width = 1280, height = 900, auth = true } = {}) {
  const phone = width < 600;
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: phone,
    isMobile: phone,
  });
  if (auth) {
    // A session per context: a refresh token can be used once, so two contexts must not share one.
    const { data: own, error: ownError } = await anon.auth.signInWithPassword({
      email: env.DEMO_OWNER_EMAIL ?? "dueno@demo.kshop.test",
      password: env.DEMO_OWNER_PASSWORD,
    });
    if (ownError) throw new Error(`Owner sign-in failed: ${ownError.message}`);
    await context.addInitScript(
      ([key, value]) => {
        try {
          // Only once: later navigations keep the session the app refreshed (a refresh token works once).
          if (!localStorage.getItem(key)) localStorage.setItem(key, value);
        } catch {
          // storage blocked: the page will show the login
        }
      },
      [storageKey, JSON.stringify(own.session)],
    );
  }
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && !/instant navigation|WebSocket|realtime/i.test(m.text())) {
      consoleErrors.push(`${page.url()}: ${m.text().slice(0, 200)}`);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()}: pageerror ${String(e).slice(0, 200)}`));
  page.on("response", async (r) => {
    if (r.status() < 400) return;
    const body = await r.text().catch(() => "");
    failedResponses.push(`${r.status()} ${r.request().method()} ${r.url()} ${body.slice(0, 300)}`);
  });
  return page;
}

const footerCard = (page) => page.getByTestId("menu-footer");
const headerCard = (page) => page.getByTestId("menu-header");
const item = (page, i) => page.getByTestId(`menu-footer-item-${i}`);
const child = (page, i, c) => page.getByTestId(`menu-footer-item-${i}-child-${c}`);

async function openEditor(page) {
  await page.goto(`${BASE}/admin/themes/menus`);
  await footerCard(page).waitFor({ timeout: 30000 });
}

/** Saves and waits for the PUT to answer 204 (the «Menú guardado.» notice can vanish when the card reloads). */
async function save(page) {
  const done = page.waitForResponse(
    (r) => r.request().method() === "PUT" && r.url().includes("/content/menus/footer"),
    { timeout: 30000 },
  );
  await footerCard(page).getByRole("button", { name: "Guardar menú" }).click();
  const response = await done;
  if (response.status() !== 204) throw new Error(`Saving the menu answered ${response.status()}`);
}

/** The footer columns of the storefront home: [{ title, links: [{ label, href }] }] (null when there is no nav). */
async function storefrontFooter(page, expect) {
  // The storefront cache is invalidated on save; a few reloads cover a slow dev refresh.
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const columns = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Enlaces del pie"]');
      if (!nav) return null;
      return [...nav.children].map((col) => ({
        title: col.querySelector("span")?.textContent?.trim() ?? "",
        links: [...col.querySelectorAll("a")].map((a) => ({
          label: a.textContent?.trim() ?? "",
          href: a.getAttribute("href") ?? "",
        })),
      }));
    });
    if (expect(columns)) return columns;
    await page.waitForTimeout(2500);
  }
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Enlaces del pie"]');
    return nav ? nav.textContent : null;
  });
}

try {
  const page = await newPage();
  await openEditor(page);

  // The editor as it opens: footer copy, header unchanged.
  check(
    "footer: the card offers «Añadir columna o enlace»",
    (await footerCard(page).getByRole("button", { name: "Añadir columna o enlace" }).count()) === 1,
  );
  check(
    "footer: the help explains the columns",
    (await footerCard(page)
      .getByText(/cada enlace con enlaces debajo es una columna/)
      .count()) === 1,
  );
  check(
    "header: still offers «Añadir enlace»",
    (await headerCard(page).getByRole("button", { name: "Añadir enlace", exact: true }).count()) === 1,
  );

  // Build a column with two links.
  await footerCard(page).getByRole("button", { name: "Añadir columna o enlace" }).click();
  check(
    "footer: a new item without links says it goes to the «Tienda» column",
    (await item(page, 0)
      .getByText(/columna «Tienda»/)
      .count()) === 1,
  );
  check(
    "footer: a new item without links is labelled «Texto»",
    (await item(page, 0).getByText("Texto", { exact: true }).count()) === 1,
  );
  await page.locator("#footer-0-label").fill(COLUMN);
  await item(page, 0).getByRole("button", { name: "Añadir enlace a la columna" }).click();
  await page.locator("#footer-0-0-label").fill(LINK_A.label);
  await page.locator("#footer-0-0-url").fill(LINK_A.url);
  await item(page, 0).getByRole("button", { name: "Añadir enlace a la columna" }).click();
  await page.locator("#footer-0-1-label").fill(LINK_B.label);
  await page.locator("#footer-0-1-url").fill(LINK_B.url);
  check(
    "footer: with links the item is labelled «Título de la columna» and says the address is not shown",
    (await item(page, 0).getByText("Título de la columna", { exact: true }).count()) === 1 &&
      (await item(page, 0)
        .getByText(/su dirección no se muestra/)
        .count()) === 1,
  );
  check(
    "footer: each link of the column is labelled «Enlace de la columna»",
    (await item(page, 0).getByText("Enlace de la columna", { exact: true }).count()) === 2,
  );

  // Reorder the links: the first goes down.
  await child(page, 0, 0).getByRole("button", { name: "Bajar" }).click();
  check(
    "footer: «Bajar» swaps the two links",
    (await page.locator("#footer-0-0-label").inputValue()) === LINK_B.label &&
      (await page.locator("#footer-0-1-label").inputValue()) === LINK_A.label,
  );
  await page.screenshot({ path: join(OUT, "editor-columna-1280.png"), fullPage: true });
  await save(page);
  check(
    "footer: saved with the column and its two links in order",
    JSON.stringify(await savedFooter()) ===
      JSON.stringify([{ label: COLUMN, children: [LINK_B.label, LINK_A.label] }]),
    JSON.stringify(await savedFooter()),
  );

  // Reload: the editor shows the saved column with its links.
  await openEditor(page);
  check(
    "footer: after reloading, the column and its links are shown in order",
    (await page.locator("#footer-0-label").inputValue()) === COLUMN &&
      (await page.locator("#footer-0-0-label").inputValue()) === LINK_B.label &&
      (await page.locator("#footer-0-1-label").inputValue()) === LINK_A.label &&
      (await page.locator("#footer-0-0-url").inputValue()) === LINK_B.url,
  );
  check(
    "header: shows no items and no column copy",
    (await headerCard(page).getByText("Enlace de la columna").count()) === 0 &&
      (await headerCard(page).locator("[data-testid^='menu-header-item-']").count()) === 0,
  );

  // The storefront footer shows the column.
  const front = await newPage({ auth: false });
  const columns = await storefrontFooter(
    front,
    (c) => Array.isArray(c) && c.some((col) => col.title === COLUMN && col.links.length === 2),
  );
  const column = Array.isArray(columns) ? columns.find((c) => c.title === COLUMN) : undefined;
  check(
    "storefront: the footer shows the column with its two links in order",
    !!column &&
      column.links[0]?.label === LINK_B.label &&
      column.links[0]?.href === LINK_B.url &&
      column.links[1]?.label === LINK_A.label &&
      column.links[1]?.href === LINK_A.url,
    JSON.stringify(columns),
  );
  await front.locator('nav[aria-label="Enlaces del pie"]').scrollIntoViewIfNeeded();
  await front.screenshot({ path: join(OUT, "tienda-pie-1280.png") });

  // Phone: the editor fits and its buttons are big enough.
  const phone = await newPage({ width: 390, height: 844 });
  await openEditor(phone);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("footer 390: no horizontal scroll", overflow <= 0, overflow);
  const small = await item(phone, 0)
    .getByRole("button")
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height).filter((h) => h > 0 && h < 40));
  check("footer 390: every button of the column is at least 40 px high", small.length === 0, small.join(","));
  await phone.screenshot({ path: join(OUT, "editor-columna-390.png"), fullPage: true });
  await phone.context().close();

  // Remove one link, save: one link left, in the editor and in the storefront.
  await openEditor(page);
  await child(page, 0, 0).getByRole("button", { name: "Quitar" }).click();
  await save(page);
  check(
    "footer: removing a link saves the column with the other one",
    JSON.stringify(await savedFooter()) === JSON.stringify([{ label: COLUMN, children: [LINK_A.label] }]),
    JSON.stringify(await savedFooter()),
  );
  const oneLink = await storefrontFooter(
    front,
    (c) => Array.isArray(c) && c.some((col) => col.title === COLUMN && col.links.length === 1),
  );
  check(
    "storefront: the footer column shows the remaining link",
    Array.isArray(oneLink) &&
      oneLink.some((col) => col.title === COLUMN && col.links[0]?.label === LINK_A.label),
    JSON.stringify(oneLink),
  );

  // Remove the whole column, save: nothing left, the storefront footer has no nav.
  await openEditor(page);
  await item(page, 0).getByRole("button", { name: "Quitar" }).first().click();
  check("footer: removing the column removes its links from the editor", (await item(page, 0).count()) === 0);
  await save(page);
  check("footer: saved empty", (await savedFooter()).length === 0, JSON.stringify(await savedFooter()));
  const none = await storefrontFooter(front, (c) => c === null);
  check("storefront: the footer has no link columns again", none === null, JSON.stringify(none));
  await front.context().close();
  await page.context().close();
} catch (error) {
  check("unexpected error", false, error?.stack ?? error);
} finally {
  // Leave the Demo menus as they were (empty).
  const { data: menu } = await service
    .from("menus")
    .select("id")
    .eq("store_id", demo.id)
    .eq("location", "footer")
    .maybeSingle();
  if (menu) {
    await service.from("menu_items").delete().eq("menu_id", menu.id);
    await service.from("menus").delete().eq("id", menu.id);
  }
  await browser.close();
}

check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
check("no failed requests", failedResponses.length === 0, failedResponses.join(" | "));
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
