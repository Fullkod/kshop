// Browser QA of phase 5 (pnpm dev running). Creates a temporary Base store qa-billing (no trial), its owner and a
// temporary superadmin; screenshots go to .titan/qa/fase-5/. Everything is deleted at the end.
//   1. Superadmin (1280 px): Planes, Tienda › Suscripción (add-on, discount, issue an invoice, cash payment), Cobros;
//      the subscription page at 390 px.
//   2. Owner (1280 and 390 px): Plan y facturación, locked menu items with their price, Equipo (invitation),
//      Apariencia set up by Kshop on Base, the overdue banner.
//   3. Suspended by billing: read-only banner in the admin and the closed storefront.
//
//   node scripts/qa-billing.mjs

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

const SLUG = "qa-billing";
// QA_PORT: another port than pnpm dev's 3000 (start it with NEXT_PUBLIC_PLATFORM_DOMAIN=kshop.localhost:<port>).
const PORT = env.QA_PORT ?? "3000";
const BASE = `http://${SLUG}.kshop.localhost:${PORT}`;
const PLATFORM = env.QA_PLATFORM_URL ?? `http://kshop.localhost:${PORT}`;
const OUT = join(root, ".titan/qa/fase-5");
const SUPER = { email: "qa-bill-super@e2e.kshop.test", password: randomBytes(12).toString("base64url") };
const OWNER = { email: "qa-bill-owner@e2e.kshop.test", password: randomBytes(12).toString("base64url") };
const INVITED = "qa-bill-staff@e2e.kshop.test";
mkdirSync(OUT, { recursive: true });

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

async function cleanup() {
  await service.from("stores").delete().eq("slug", SLUG);
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if ([SUPER.email, OWNER.email, INVITED].includes(u.email)) await service.auth.admin.deleteUser(u.id);
  }
}

await cleanup();
const { data: owner } = await service.auth.admin.createUser({
  email: OWNER.email,
  password: OWNER.password,
  email_confirm: true,
});
await service.auth.admin.createUser({
  email: SUPER.email,
  password: SUPER.password,
  email_confirm: true,
  app_metadata: { role: "superadmin" },
});
const { data: store, error: storeError } = await service
  .rpc("create_store", {
    p_name: "QA Cobros",
    p_slug: SLUG,
    p_owner_id: owner.user.id,
    p_base_currency: "CUP",
    p_order_prefix: "QB",
    p_whatsapp_phone: "+5350000000",
    p_plan_code: "base",
    p_trial_days: 0,
    p_platform_domain: "kshop.fullkod.com",
    p_created_by: null,
  })
  .single();
if (storeError) throw storeError;

const browser = await chromium.launch({ executablePath: chromiumPath() });
const errors = [];
async function newPage(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      !m.text().includes("instant navigation") &&
      errors.push(`${page.url()} :: ${m.text()}`),
  );
  page.on("dialog", (d) => d.accept());
  return page;
}
// caret "initial": see qa-orders.mjs (false hydration error otherwise).
const shot = (page, name) =>
  page.screenshot({ path: join(OUT, `qa-${name}.png`), fullPage: true, caret: "initial" });

async function login(page, url, account, landing) {
  await page.goto(`${url}/login`);
  await page.fill("#email", account.email);
  await page.fill("#password", account.password);
  await page.click("button[type=submit]");
  await page.waitForURL(landing, { timeout: 30000 });
}

const platform = await newPage({ width: 1280, height: 900 });
const admin = await newPage({ width: 1280, height: 900 });
const phone = await newPage({ width: 390, height: 844 });

