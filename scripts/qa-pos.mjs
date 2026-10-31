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
  check("no errors in the page", errors.length === 0, errors.join(" | "));
} finally {
  if (orderId) await api("POST", `/orders/${orderId}/cancel`, { reason: "QA" });
  await browser.close();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
