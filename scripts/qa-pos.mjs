// Browser QA of the counter sales on the Tienda Demo (pnpm dev running, pnpm demo:seed done): a sale uploaded through the
// API, without a phone, opens in the order list, the order and Inicio. Screenshots go to .titan/qa/pos/. The sale is
// cancelled at the end, which puts the stock back.
//
//   pnpm qa:pos   (QA_BASE_URL for another port)

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
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

const port = new URL(env.QA_BASE_URL ?? "http://localhost:3000").port || 3000;
const BASE = `http://demo.kshop.localhost:${port}`;
const OUT = join(root, ".titan/qa/pos");
const EMAIL = "dueno@demo.kshop.test";
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

const { data: store } = await service.from("stores").select("id").eq("slug", "demo").single();
const auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: session, error } = await auth.auth.signInWithPassword({ email: EMAIL, password: env.DEMO_OWNER_PASSWORD });
if (error) throw error;
const api = async (method, path, body) => {
  const res = await fetch(`http://localhost:${port}/api/v1/stores/${store.id}${path}`, {
    method,
    headers: { Authorization: `Bearer ${session.session.access_token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// What the phone downloads, page by page: how long and how much on the database's Nano.
let after;
let items = 0;
let bytes = 0;
let first;
const started = Date.now();
do {
  const page = await api("GET", `/pos/catalog${after ? `?after=${after}` : ""}`);

  if (page.status !== 200) throw new Error(`catalog: ${JSON.stringify(page)}`);
  bytes += JSON.stringify(page.body).length;
  items += page.body.items.length;
  first ??= page.body.items.find((i) => i.price > 0);
  after = page.body.next;
} while (after);
console.log(`catalog: ${items} variants, ${Math.round(bytes / 1024)} KB, ${Date.now() - started} ms`);
check("catalog: downloads", items > 0 && !!first, items);

const upload = await api("POST", "/pos/sales", {
  sales: [
    {
      id: randomUUID(),
      deviceId: randomUUID(),
      localNumber: "C-QA",
      soldAt: new Date().toISOString(),
      lines: [{ variantId: first.variantId, quantity: 1, unitPrice: first.price, productName: first.productName }],
      payments: [{ amount: first.price }],
    },
  ],
});
const orderId = upload.body.results?.[0]?.orderId;
check("upload: a counter sale", !!orderId, JSON.stringify(upload.body));

// Charged at another price and half in USD: the owner must see the note and the rate.
const flaggedUpload = await api("POST", "/pos/sales", {
  sales: [
    {
      id: randomUUID(),
      deviceId: randomUUID(),
      localNumber: "C-QA2",
      soldAt: new Date().toISOString(),
      lines: [{ variantId: first.variantId, quantity: 1, unitPrice: first.price + 100, productName: first.productName }],
      payments: [{ amount: 1, currency: "USD", rate: first.price + 100 }],
    },
  ],
});
const flaggedId = flaggedUpload.body.results?.[0]?.orderId;
check("upload: a sale at another price", !!flaggedId, JSON.stringify(flaggedUpload.body));

const browser = await chromium.launch({ executablePath: chromiumPath(), headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/admin/login`);
  await page.fill("#email", EMAIL);
  await page.fill("#password", env.DEMO_OWNER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/admin`, { timeout: 60000 });
  await page.getByText("Mostrador").first().waitFor({ timeout: 20000 });
  check("Inicio: shows the sale without a phone", true);

  await page.goto(`${BASE}/admin/orders`);
  await page.getByRole("tab", { name: "Entregados" }).click();
  await page.getByText("Mostrador").first().waitFor({ timeout: 20000 });
  check("Pedidos: the list opens with a sale without a phone", true);
  await page.screenshot({ path: join(OUT, "mostrador-lista.png"), fullPage: true });

  await page.goto(`${BASE}/admin/orders/${orderId}`);
  await page.getByText("Mostrador").first().waitFor({ timeout: 20000 });
  check("Pedido: no WhatsApp to a customer that does not exist", (await page.getByText("WhatsApp al cliente").count()) === 0);
  await page.screenshot({ path: join(OUT, "mostrador-pedido.png"), fullPage: true });

  // What the owner sees: the counter tab, the page of the module, the note and the rate.
  await page.goto(`${BASE}/admin/orders`);
  await page.getByRole("tab", { name: "Mostrador" }).click();
  await page.getByTestId("orders-list").getByText("Mostrador").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);
  const rowCount = await page.getByTestId("orders-list").locator("li").count();
  const counterRows = await page.getByTestId("orders-list").locator("li").filter({ hasText: "Mostrador" }).count();
  check("Pedidos: the tab shows only counter sales", rowCount > 0 && rowCount === counterRows, `${counterRows}/${rowCount}`);
  await page.screenshot({ path: join(OUT, "fase6-pestana-mostrador.png"), fullPage: true });

  await page.goto(`${BASE}/admin/pos`);
  await page.getByTestId("pos-overview").waitFor({ timeout: 20000 });
  check("Caja: says the sales of today", /\d+ ventas?/.test(await page.getByTestId("pos-overview").innerText()));
  check("Caja: the till per currency", /USD/.test(await page.getByTestId("pos-cash").innerText()), await page.getByTestId("pos-cash").innerText());
  check("Caja: the rate used", /1 USD =/.test(await page.getByTestId("pos-rates").innerText()), await page.getByTestId("pos-rates").innerText());
  check("Caja: what needs a look", /se cobró a/.test(await page.getByTestId("pos-flagged").innerText()), await page.getByTestId("pos-flagged").innerText());
  check("Caja: no costs", !/costo/i.test(await page.locator("main").innerText()));
  await page.screenshot({ path: join(OUT, "fase6-caja.png"), fullPage: true });
  await page.getByRole("link", { name: "Ver las ventas de mostrador" }).click();
  await page.waitForURL(/\/admin\/orders\?tab=counter/, { timeout: 20000 });
  await page.getByRole("tab", { name: "Mostrador", selected: true }).waitFor({ timeout: 20000 });
  check("Caja: links to the counter tab", true);

  await page.goto(`${BASE}/admin/orders/${flaggedId}`);
  await page.getByTestId("counter-flags").waitFor({ timeout: 20000 });
  check("Pedido: the note in plain words", /se cobró a/.test(await page.getByTestId("counter-flags").innerText()));
  check("Pedido: the rate of the payment", (await page.getByText(/1 USD =/).count()) > 0);
  check("Pedido: no delivery nor customer of a counter sale", (await page.getByRole("heading", { name: "Entrega", exact: true }).count()) === 0 && (await page.getByRole("heading", { name: "Cliente", exact: true }).count()) === 0);
  await page.screenshot({ path: join(OUT, "fase6-venta-anotada.png"), fullPage: true });

  // Cancelling a delivered counter sale from the screen.
  await page.getByRole("button", { name: "Cancelar venta" }).click();
  await page.getByRole("button", { name: "Volver" }).click();
  check("Pedido: backing out cancels nothing", (await page.getByRole("button", { name: "Cancelar venta" }).count()) === 1);
  await page.getByRole("button", { name: "Cancelar venta" }).click();
  await page.getByRole("button", { name: "Confirmar cancelación" }).click();
  await page.getByText("Reembolso").first().waitFor({ timeout: 20000 });
  const { data: cancelled } = await service.from("orders").select("status, paid_total").eq("id", flaggedId).single();
  check("Pedido: cancelled, the balance at 0", cancelled.status === "cancelled" && Number(cancelled.paid_total) === 0, JSON.stringify(cancelled));
  check("Pedido: no cancel button anymore", (await page.getByRole("button", { name: "Cancelar venta" }).count()) === 0);

  const mobile = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await page.context().storageState() })).newPage();
  await mobile.goto(`${BASE}/admin/pos`);
  await mobile.getByTestId("pos-overview").waitFor({ timeout: 20000 });
  check("Caja: fits a phone", await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await mobile.screenshot({ path: join(OUT, "fase6-caja-movil.png"), fullPage: true });

  check("no errors in the page", errors.length === 0, errors.join(" | "));
} finally {
  if (orderId) await api("POST", `/orders/${orderId}/cancel`, { reason: "QA" });
  if (flaggedId) await api("POST", `/orders/${flaggedId}/cancel`, { reason: "QA" });
  await browser.close();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
