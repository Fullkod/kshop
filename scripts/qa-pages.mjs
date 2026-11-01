// KSH0006 QA in the browser: the page editor (Admin › Apariencia › Páginas, Tienda Demo, owner) has a format toolbar
// and a live preview; the storefront page keeps line breaks, shows a paragraph of links as buttons (WhatsApp in green)
// and folds the questions under «Preguntas frecuentes». Creates a page, checks it in the store, opens it on a phone
// and deletes it. Screenshots in .titan/qa/ksh0006-paginas/. Needs pnpm dev (QA_BASE_URL for another port).
//
//   pnpm qa:pages

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
const OUT = join(root, ".titan/qa/ksh0006-paginas");
const TITLE = "QA Página KSH0006";
const SLUG = "qa-pagina-ksh0006";
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
  results.push(!!ok);
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

const browser = await chromium.launch({ executablePath: chromiumPath() });
const consoleErrors = [];
const failedResponses = [];

async function newPage({ width = 1280, height = 900, auth = true } = {}) {
  const phone = width < 600;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone });
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

const dialog = (page) => page.locator("dialog[open]");
const field = (page) => page.locator("#page-content");
const preview = (page) => page.getByTestId("page-preview");
const toolbar = (page) => page.getByRole("toolbar", { name: "Formato del texto" });
const tool = (page, name) => toolbar(page).getByRole("button", { name, exact: true });

