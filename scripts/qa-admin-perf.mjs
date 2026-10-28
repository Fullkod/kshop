// Admin performance probe (R11): signs in as the Tienda Demo owner and opens every admin view once, recording the
// time until the data requests settle, the requests made (API, pg_graphql operations, batches) and every failure.
// Read-only: it never clicks or saves anything. Results go to .titan/qa/r11-rendimiento-admin/perf-<label>.json and a
// summary (median, p95, errors, pg_graphql requests before the page) is printed.
//
//   node scripts/qa-admin-perf.mjs [label]            # local: http://demo.kshop.localhost:3000 (pnpm dev running)
//   QA_ADMIN_URL=https://demo.kshop.fullkod.com node scripts/qa-admin-perf.mjs prod-antes
//   QA_VIEWS=orders,catalog node scripts/qa-admin-perf.mjs   # only some views (QA_SHOTS=1: a screenshot per view)
//
// Never run it while someone uses the admin or right after tests/imports/builds: the Nano is throttled for minutes
// after a burst and the numbers would lie (measure in alternating rounds).

import { createClient } from "@supabase/supabase-js";
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

const BASE = (env.QA_ADMIN_URL ?? "http://demo.kshop.localhost:3000").replace(/\/$/, "");
const LABEL = process.argv[2] ?? "local";
const OUT = join(root, ".titan/qa/r11-rendimiento-admin");
const SETTLE_MS = 2000; // no pending data request for this long = the view is done
const VIEW_CAP_MS = 60000;
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

// Ids for the detail views: the newest order and product of the Demo store.
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: store } = await service.from("stores").select("id").eq("slug", "demo").single();
const { data: order } = await service
  .from("orders")
  .select("id")
  .eq("store_id", store.id)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
const { data: product } = await service
  .from("products")
  .select("id")
  .eq("store_id", store.id)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

const ALL_VIEWS = [
  "",
  "orders",
  order ? `orders/${order.id}` : null,
  "orders/customers",
  "orders/payment-methods",
  "sales-today",
  "catalog",
  product ? `catalog/products/${product.id}` : null,
  "catalog/categories",
  "catalog/attributes",
  "catalog/brands",
  "catalog/collections",
  "catalog/warehouses",
  "finance",
  "finance/breakdown",
  "finance/expenses",
  "finance/inventory",
  "finance/margin",
  "discounts",
  "discounts/vouchers",
  "shipping",
  "themes",
  "themes/home",
  "themes/banners",
  "themes/menus",
  "themes/pages",
  "team",
  "whatsapp-notifications",
  "whatsapp-notifications/log",
  "whatsapp-notifications/templates",
  "billing",
  "multi-warehouse",
  "multi-warehouse/movements",
  "multi-warehouse/transfer",
  "multi-currency",
  "mobile-app",
  "custom-domain",
].filter((v) => v !== null);
const only = env.QA_VIEWS?.split(",").map((v) => v.trim());
const views = only
  ? ALL_VIEWS.filter((v) => only.includes(v) || (v === "" && only.includes("home")))
  : ALL_VIEWS;

// Sign in through Supabase Auth and put the session where supabase-js keeps it, so the probe does not depend on the
// login form (measured separately).
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
  email: env.DEMO_OWNER_EMAIL ?? "dueno@demo.kshop.test",
  password: env.DEMO_OWNER_PASSWORD,
});
if (signInError) throw new Error(`Owner sign-in failed: ${signInError.message}`);
const storageKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

const browser = await chromium.launch({ executablePath: chromiumPath() });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await context.addInitScript(
  ([key, value]) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // storage blocked: the page will show the login
    }
  },
  [storageKey, JSON.stringify(signIn.session)],
);
const page = await context.newPage();

