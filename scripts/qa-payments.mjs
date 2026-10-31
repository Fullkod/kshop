// Browser QA of KSH0002 on the Tienda Demo (pnpm dev running, pnpm demo:seed done): the owner pays an order with
// dollars and the rest in the order currency, in the phone width and in the desktop one. Screenshots go to
// .titan/qa/pos/. The order is cancelled at the end, which puts the stock back.
//
//   node scripts/db-env.mjs node scripts/qa-payments.mjs   (QA_BASE_URL for another port)

import { createClient } from "@supabase/supabase-js";
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

const port = new URL(env.QA_BASE_URL ?? "http://localhost:3000").port;
const BASE = `http://demo.kshop.localhost:${port || 3000}`;
const OUT = join(root, ".titan/qa/pos");
mkdirSync(OUT, { recursive: true });

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
function check(name, ok, detail) {
  results.push(ok);
  console.log(`${ok ? "ok" : "not ok"} - ${name}${ok || detail === undefined ? "" : ` (${String(detail).slice(0, 400)})`}`);
}

function chromiumPath() {
  if (env.QA_CHROMIUM_PATH) return env.QA_CHROMIUM_PATH;
  const cache = join(env.LOCALAPPDATA ?? join(env.HOME ?? "", ".cache"), "ms-playwright");
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)) : [];
  dirs.sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const dir of dirs) {
    for (const exe of ["chrome-win64/chrome.exe", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
      if (existsSync(join(cache, dir, exe))) return join(cache, dir, exe);
    }
  }
  throw new Error(`No Chromium in ${cache}; install one (npx playwright install chromium) or set QA_CHROMIUM_PATH`);
}

const { data: store } = await service.from("stores").select("id, base_currency").eq("slug", "demo").single();
const { data: product } = await service.from("products").select("id").eq("store_id", store.id).eq("slug", "vestido-nandu").single();
const { data: variants } = await service.from("product_variants").select("id").eq("product_id", product.id).limit(1);
const { data: agree } = await service.from("shipping_methods").select("id, zone_id").eq("store_id", store.id).eq("type", "to_agree").eq("is_active", true).limit(1).single();
const { data: member } = await service.from("store_members").select("user_id").eq("store_id", store.id).eq("role", "owner").limit(1).single();
const { data: owner } = await service.auth.admin.getUserById(member.user_id);
const email = owner.user.email;

const browser = await chromium.launch({ executablePath: chromiumPath(), headless: true });
let orderId = null;
let token = null;
const api = (method, path, body) =>
  fetch(`http://localhost:${port || 3000}/api/v1/stores/${store.id}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

try {
  const auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error } = await auth.auth.signInWithPassword({ email, password: env.DEMO_OWNER_PASSWORD });
  if (error) throw error;
  token = session.session.access_token;

  const res = await api("POST", "/orders", {
    idempotencyKey: `qa-payments-${Date.now()}`,
    customer: { name: "QA cobro mixto", phone: "+5353123456" },
    lines: [{ variantId: variants[0].id, quantity: 1 }],
    shipping: { zoneId: agree.zone_id, methodId: agree.id },
    notifyCustomer: false,
  });
  const created = await res.json();
  if (res.status !== 201) throw new Error(`order: ${JSON.stringify(created)}`);
  orderId = created.orderId;
  await api("POST", `/orders/${orderId}/shipping`, { amount: 0 });
  const { data: row } = await service.from("orders").select("total, currency").eq("id", orderId).single();
  const total = Number(row.total);
  const other = row.currency === "USD" ? "CUP" : "USD";

  for (const [label, width, height] of [["movil", 390, 844], ["escritorio", 1280, 800]]) {
    const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
    await page.goto(`${BASE}/admin/login`);
    await page.fill("#email", email);
    await page.fill("#password", env.DEMO_OWNER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/admin`, { timeout: 60000 });
    await page.goto(`${BASE}/admin/orders/${orderId}`);
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await page.selectOption("#pay-currency", other);
    await page.fill("#pay-rate", "320");
    await page.fill("#pay-amount", other === "USD" ? String(Math.round((total / 2 / 320) * 100) / 100) : String(total * 160));
    const status = page.getByRole("status").filter({ hasText: "Faltan" });
    await status.waitFor({ timeout: 10000 });
    check(`${label}: says how much is missing`, /Faltan/.test(await status.innerText()));
    check(
      `${label}: no horizontal scroll`,
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    );
    await page.screenshot({ path: join(OUT, `cobro-mixto-${label}.png`), fullPage: true });
    await page.context().close();
  }

  // Record it for real from the desktop width: the other currency, then the rest.
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(`${BASE}/admin/login`);
  await page.fill("#email", email);
  await page.fill("#password", env.DEMO_OWNER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/admin`, { timeout: 60000 });
  await page.goto(`${BASE}/admin/orders/${orderId}`);
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.selectOption("#pay-currency", other);
  await page.fill("#pay-rate", "320");
  await page.fill("#pay-amount", other === "USD" ? String(Math.round((total / 2 / 320) * 100) / 100) : String(total * 160));
  await page.getByRole("button", { name: "Guardar pago" }).click();
  await page.getByText(/aplica/).first().waitFor({ timeout: 15000 });
  check("the payment shows what it applied", true);

  await page.getByRole("button", { name: "Registrar pago" }).click();
  const rest = await page.inputValue("#pay-amount");
  check("the form proposes the rest", Number(rest) > 0 && Number(rest) < total, rest);
  await page.getByRole("button", { name: "Guardar pago" }).click();
  await page.waitForTimeout(1500);
  const { data: paid } = await service.from("orders").select("paid_total, payment_status").eq("id", orderId).single();
  check("the order ends paid", paid.payment_status === "paid" && Number(paid.paid_total) === total, JSON.stringify(paid));
  await page.reload();
  await page.getByText(/aplica/).first().waitFor({ timeout: 15000 });
  const history = await page.getByRole("heading", { name: "Historial" }).locator("..").innerText();
  check(`the history shows the payment in ${other}`, new RegExp(`Pago registrado[^\\n]*${other}`).test(history), history);
  await page.screenshot({ path: join(OUT, "cobro-mixto-pagado.png"), fullPage: true });
} finally {
  if (orderId) await api("POST", `/orders/${orderId}/cancel`, { reason: "QA" });
  await browser.close();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