try {
  // 1. Superadmin.
  await login(platform, `${PLATFORM}/superadmin`, SUPER, `${PLATFORM}/superadmin`);
  await platform.goto(`${PLATFORM}/superadmin/plans`);
  await platform.getByTestId("plan-base").waitFor({ timeout: 15000 });
  check(
    "plans: Base at 5 and Pro at 12 USD",
    (await platform.locator("#price-base").inputValue()) === "5" &&
      (await platform.locator("#price-pro").inputValue()) === "12",
  );
  await shot(platform, "01-superadmin-planes-1280");

  await platform.goto(`${PLATFORM}/superadmin`);
  await platform.getByTestId(`store-row-${SLUG}`).getByRole("link", { name: "QA Cobros" }).click();
  await platform.getByTestId("next-invoice").waitFor({ timeout: 15000 });
  check(
    "subscription: next invoice 5 USD",
    (await platform.getByTestId("next-invoice").innerText()).includes("5 USD"),
  );
  await platform.getByTestId("module-vouchers").getByRole("button", { name: "Añadir suelto" }).click();
  await platform
    .getByTestId("module-vouchers")
    .getByText("Suelto", { exact: true })
    .waitFor({ timeout: 15000 });
  check(
    "add-on bought: the next invoice is 7 USD",
    (await platform.getByTestId("next-invoice").innerText()).includes("7 USD"),
  );
  await platform.selectOption("#grantType", "discount_percent");
  await platform.fill("#value", "50");
  await platform.fill("#reason", "Socio fundador");
  await platform.getByRole("button", { name: "Añadir", exact: true }).click();
  await platform.getByText("Regalo añadido.").waitFor({ timeout: 15000 });
  check(
    "discount: 50 % -> 3,50 USD",
    (await platform.getByTestId("next-invoice").innerText()).includes("3,50 USD"),
  );
  await platform.getByRole("button", { name: "Emitir factura ahora" }).click();
  await platform.getByText("Factura emitida.").waitFor({ timeout: 15000 });
  await shot(platform, "02-superadmin-suscripcion-1280");
  await platform.getByTestId("invoice-pay").click();
  await platform.getByRole("button", { name: "Guardar pago" }).click();
  await platform.getByText("Factura actualizada.").waitFor({ timeout: 15000 });
  check(
    "cash payment registered: invoice paid",
    (await platform.locator("[data-testid^=invoice-KS-]").first().innerText()).includes("Pagada"),
  );
  await shot(platform, "03-superadmin-factura-pagada-1280");

  await platform.goto(`${PLATFORM}/superadmin/billing`);
  await platform.getByRole("button", { name: "Pagadas" }).click();
  await platform.getByText("QA Cobros").first().waitFor({ timeout: 15000 });
  await shot(platform, "04-superadmin-cobros-1280");
  const superPhone = await newPage({ width: 390, height: 844 });
  await login(superPhone, `${PLATFORM}/superadmin`, SUPER, `${PLATFORM}/superadmin`);
  await superPhone.goto(`${PLATFORM}/superadmin/stores/${store.id}`);
  await superPhone.getByTestId("next-invoice").waitFor({ timeout: 15000 });
  const overflow = await superPhone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("subscription page at 390 px: no horizontal scroll of the page", overflow <= 1, overflow);
  await shot(superPhone, "05-superadmin-suscripcion-390");

  // 2. Owner.
  await login(admin, `${BASE}/admin`, OWNER, `${BASE}/admin`);
  await admin.getByTestId("nav-billing").click();
  await admin.getByTestId("next-invoice").waitFor({ timeout: 15000 });
  check(
    "owner: plan, next invoice and modules with price",
    (await admin.getByTestId("available-multi_currency").isVisible()) &&
      (await admin.getByTestId("available-multi_currency").innerText()).includes("3 USD/mes"),
  );
  check(
    "owner: locked menu items show PRO, with the price in the title",
    (await admin.getByTestId("nav-locked-multi_currency").innerText()).includes("PRO") &&
      ((await admin.getByTestId("nav-locked-multi_currency").getAttribute("title")) ?? "").includes("3 USD"),
  );
  await shot(admin, "06-admin-plan-facturacion-1280");
  // R12 D6: outside the plan, «Apariencia» is managed by the platform (badge «Admin»), not a PRO upsell.
  check(
    "Base: «Apariencia» is managed by the platform in the menu",
    (await admin.getByTestId("nav-themes").innerText()).includes("Admin"),
  );
  await admin.goto(`${BASE}/admin/themes`);
  await admin.getByText("la configura el equipo de Kshop").waitFor({ timeout: 15000 });
  check("Base: the look is set up by Kshop", true);
  await shot(admin, "07-admin-apariencia-base-1280");

  await admin.goto(`${BASE}/admin/team`);
  await admin.getByTestId("team-usage").waitFor({ timeout: 15000 });
  // R13: the invitation opens in a dialog.
  await admin.getByRole("button", { name: "Invitar persona" }).click();
  await admin.fill("#email", INVITED);
  await admin.getByRole("dialog").getByRole("button", { name: "Invitar", exact: true }).click();
  await admin.getByTestId("team-invited").waitFor({ timeout: 20000 });
  await admin.getByTestId(`member-${INVITED}`).waitFor({ timeout: 15000 });
  check(
    "team: invitation with a WhatsApp link",
    (await admin.getByTestId("team-usage").innerText()).includes("1 de 2"),
  );
  await shot(admin, "08-admin-equipo-1280");

  await service.from("subscriptions").update({ status: "past_due" }).eq("store_id", store.id);
  await login(phone, `${BASE}/admin`, OWNER, `${BASE}/admin`);
  await phone.goto(`${BASE}/admin/billing`);
  await phone.getByTestId("banner-past-due").waitFor({ timeout: 15000 });
  await phone.getByTestId("next-invoice").waitFor({ timeout: 15000 });
  check("overdue: banner in the admin", true);
  const phoneOverflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("billing page at 390 px: no horizontal scroll", phoneOverflow <= 1, phoneOverflow);
  await shot(phone, "09-admin-plan-facturacion-vencida-390");

  // 3. Suspended by billing.
  await service.from("subscriptions").update({ status: "suspended" }).eq("store_id", store.id);
  await service
    .from("stores")
    .update({ status: "suspended", suspended_reason: "billing" })
    .eq("id", store.id);
  await phone.goto(`${BASE}/admin`);
  await phone.getByTestId("banner-suspended").waitFor({ timeout: 15000 });
  check(
    "suspended: read-only banner",
    (await phone.getByTestId("banner-suspended").innerText()).includes("solo de lectura"),
  );
  await shot(phone, "10-admin-suspendida-390");
  // The daily job suspends in the database: the storefront shows it when its store card (cached "minutes") refreshes.
  // Meanwhile the cart of the still-cached storefront gets 404 (the database already closed it): expected there.
  const before = errors.length;
  let closed = false;
  for (let i = 0; i < 12 && !closed; i++) {
    await phone.goto(BASE);
    closed = await phone
      .getByText("temporalmente no disponible")
      .first()
      .isVisible()
      .catch(() => false);
    if (!closed) await phone.waitForTimeout(10000);
  }
  if (!closed) throw new Error("storefront still open after 2 minutes");
  errors.splice(
    before,
    errors.length - before,
    ...errors.slice(before).filter((e) => !/status of 404/.test(e)),
  );
  check("suspended: the storefront is closed", true);
  await shot(phone, "11-tienda-suspendida-390");

  if (errors.length) writeFileSync(join(OUT, "console-errors.txt"), errors.join("\n\n"));
  check("no console errors", errors.length === 0, errors.map((e) => e.slice(0, 300)).join(" | "));
} catch (error) {
  check("flow", false, error);
  await shot(platform, "error-superadmin");
  await shot(admin, "error-admin");
  await shot(phone, "error-movil");
} finally {
  await browser.close();
  await cleanup();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