const isData = (url) => url.includes("/graphql/v1") || url.includes("/rest/v1") || url.includes("/api/v1");
let requests = [];
let consoleErrors = [];
const pending = new Map();
let lastActivity = Date.now();
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 300)));
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`));
page.on("request", (r) => {
  if (!isData(r.url())) return;
  pending.set(r, Date.now());
  lastActivity = Date.now();
});
async function finished(r, failed) {
  const start = pending.get(r);
  if (start === undefined) return;
  pending.delete(r);
  lastActivity = Date.now();
  const url = r.url();
  const record = {
    kind: url.includes("/graphql/v1") ? "graphql" : url.includes("/rest/v1") ? "rest" : "api",
    path: url
      .replace(/^https?:\/\/[^/]+/, "")
      .split("?")[0]
      .slice(0, 100),
    startMs: start - viewStart,
    ms: Date.now() - start,
  };
  const ops = [...(r.postData() ?? "").matchAll(/(?:query|mutation)\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  if (ops.length) record.ops = ops;
  // Requests the previous page started and the navigation cancelled belong to no view.
  if (failed && r.failure()?.errorText === "net::ERR_ABORTED") return;
  if (failed) record.status = `failed: ${r.failure()?.errorText ?? ""}`;
  else {
    const response = await r.response();
    record.status = response?.status();
    try {
      if ((response?.headers()["content-type"] ?? "").includes("json")) {
        const body = await response.text();
        if (record.status >= 400 || body.includes('"errors"')) record.error = body.slice(0, 300);
      }
    } catch {
      // body already gone (navigation)
    }
  }
  requests.push(record);
}
page.on("requestfinished", (r) => finished(r, false));
page.on("requestfailed", (r) => finished(r, true));

let viewStart = Date.now();
const results = [];
for (const view of views) {
  requests = [];
  consoleErrors = [];
  pending.clear();
  viewStart = Date.now();
  lastActivity = viewStart;
  let navError = null;
  try {
    await page.goto(`${BASE}/admin/${view}`, { waitUntil: "domcontentloaded", timeout: VIEW_CAP_MS });
  } catch (e) {
    navError = String(e).slice(0, 200);
  }
  // The quiet window starts when the document is in: the app only fires its reads after hydrating.
  lastActivity = Math.max(lastActivity, Date.now());
  // Done = no data request pending for SETTLE_MS and no «Cargando…» on screen (the shell waits between reads).
  const loading = () =>
    page.evaluate(() => document.body?.innerText.includes("Cargando…") ?? true).catch(() => true);
  let stillLoading = true;
  while (Date.now() - viewStart < VIEW_CAP_MS) {
    await new Promise((r) => setTimeout(r, 250));
    if (pending.size > 0 || Date.now() - lastActivity <= SETTLE_MS) continue;
    stillLoading = await loading();
    if (!stillLoading) break;
  }
  const timedOut = pending.size > 0 || stillLoading;
  // A view that never settles counts with the whole wait; its hanging requests are listed.
  const settledMs = timedOut ? Date.now() - viewStart : Math.max(0, lastActivity - viewStart);
  const hanging = [...pending.keys()].map((r) =>
    r
      .url()
      .replace(/^https?:\/\/[^/]+/, "")
      .split("?")[0]
      .slice(0, 100),
  );
  const stuck = stillLoading;
  const failures = requests.filter((r) => typeof r.status !== "number" || r.status >= 400 || r.error);
  const firstPageRead = requests.find((r) => r.kind === "graphql" && !r.ops?.includes("StoreEntitlements"));
  results.push({
    view: view || "home",
    settledMs,
    timedOut,
    hanging,
    stuck,
    navError,
    requests: requests.length,
    graphql: requests.filter((r) => r.kind === "graphql").length,
    api: requests.filter((r) => r.kind === "api").length,
    // Data requests that finished before the page's own first GraphQL read started (the shell's boot chain).
    bootRequests: firstPageRead
      ? requests.filter((r) => r.startMs + r.ms <= firstPageRead.startMs).length
      : null,
    slowest: [...requests]
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 3)
      .map((r) => ({ path: r.path, ops: r.ops, ms: r.ms, status: r.status })),
    failures,
    consoleErrors: consoleErrors.slice(0, 5),
    // [start ms, duration ms, what] of every data request, to see the gaps of the boot chain.
    timeline: [...requests]
      .sort((x, y) => x.startMs - y.startMs)
      .map((r) => [r.startMs, r.ms, r.ops?.join("+") ?? r.path.replace(/\/api\/v1\/stores\/[^/]+/, "")]),
  });
  console.log(
    `${(view || "home").padEnd(36)} ${String(settledMs).padStart(6)} ms  ${String(requests.length).padStart(3)} req` +
      `${failures.length ? `  ${failures.length} FAILED` : ""}${stuck ? "  STUCK" : ""}${timedOut ? `  HANGING ${hanging.join(" ")}` : ""}`,
  );
  if (env.QA_SHOTS === "1") {
    await page
      .screenshot({ path: join(OUT, `perf-${LABEL}-${(view || "home").replace(/\//g, "_").slice(0, 40)}.png`) })
      .catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 1500)); // let the instance breathe between views
}
await browser.close();

const times = results.map((r) => r.settledMs).sort((a, b) => a - b);
const pct = (p) => times[Math.min(times.length - 1, Math.ceil((p / 100) * times.length) - 1)];
const summary = {
  label: LABEL,
  base: BASE,
  at: new Date().toISOString(),
  views: results.length,
  medianMs: pct(50),
  p95Ms: pct(95),
  maxMs: times.at(-1),
  viewsWithErrors: results.filter((r) => r.failures.length || r.stuck || r.timedOut || r.navError).length,
  requests: results.reduce((n, r) => n + r.requests, 0),
  graphqlRequests: results.reduce((n, r) => n + r.graphql, 0),
};
writeFileSync(join(OUT, `perf-${LABEL}.json`), JSON.stringify({ summary, results }, null, 1));
console.log(JSON.stringify(summary, null, 1));
process.exit(summary.viewsWithErrors ? 1 : 0);