/** Types at the end of the content field. */
async function typeAtEnd(page, text) {
  await field(page).evaluate((el) => {
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
  await page.keyboard.insertText(text);
}

async function cleanUp() {
  await service.from("pages").delete().eq("store_id", demo.id).eq("slug", SLUG);
}
await cleanUp();

try {
  const page = await newPage();
  await page.goto(`${BASE}/admin/themes/pages`);
  await page.locator("main").getByRole("button", { name: "Nueva página", exact: true }).click();
  await dialog(page).waitFor({ timeout: 30000 });
  await page.locator("#page-title").fill(TITLE);
  check("editor: the slug follows the title", (await page.locator("#page-slug").inputValue()) === SLUG);
  check("editor: the toolbar has its eight tools", (await toolbar(page).getByRole("button").count()) === 8);

  // Toolbar: bold wraps the selection, a heading and a list prefix the lines, a button is its own paragraph.
  await typeAtEnd(page, "Te lo traemos");
  await field(page).evaluate((el) => el.setSelectionRange(0, el.value.length));
  await tool(page, "Negrita").click();
  check(
    "toolbar: «Negrita» wraps the selection",
    (await field(page).inputValue()) === "**Te lo traemos**",
    await field(page).inputValue(),
  );
  await typeAtEnd(page, "\nprimera línea\nsegunda línea");
  check(
    "preview: a single line break is kept",
    (await preview(page).locator("p br").count()) >= 2,
    await preview(page).innerHTML(),
  );
  await typeAtEnd(page, "\n\nCómo funciona");
  await tool(page, "Título").click();
  check(
    "toolbar: «Título» turns the line into ##",
    (await field(page).inputValue()).includes("\n## Cómo funciona"),
  );
  await typeAtEnd(page, "\n\nuno\ndos");
  await field(page).evaluate((el) => el.setSelectionRange(el.value.lastIndexOf("uno"), el.value.length));
  await tool(page, "Lista numerada").click();
  check(
    "toolbar: «Lista numerada» numbers each line",
    (await field(page).inputValue()).endsWith("1. uno\n2. dos"),
    JSON.stringify((await field(page).inputValue()).slice(-30)),
  );
  await field(page).evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
  await tool(page, "Botón").click();
  const afterButton = await field(page).inputValue();
  const selected = await field(page).evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd));
  check(
    "toolbar: «Botón» adds a link in its own paragraph with its text selected",
    afterButton.endsWith("\n\n[Ver productos](/products)\n") && selected === "Ver productos",
    `${JSON.stringify(afterButton.slice(-60))} ${selected}`,
  );
  await typeAtEnd(
    page,
    "\n[Escríbenos](https://wa.me/5350000000)\n\n## Preguntas frecuentes\n\n### ¿Cuánto tarda?\n\nUnos días.\n\n### ¿Puedo cancelar?\n\nAntes de pagar.\n",
  );

  // Live preview, drawn with the store theme.
  check(
    "preview: the heading shows as a heading",
    (await preview(page).locator("h2").first().innerText()) === "Cómo funciona",
  );
  check("preview: the numbered list has two items", (await preview(page).locator("ol > li").count()) === 2);
  check(
    "preview: the link alone is a filled button",
    (await preview(page).locator('a[data-button="primary"]').innerText()) === "Ver productos",
  );
  check(
    "preview: the wa.me link is a WhatsApp button",
    (await preview(page).locator('a[data-button="whatsapp"]').innerText()).includes("Escríbenos"),
  );
  check("preview: two folding questions", (await preview(page).locator("details > summary").count()) === 2);
  await page.screenshot({ path: join(OUT, "editor-1280.png") });

  // Save: the dialog closes and the list shows the page.
  await dialog(page).getByRole("button", { name: "Guardar", exact: true }).click();
  await dialog(page).waitFor({ state: "detached", timeout: 20000 });
  await page.getByText(`/page/${SLUG}`).waitFor({ timeout: 20000 });
  const { data: saved } = await service
    .from("pages")
    .select("content")
    .eq("store_id", demo.id)
    .eq("slug", SLUG)
    .single();
  check("saved: the content is the Markdown written", saved?.content?.includes("## Preguntas frecuentes"));

  // Storefront page: same blocks; a question opens.
  const front = await newPage({ auth: false });
  await front.goto(`${BASE}/page/${SLUG}`, { waitUntil: "networkidle" });
  const article = front.locator("article");
  check("storefront: the title is the page title", (await article.locator("h1").innerText()) === TITLE);
  check(
    "storefront: the button and the WhatsApp button",
    (await article.locator("a[data-button]").count()) === 2,
  );
  const firstQuestion = article.locator("details").first();
  check("storefront: the questions start closed", !(await firstQuestion.evaluate((d) => d.open)));
  await firstQuestion.locator("summary").click();
  check(
    "storefront: a click opens the question",
    (await firstQuestion.evaluate((d) => d.open)) &&
      (await firstQuestion.getByText("Unos días.").isVisible()),
  );
  await front.screenshot({ path: join(OUT, "tienda-1280.png"), fullPage: true });

  // The rich text section of the Demo home (same Markdown component) still renders.
  await front.goto(`${BASE}/`, { waitUntil: "networkidle" });
  check(
    "storefront home: the rich text section still renders",
    (await front.locator(".sf-prose").count()) > 0,
  );
  await front.context().close();

  // Phone: the dialog fits, the toolbar buttons are big enough and the field does not zoom.
  const phone = await newPage({ width: 390, height: 844 });
  await phone.goto(`${BASE}/admin/themes/pages`);
  const phoneRow = phone.locator("li", { hasText: `/page/${SLUG}` });
  await phoneRow.waitFor({ timeout: 30000 });
  await phoneRow.getByRole("button", { name: "Editar", exact: true }).click();
  await dialog(phone).waitFor({ timeout: 10000 });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const dialogOverflow = await dialog(phone).evaluate((d) => d.scrollWidth - d.clientWidth);
  check(
    "editor 390: no horizontal scroll",
    overflow <= 0 && dialogOverflow <= 0,
    `${overflow} ${dialogOverflow}`,
  );
  const small = await toolbar(phone)
    .getByRole("button")
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height).filter((h) => h > 0 && h < 40));
  check("editor 390: the toolbar buttons are at least 40 px high", small.length === 0, small.join(","));
  const fontSize = await field(phone).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check("editor 390: the content field is 16 px (no zoom)", fontSize >= 16, fontSize);
  await phone.screenshot({ path: join(OUT, "editor-390.png") });
  await phone.context().close();

  // Delete it from the list (confirm dialog).
  await page.goto(`${BASE}/admin/themes/pages`);
  const listRow = page.locator("li", { hasText: `/page/${SLUG}` });
  await listRow.getByRole("button", { name: "Borrar", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Borrar", exact: true }).click();
  await listRow.waitFor({ state: "detached", timeout: 20000 });
  const { data: left } = await service.from("pages").select("id").eq("store_id", demo.id).eq("slug", SLUG);
  check("delete: the page is gone", (left ?? []).length === 0);
  await page.context().close();
} catch (error) {
  check("unexpected error", false, error?.stack ?? error);
} finally {
  await cleanUp();
  await browser.close();
}

check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
check("no failed requests", failedResponses.length === 0, failedResponses.join(" | "));
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed; screenshots in ${OUT}`);
process.exit(passed === results.length ? 0 : 1);
