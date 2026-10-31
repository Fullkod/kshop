// R14 QA in the browser: confirmations use the Kshop dialog, never the browser's boxes. As the Tienda Demo owner and
// as a temporary superadmin (on a temporary Base store): each action opens the confirm dialog, «Cancelar»/Esc sends no
// write, and confirming does what it did before. Screenshots in .titan/qa/r14-confirmaciones/ (1280 and 390, light and
// dark). Temporary data (a brand, the superadmin, the store) is removed at the end, also on failure. Needs pnpm dev
// (QA_BASE_URL for another port).
//
//   pnpm qa:confirms

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
const OUT = join(root, ".titan/qa/r14-confirmaciones");
const BRAND = "QA Marca R14";
const ROOT_EMAIL = "qa-confirms-root@e2e.kshop.test";
const OWNER_EMAIL = "qa-confirms-owner@e2e.kshop.test";
const TEMP_SLUG = "conf-qa";
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

async function sessionOf(email, password) {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in of ${email} failed: ${error.message}`);
  return data.session;
}

async function cleanup() {
  await service.from("stores").delete().eq("slug", TEMP_SLUG);
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (u.email === ROOT_EMAIL || u.email === OWNER_EMAIL) await service.auth.admin.deleteUser(u.id);
  }
}

const { data: demo } = await service.from("stores").select("id").eq("slug", "demo").single();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const consoleErrors = [];
let nativeDialogs = 0;
let writes = [];

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
    // Not errors: the dev-only «instant navigation» notice of Next (see qa-billing.mjs) and Realtime reconnects.
    if (m.type() === "error" && !/instant navigation|WebSocket|realtime/i.test(m.text())) {
      consoleErrors.push(`${page.url()}: ${m.text().slice(0, 200)}`);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()}: pageerror ${String(e).slice(0, 200)}`));
  // Any browser box (window.confirm/prompt/alert) is a failure of R14.
  page.on("dialog", async (d) => {
    nativeDialogs++;
    await d.dismiss();
  });
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/") && r.method() !== "GET") writes.push(`${r.method()} ${r.url()}`);
  });
  return page;
}

const confirmBox = (page) => page.getByTestId("confirm-dialog");
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });

/** Opens the confirmation with `open`, checks it, cancels it (button or Esc) and checks nothing was written. */
async function openAndCancel(page, name, open, { esc = false, focus = "Cancelar" } = {}) {
  await open();
  const shown = await confirmBox(page)
    .waitFor({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return check(`${name}: opens the confirm dialog`, false);
  const focused = await page.evaluate(
    () => document.activeElement?.textContent?.trim() ?? document.activeElement?.tagName,
  );
  check(`${name}: opens the confirm dialog (focus on ${focus})`, focus === "*" || focused === focus, focused);
  await shot(page, name);
  writes = [];
  if (esc) await page.keyboard.press("Escape");
  else
    await confirmBox(page)
      .getByRole("button", { name: /^(Cancelar|Volver)$/ })
      .click();
  await confirmBox(page).waitFor({ state: "detached", timeout: 5000 });
  await page.waitForTimeout(800);
  check(`${name}: ${esc ? "Esc" : "«Cancelar»"} sends nothing`, writes.length === 0, writes.join(", "));
}

try {
  await cleanup();
  const owner = await sessionOf(env.DEMO_OWNER_EMAIL ?? "dueno@demo.kshop.test", env.DEMO_OWNER_PASSWORD);
  const page = await newPage(owner);

  // Brand: cancel, then confirm for real.
  await service.from("brands").delete().eq("store_id", demo.id).eq("name", BRAND);
  const { error: brandError } = await service
    .from("brands")
    .insert({ store_id: demo.id, name: BRAND, slug: "qa-marca-r14" });
  if (brandError) throw brandError;
  await page.goto(`${STORE_URL}/admin/catalog/brands`);
  const brandRow = page.locator("li", { hasText: BRAND });
  await brandRow.waitFor({ timeout: 60000 });
  await openAndCancel(page, "01-borrar-marca", () =>
    brandRow.getByRole("button", { name: "Borrar" }).click(),
  );
  await openAndCancel(
    page,
    "01-borrar-marca-esc",
    () => brandRow.getByRole("button", { name: "Borrar" }).click(),
    {
      esc: true,
    },
  );
  await brandRow.getByRole("button", { name: "Borrar" }).click();
  await confirmBox(page).getByRole("button", { name: "Borrar" }).click();
  await brandRow.waitFor({ state: "detached", timeout: 15000 });
  const { data: left } = await service.from("brands").select("id").eq("store_id", demo.id).eq("name", BRAND);
  check("brand: confirming deletes it", (left ?? []).length === 0);

  // Deletes that did not ask before (P1): open and cancel on the first row of each list.
  for (const [path, name] of [
    ["/admin/discounts", "02-borrar-promocion"],
    ["/admin/discounts/vouchers", "03-borrar-cupon"],
    ["/admin/shipping", "04-borrar-zona"],
    ["/admin/orders/payment-methods", "05-borrar-metodo-pago"],
    ["/admin/whatsapp-notifications", "06-borrar-contacto"],
  ]) {
    await page.goto(`${STORE_URL}${path}`);
    const button = page
      .locator("main")
      .getByRole("button", { name: /^(Borrar|Desactivar)$/ })
      .first();
    const found = await button
      .waitFor({ timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    if (!found) {
      check(`${name}: has a row to try`, false, path);
      continue;
    }
    await openAndCancel(page, name, () => button.click());
  }

  // Cancel an order (P4): the reason goes inside the dialog; «Volver» leaves the order as it was. The Demo of the test
  // project may have no cancellable order: one is put in «processing» for the check and given its status back.
  // Not a counter sale: its button says «Cancelar venta».
  const { data: order } = await service
    .from("orders")
    .select("id, status")
    .eq("store_id", demo.id)
    .neq("channel", "pos")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const cancellable = ["pending_confirmation", "pending_payment", "paid", "processing"].includes(order.status);
  if (!cancellable) await service.from("orders").update({ status: "processing" }).eq("id", order.id);
  try {
    await page.goto(`${STORE_URL}/admin/orders/${order.id}`);
    const cancel = page.getByRole("button", { name: "Cancelar pedido" });
    await cancel.waitFor({ timeout: 30000 });
    await openAndCancel(page, "07-cancelar-pedido", () => cancel.click(), { focus: "*" });
    const { data: after } = await service.from("orders").select("status").eq("id", order.id).single();
    check("order: «Volver» leaves it as it was", after?.status === (cancellable ? order.status : "processing"));
  } finally {
    if (!cancellable) await service.from("orders").update({ status: order.status }).eq("id", order.id);
  }
  await page.context().close();

  // Phone and dark mode of one confirmation.
  for (const [width, dark] of [
    [390, false],
    [390, true],
    [1280, true],
  ]) {
    const p = await newPage(owner, { width, height: width === 390 ? 844 : 900, dark });
    await p.goto(`${STORE_URL}/admin/shipping`);
    const button = p.locator("main").getByRole("button", { name: "Borrar" }).first();
    await button.waitFor({ timeout: 30000 });
    await button.click();
    await confirmBox(p).waitFor({ timeout: 10000 });
    if (width === 390 && !dark) {
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check("confirm 390: no horizontal scroll", overflow <= 0, overflow);
      const box = await p.locator("dialog[open]").boundingBox();
      check("confirm 390: a bottom sheet as tall as its content", box && box.height < 400 && box.y + box.height >= 843, JSON.stringify(box));
    }
    await shot(p, `08-confirmar-${width}${dark ? "-dark" : ""}`);
    await confirmBox(p).getByRole("button", { name: "Cancelar" }).click();
    await p.context().close();
  }

  // --- Superadmin: suspend, gift with a date, remove an add-on (P2, P3) -----------------------------------------
  const { error: rootError } = await service.auth.admin.createUser({
    email: ROOT_EMAIL,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { role: "superadmin" },
  });
  if (rootError) throw rootError;
  const { data: tempOwner, error: ownerError } = await service.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (ownerError) throw ownerError;
  const { data: temp, error: tempError } = await service
    .rpc("create_store", {
      p_name: "Confirms QA",
      p_slug: TEMP_SLUG,
      p_owner_id: tempOwner.user.id,
      p_base_currency: "CUP",
      p_order_prefix: "CQ",
      p_whatsapp_phone: "5350000000",
      p_plan_code: "base",
      p_trial_days: 30,
      p_platform_domain: "kshop.fullkod.com",
      p_created_by: null,
    })
    .single();
  if (tempError) throw tempError;

  const rootPage = await newPage(await sessionOf(ROOT_EMAIL, PASSWORD));
  await rootPage.goto(`${PLATFORM_URL}/superadmin/stores/${temp.id}`);
  const suspend = rootPage.getByRole("button", { name: "Suspender a mano" });
  await suspend.waitFor({ timeout: 60000 });
  await openAndCancel(rootPage, "09-suspender-tienda", () => suspend.click());
  const { data: still } = await service.from("stores").select("status").eq("id", temp.id).single();
  check("store: still active after cancelling the suspension", still?.status === "active", still?.status);

  const finance = rootPage.getByTestId("module-finance");
  await finance.getByRole("button", { name: "Regalar" }).click();
  await confirmBox(rootPage).waitFor({ timeout: 10000 });
  check(
    "gift: asks for the end date with a date field",
    (await confirmBox(rootPage).locator('input[type="date"]').count()) === 1,
  );
  await shot(rootPage, "10-regalar-modulo");
  writes = [];
  await confirmBox(rootPage).getByRole("button", { name: "Cancelar" }).click();
  await confirmBox(rootPage).waitFor({ state: "detached", timeout: 5000 });
  check("gift: cancelling sends nothing", writes.length === 0, writes.join(", "));

  const vouchers = rootPage.getByTestId("module-vouchers");
  await vouchers.getByRole("button", { name: "Añadir suelto" }).click();
  await vouchers.getByRole("button", { name: "Quitar suelto" }).waitFor({ timeout: 20000 });
  await openAndCancel(rootPage, "11-quitar-suelto", () =>
    vouchers.getByRole("button", { name: "Quitar suelto" }).click(),
  );
  await vouchers.getByRole("button", { name: "Quitar suelto" }).click();
  await confirmBox(rootPage).getByRole("button", { name: "Quitar suelto" }).click();
  await vouchers.getByRole("button", { name: "Añadir suelto" }).waitFor({ timeout: 20000 });
  check("add-on: confirming removes it", true);

  await rootPage.goto(`${PLATFORM_URL}/superadmin`);
  const actions = rootPage.getByTestId(`store-actions-${TEMP_SLUG}`).first();
  await actions.waitFor({ timeout: 60000 });
  await actions.locator("summary").click();
  await openAndCancel(rootPage, "12-suspender-desde-lista", () =>
    actions.getByRole("button", { name: "Suspender" }).click(),
  );
  await rootPage.context().close();
} catch (error) {
  check("unexpected error", false, error?.stack ?? error);
} finally {
  await service.from("brands").delete().eq("store_id", demo.id).eq("name", BRAND);
  await cleanup();
  await browser.close();
}

check("no browser box (window.confirm/prompt/alert) appeared", nativeDialogs === 0, nativeDialogs);
check("no console errors", consoleErrors.length === 0, consoleErrors.join("\n"));
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed; screenshots in ${OUT}`);
process.exit(passed === results.length ? 0 : 1);
