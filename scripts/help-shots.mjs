// KSH0005: the help screenshots. Opens every spec of packages/admin/src/help/content/screenshots.ts in the Tienda Demo
// (as the owner) or the superadmin panel (temporary superadmin), runs its setup step and saves
// apps/web/public/help/screens/<slug>.png. Fails if a spec has a setup this script does not know or a shot fails.
// Needs pnpm dev against the test project (db-env); QA_BASE_URL / QA_PLATFORM_URL for another port.
//
//   pnpm help:shots                 every screenshot
//   pnpm help:shots order-new team  only those

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const line of existsSync(join(root, ".env.local"))
  ? readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
  : []) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !env[match[1]]) env[match[1]] = match[2].trim();
}

// Node strips the types of the .ts file (it only has `import type`).
const { screenshots } = await import(
  pathToFileURL(join(root, "packages/admin/src/help/content/screenshots.ts")).href
);

const PORT = new URL(env.QA_BASE_URL ?? "http://localhost:3000").port || "3000";
const STORE_URL = `http://demo.kshop.localhost:${PORT}`;
const PLATFORM_URL = env.QA_PLATFORM_URL ?? `http://kshop.localhost:${PORT}`;
const OUT = join(root, "apps/web/public/help/screens");
const ROOT_EMAIL = "help-shots-root@e2e.kshop.test";
const ROOT_PASSWORD = randomBytes(12).toString("base64url");
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

/** The setup step of each spec that declares one (its prose `setup` says the same for the reviewer). */
const SETUP = {
  "product-editor": async (page) => {
    await page.locator("table").first().scrollIntoViewIfNeeded();
  },
  "order-new": async (page) => {
    await page.getByLabel("Buscar productos").fill(searchWord);
    await page.getByRole("button", { name: "Añadir", exact: true }).first().click();
  },
  "pos-sell-mobile": async (page) => {
    // Adding clears the search: search again for the second unit.
    for (let i = 0; i < 2; i++) {
      await page.getByTestId("pos-search").fill(searchWord);
      await page.getByTestId("pos-results").locator("button").first().click();
    }
  },
  "order-detail": async (page) => {
    await page.getByText("Cliente", { exact: true }).first().waitFor();
    await page.evaluate(
      ([name, phone]) => {
        const formatted = (p) => p.replace(/^\+53(\d)(\d{3})(\d{4})$/, "+53 $1 $2 $3");
        const swap = {
          [name]: "Laura Pérez",
          [phone]: "+53 5 123 4567",
          [formatted(phone)]: "+53 5 123 4567",
        };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = n.textContent?.trim() ?? "";
          if (swap[text]) n.textContent = n.textContent.replace(text, swap[text]);
          // Addresses of the test scripts («Calle QA 4…»).
          else if (/\bQA\b/.test(text)) n.textContent = "Calle 10 #45";
        }
      },
      [order.customer_name, order.customer_phone],
    );
  },
  "orders-list": async (page) => {
    // Test customers («test», «QA …») shown as a sample one, avatar initial included.
    await page.evaluate(() => {
      const walker = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim() ?? "";
        if (/^(test|qa\b.*|e2e\b.*|prueba\b.*)$/i.test(text)) n.textContent = "Laura Pérez";
        else if (/^[TQEP]$/.test(text)) n.textContent = "L";
      }
    });
  },
  team: async (page) => {
    await page.getByRole("button", { name: "Invitar persona" }).click();
    await page.locator("dialog[open]").waitFor();
  },
};

const only = process.argv.slice(2);
const specs = screenshots.filter((s) => only.length === 0 || only.includes(s.slug));
const unknown = specs.filter((s) => s.setup?.length && !SETUP[s.slug]);
if (unknown.length) throw new Error(`No setup step for: ${unknown.map((s) => s.slug).join(", ")}`);
if (only.length && specs.length !== only.length) throw new Error(`Unknown screenshot in: ${only.join(", ")}`);

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const storageKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

async function sessionOf(email, password) {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (!error) return data.session;
    if (!/rate limit/i.test(error.message) || attempt === 6) throw new Error(`${email}: ${error.message}`);
    console.log(`# ${email}: sign-in rate limit, waiting 60 s`);
    await new Promise((r) => setTimeout(r, 60000));
  }
}

async function removeRoot() {
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) if (u.email === ROOT_EMAIL) await service.auth.admin.deleteUser(u.id);
}

// Ids for the routes with :product / :order.
const { data: demo, error: demoError } = await service
  .from("stores")
  .select("id")
  .eq("slug", "demo")
  .single();
