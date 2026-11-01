// KSH0004 QA in the browser: the landing with three plans (Caja before Base, the «¿Solo vendes en tu local?» note,
// «En Base» on the online-store card), the card of a store without the online store at its subdomain, Superadmin ›
// Planes with the third plan and Admin › Plan y facturación of a Caja store («Incluido en Base» on Tienda online).
// Creates a temporary Caja store (caja-qa) with a temporary superadmin and owner (@e2e.kshop.test) and removes them.
// Screenshots in .titan/qa/ksh0004-plan-caja/ (1280 and 390). Needs pnpm dev (QA_BASE_URL and QA_PLATFORM_URL for
// another port).
//
//   pnpm qa:plan-caja

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
const PLATFORM_URL = env.QA_PLATFORM_URL ?? `http://kshop.localhost:${PORT}`;
const SLUG = "caja-qa";
const STORE_URL = `http://${SLUG}.kshop.localhost:${PORT}`;
const OUT = join(root, ".titan/qa/ksh0004-plan-caja");
const ROOT_EMAIL = "qa-caja-root@e2e.kshop.test";
const OWNER_EMAIL = "qa-caja-owner@e2e.kshop.test";
const PASSWORD = randomBytes(12).toString("base64url");
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

async function sessionOf(email) {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Sign-in of ${email} failed: ${error.message}`);
  return data.session;
}

async function cleanup() {
  await service.from("stores").delete().eq("slug", SLUG);
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (u.email === ROOT_EMAIL || u.email === OWNER_EMAIL) await service.auth.admin.deleteUser(u.id);
  }
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
const consoleErrors = [];

async function newPage(session, { width = 1280, height = 900 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: width < 768,
    isMobile: width < 768,
  });
  if (session) {
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
  }
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && !/instant navigation|WebSocket|realtime/i.test(m.text())) {
      consoleErrors.push(`${page.url()}: ${m.text().slice(0, 200)}`);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()}: pageerror ${String(e).slice(0, 200)}`));
  return page;
}

