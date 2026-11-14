// KSH0023 QA in the browser: the setup fee goes by itself on the first invoice of a new store.
//   * Superadmin › Nueva tienda shows «Puesta en marcha» with the amount of Superadmin › Cobros and the trial days of
//     the platform; creating the store saves it.
//   * The store's «Próxima factura» has the «Puesta en marcha» line and one total (plan + fee); «Emitir factura
//     ahora» puts it on the invoice and «Condiciones de esta tienda» then shows it as invoiced.
//   * The owner sees the same line in Admin › Plan y facturación (390 px) and the landing states the amount.
// Creates a temporary store (puesta-qa-…) with a temporary superadmin and owner (@e2e.kshop.test) and removes them.
// Screenshots in .titan/qa/ksh0023-puesta-en-marcha/. Needs pnpm dev against the test project (QA_BASE_URL and
// QA_PLATFORM_URL for another port).
//
//   pnpm qa:setup-fee

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
// A new subdomain each run: the dev server caches host -> store, and the store of a previous run is gone.
const SLUG = `puesta-qa-${randomBytes(3).toString("hex")}`;
const STORE_URL = `http://${SLUG}.kshop.localhost:${PORT}`;
const OUT = join(root, ".titan/qa/ksh0023-puesta-en-marcha");
const ROOT_EMAIL = "qa-puesta-root@e2e.kshop.test";
const OWNER_EMAIL = "qa-puesta-owner@e2e.kshop.test";
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
  await service.from("stores").delete().like("slug", "puesta-qa%");
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
    colorScheme: "light",
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
  for (const [key, email] of [
    ["root", ROOT_EMAIL],
    ["owner", OWNER_EMAIL],
  ]) {
    const { error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      ...(key === "root" && { app_metadata: { role: "superadmin" } }),
    });
    if (error) throw error;
  }
  const { data: settings, error: settingsError } = await service.rpc("platform_billing_get");
  if (settingsError) throw settingsError;
  const fee = Number(settings.setup_fee_usd);
  check("platform setting: setup fee 5 USD", fee === 5, fee);

  // ---- Superadmin › Nueva tienda ----
  const admin = await newPage(await sessionOf(ROOT_EMAIL));
  await admin.goto(`${PLATFORM_URL}/superadmin/stores/new`);
  await admin.locator("#setupFee").waitFor({ timeout: 30000 });
  await admin.waitForFunction(() => document.querySelector("#setupFee")?.value !== "", null, {
    timeout: 15000,
  });
  check("new store: fee prefilled", (await admin.locator("#setupFee").inputValue()) === String(fee));
  check(
    "new store: trial days from the platform",
    (await admin.locator("#trialDays").inputValue()) === String(settings.default_trial_days),
    await admin.locator("#trialDays").inputValue(),
  );
  await admin.locator("#name").fill("Bodega La Puesta");
  await admin.locator("#slug").fill(SLUG);
  await admin.locator("#ownerEmail").fill(OWNER_EMAIL);
  await admin.locator("#planCode").selectOption("caja");
  await admin.screenshot({ path: join(OUT, "nueva-tienda-1280.png"), fullPage: true });
  await admin.getByRole("button", { name: "Crear tienda" }).click();
  await admin.getByTestId("store-created").waitFor({ timeout: 30000 });

  const { data: store } = await service.from("stores").select("id").eq("slug", SLUG).single();
  const { data: sub } = await service
    .from("subscriptions")
    .select("setup_fee, setup_fee_invoice_id")
    .eq("store_id", store.id)
    .single();
  check(
    "created: fee saved, not invoiced",
    Number(sub.setup_fee) === fee && sub.setup_fee_invoice_id === null,
    sub,
  );

  // ---- The store's next invoice ----
  await admin.goto(`${PLATFORM_URL}/superadmin/stores/${store.id}`);
  const next = admin.locator("div", { has: admin.locator("h2", { hasText: "Próxima factura" }) }).last();
  await admin.getByRole("heading", { name: "Próxima factura" }).waitFor({ timeout: 30000 });
  await next.getByText("Puesta en marcha").first().waitFor({ timeout: 30000 });
  const nextText = (await next.textContent()) ?? "";
  check(
    "store: next invoice has plan + fee = 8 USD",
    /Plan Caja/.test(nextText) && /8\s*USD/.test(nextText),
    nextText,
  );
  check(
    "store: conditions show the fee as editable",
    (await admin.locator("#setupFee").inputValue()) === String(fee),
  );
  await admin.screenshot({ path: join(OUT, "ficha-proxima-factura-1280.png"), fullPage: true });

  // ---- Owner: Admin › Plan y facturación (phone) ----
  const owner = await newPage(await sessionOf(OWNER_EMAIL), { width: 390, height: 844 });
  await owner.goto(`${STORE_URL}/admin/billing`);
  await owner.getByText("Puesta en marcha").first().waitFor({ timeout: 30000 });
  const ownerText = (await owner.locator("main").textContent()) ?? "";
  check(
    "owner: next invoice with the fee and 8 USD",
    /Puesta en marcha/.test(ownerText) && /8\s*USD/.test(ownerText),
    ownerText,
  );
  await owner.screenshot({ path: join(OUT, "dueno-plan-y-facturacion-390.png"), fullPage: true });
  await owner.close();

  await admin.getByRole("button", { name: "Emitir factura ahora" }).click();
  await admin.getByTestId("setup-fee-invoiced").waitFor({ timeout: 30000 });
  const invoiced = (await admin.getByTestId("setup-fee-invoiced").textContent()) ?? "";
  check("store: conditions say which invoice has it", /en la factura KS-\d{4}-\d+/.test(invoiced), invoiced);
  const { data: lines } = await service
    .from("platform_invoice_lines")
    .select("description, amount, platform_invoices!inner(store_id, total, status)")
    .eq("platform_invoices.store_id", store.id);
  check(
    "invoice: one fee line and total 8",
    lines.filter((l) => /^Puesta en marcha/.test(l.description)).length === 1 &&
      lines.every((l) => Number(l.platform_invoices.total) === 8),
    JSON.stringify(lines),
  );
  await admin.screenshot({ path: join(OUT, "ficha-facturada-1280.png"), fullPage: true });
  await admin.close();

  // ---- Landing ----
  const landing = await newPage(null);
  await landing.goto(`${PLATFORM_URL}/`);
  const note = (await landing.getByTestId("landing-setup-fee").textContent({ timeout: 30000 })) ?? "";
  check(
    "landing: states the fee and the first invoice",
    /5 USD una sola vez/.test(note) && /primera factura/.test(note),
    note,
  );
  await landing.close();
} finally {
  await browser.close();
  await cleanup();
}

check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