if (demoError) throw demoError;
const { data: product } = await service
  .from("products")
  .select("id, name, product_types!inner(has_variants)")
  .eq("store_id", demo.id)
  .eq("status", "published")
  .eq("product_types.has_variants", true)
  // Not the leftovers of the e2e/QA scripts: the guides show a real-looking catalog.
  .not("name", "ilike", "%excel%")
  .not("name", "ilike", "%qa%")
  .not("name", "ilike", "%e2e%")
  .order("created_at", { ascending: true })
  .limit(1)
  .maybeSingle();
// An open order without test products, preferably still to confirm (the guide explains its buttons). Its customer is
// shown as a sample one: the Demo's orders come from test scripts whose phones are real.
const { data: orders } = await service
  .from("orders")
  .select("id, status, customer_name, customer_phone, order_lines(product_name)")
  .eq("store_id", demo.id)
  .neq("channel", "pos")
  .neq("status", "cancelled")
  .order("created_at", { ascending: false })
  .limit(200);
const junk = /\b(qa|e2e|test|prueba|excel)\b/i;
const clean = (orders ?? []).filter(
  (o) => o.order_lines.length > 0 && o.order_lines.every((l) => !junk.test(l.product_name)),
);
const order = clean.find((o) => o.status === "pending_confirmation") ?? clean[0];
const ids = { product: product?.id, order: order?.id };
// A word of that product's name finds it in Nuevo pedido and in the Caja.
const searchWord = (product?.name ?? "").split(/\s+/).find((w) => w.length >= 3) ?? "a";

const browser = await chromium.launch({ executablePath: chromiumPath() });
const contexts = new Map();

/** One context per (session, viewport): reusing it keeps one refresh-token chain per user. */
async function pageFor(kind, viewport) {
  const key = `${kind}-${viewport}`;
  if (contexts.has(key)) return contexts.get(key);
  const phone = viewport === "mobile";
  const session =
    kind === "superadmin"
      ? await sessionOf(ROOT_EMAIL, ROOT_PASSWORD)
      : await sessionOf(env.DEMO_OWNER_EMAIL ?? "dueno@demo.kshop.test", env.DEMO_OWNER_PASSWORD);
  const context = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
    colorScheme: "light",
  });
  await context.addInitScript(
    ([k, v]) => {
      try {
        if (!localStorage.getItem(k)) localStorage.setItem(k, v);
        localStorage.setItem("kshop-theme", "light");
      } catch {
        // storage blocked: the shot shows the login and the check below fails
      }
    },
    [storageKey, JSON.stringify(session)],
  );
  const page = await context.newPage();
  contexts.set(key, page);
  return page;
}

let failed = 0;
try {
  if (specs.some((s) => s.route.startsWith("/superadmin"))) {
    await removeRoot();
    const { error } = await service.auth.admin.createUser({
      email: ROOT_EMAIL,
      password: ROOT_PASSWORD,
      email_confirm: true,
      app_metadata: { role: "superadmin" },
    });
    if (error) throw error;
  }
  for (const spec of specs) {
    const superadmin = spec.route.startsWith("/superadmin");
    const route = spec.route.replace(/:(\w+)/g, (_, name) => {
      if (!ids[name]) throw new Error(`${spec.slug}: the Tienda Demo has no ${name} for ${spec.route}`);
      return ids[name];
    });
    try {
      const page = await pageFor(superadmin ? "superadmin" : "owner", spec.viewport);
      await page.goto(`${superadmin ? PLATFORM_URL : STORE_URL}${route}`);
      // The «?» is in every admin and superadmin header: the shell (and the session) is up.
      await page.getByTestId("help-button").first().waitFor({ timeout: 60000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      if (
        await page
          .getByText("Cargando…")
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await page.getByText("Cargando…").first().waitFor({ state: "hidden", timeout: 30000 });
      }
      await SETUP[spec.slug]?.(page);
      // Without Next's dev badge; the screenshot is what a store owner sees.
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(OUT, `${spec.slug}.png`) });
      console.log(`ok - ${spec.slug}`);
    } catch (error) {
      failed++;
      console.log(`not ok - ${spec.slug} (${String(error).split("\n")[0].slice(0, 200)})`);
    }
  }
} finally {
  await removeRoot().catch(() => {});
  await browser.close();
}

console.log(`\n${specs.length - failed}/${specs.length} screenshots in apps/web/public/help/screens/`);
process.exit(failed ? 1 : 0);