try {
  await cleanup();
  const users = {};
  for (const [key, email] of [
    ["root", ROOT_EMAIL],
    ["owner", OWNER_EMAIL],
  ]) {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      ...(key === "root" && { app_metadata: { role: "superadmin" } }),
    });
    if (error) throw error;
    users[key] = data.user.id;
  }
  const { data: store, error } = await service
    .rpc("create_store", {
      p_name: "Dulcería La Esquina",
      p_slug: SLUG,
      p_owner_id: users.owner,
      p_base_currency: "CUP",
      p_order_prefix: "DE",
      p_whatsapp_phone: "5350000000",
      p_plan_code: "caja",
      p_trial_days: 0,
      p_platform_domain: "kshop.fullkod.com",
      p_created_by: null,
    })
    .single();
  if (error) throw error;
  await service
    .from("stores")
    .update({ description: "Caramelos, galletas y refrescos en Centro Habana." })
    .eq("id", store.id);

  // ---- Landing: three plans ----
  for (const width of [1280, 390]) {
    const page = await newPage(null, { width, height: width === 390 ? 844 : 900 });
    await page.goto(`${PLATFORM_URL}/`);
    await page.getByTestId("landing-plans").waitFor({ timeout: 30000 });
    const cards = await page.locator('[data-testid^="landing-plan-"]').count();
    check(`landing ${width}: three plan cards`, cards === 3, cards);
    const order = await page
      .locator('[data-testid^="landing-plan-"]')
      .evaluateAll((els) => els.map((e) => e.dataset.testid));
    check(
      `landing ${width}: Caja, Base, Pro in that order`,
      order.join() === "landing-plan-caja,landing-plan-base,landing-plan-pro",
      order,
    );
    const caja = (await page.getByTestId("landing-plan-caja").textContent()) ?? "";
    check(
      `landing ${width}: Caja says 3 USD, the counter, 300 products and no online store`,
      /3\s*USD/.test(caja) &&
        /Caja de mostrador/.test(caja) &&
        /300 productos/.test(caja) &&
        !/Tienda online/.test(caja),
      caja,
    );
    const base = (await page.getByTestId("landing-plan-base").textContent()) ?? "";
    check(
      `landing ${width}: Base adds the online store over Caja`,
      /Todo lo del Caja/.test(base) && /Tienda online/.test(base),
      base,
    );
    check(
      `landing ${width}: the «solo vendes en tu local» note`,
      (await page.getByTestId("landing-counter-plan").count()) === 1,
    );
    check(
      `landing ${width}: «Vende las 24 horas» is labelled «En Base»`,
      /En Base/.test((await page.locator("#funciones").textContent()) ?? ""),
    );
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`landing ${width}: no horizontal overflow`, !overflow);
    await page.locator("#precios").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT, `landing-precios-${width}.png`) });
    await page.close();
  }

  // ---- The Caja store at its subdomain: the local card ----
  for (const width of [1280, 390]) {
    const page = await newPage(null, { width, height: width === 390 ? 844 : 900 });
    await page.goto(`${STORE_URL}/`);
    await page.getByTestId("local-store-card").waitFor({ timeout: 30000 });
    const text = (await page.getByTestId("local-store-card").textContent()) ?? "";
    check(
      `store ${width}: the card names the store and says it sells at its local`,
      /Dulcería La Esquina/.test(text) && /vende en su local/.test(text) && /Centro Habana/.test(text),
      text,
    );
    const wa = await page.getByRole("link", { name: "Escribir por WhatsApp" }).getAttribute("href");
    check(`store ${width}: WhatsApp link to the store`, wa?.startsWith("https://wa.me/5350000000"), wa);
    check(
      `store ${width}: no header, cart nor catalog`,
      (await page.locator("header").count()) === 0 && (await page.getByText("Carrito").count()) === 0,
    );
    await page.screenshot({ path: join(OUT, `tienda-caja-${width}.png`) });
    await page.goto(`${STORE_URL}/products`);
    await page.getByTestId("local-store-card").waitFor({ timeout: 30000 });
    check(`store ${width}: the listing shows the card too`, true);
    await page.close();
  }

  // ---- Superadmin › Planes ----
  const rootPage = await newPage(await sessionOf(ROOT_EMAIL));
  await rootPage.goto(`${PLATFORM_URL}/superadmin/plans`);
  await rootPage
    .getByRole("heading", { name: /Planes/ })
    .first()
    .waitFor({ timeout: 30000 });
  const plansText = (await rootPage.locator("main").textContent()) ?? "";
  check(
    "superadmin › Planes: lists Caja, Base and Pro",
    /Caja/.test(plansText) && /Base/.test(plansText) && /Pro/.test(plansText),
  );
  const cajaPrice = await rootPage
    .locator('input[id^="price-caja"], input[name="price"]')
    .first()
    .inputValue()
    .catch(() => "");
  check("superadmin › Planes: Caja costs 3", /^3(\.00)?$/.test(cajaPrice), cajaPrice);
  check("superadmin › Planes: the online store is a module to tick", /Tienda online/.test(plansText));
  await rootPage.screenshot({ path: join(OUT, "superadmin-planes-1280.png"), fullPage: true });
  await rootPage.close();

  // ---- Admin › Plan y facturación of the Caja store ----
  const ownerPage = await newPage(await sessionOf(OWNER_EMAIL));
  await ownerPage.goto(`${STORE_URL}/admin/billing`);
  await ownerPage.getByText("Plan Caja").first().waitFor({ timeout: 30000 });
  const billing = (await ownerPage.locator("main").textContent()) ?? "";
  check("admin › Plan: the store is on Caja", /Plan Caja/.test(billing));
  check(
    "admin › Plan: the online store is offered as «Incluido en Base»",
    /Tienda online[\s\S]{0,200}Incluido en Base/.test(billing),
    billing.slice(0, 400),
  );
  await ownerPage.screenshot({ path: join(OUT, "admin-plan-caja-1280.png"), fullPage: true });
  await ownerPage.goto(`${STORE_URL}/admin`);
  await ownerPage.getByRole("link", { name: "Caja" }).first().waitFor({ timeout: 30000 });
  const menu = (await ownerPage.locator("nav").first().textContent()) ?? "";
  check("admin: the menu has Caja and Productos", /Caja/.test(menu) && /Productos/.test(menu), menu);
  const shippingLock = (await ownerPage.getByTestId("nav-locked-shipping").textContent()) ?? "";
  const financeLock = (await ownerPage.getByTestId("nav-locked-finance").textContent()) ?? "";
  check(
    "admin: Entregas is locked as BASE and Finanzas as PRO",
    /BASE/.test(shippingLock) && /PRO/.test(financeLock),
    `${shippingLock} | ${financeLock}`,
  );
  await ownerPage.screenshot({ path: join(OUT, "admin-inicio-caja-1280.png") });
  await ownerPage.close();
} finally {
  await browser.close();
  await cleanup();
}

check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
