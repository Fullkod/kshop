// Mobile survey of the web (pnpm dev running, pnpm demo:seed done): every admin view of the Tienda Demo as the owner,
// the storefront as a guest and the superadmin, at 390 px with touch, as a phone opens the web in its browser. For each
// page it records what hurts on a phone: horizontal overflow and who causes it, tap targets under 40 px, fields under
// 16 px (iOS zooms into them), tables without a scroll container, text under 12 px, subpages without a way back, and
// how long the page is. Report in .titan/qa/mobile-web/report.json, a screenshot per page. Read only, except a
// temporary superadmin (deleted at the end).
//
//   pnpm qa:mobile   (QA_BASE_URL, QA_PLATFORM_URL for another port; QA_PAGES=admin,store,super and QA_VIEWS=catalog,orders/new for some)

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !env[match[1]]) env[match[1]] = match[2].trim();
}

const port = new URL(env.QA_BASE_URL ?? "http://localhost:3000").port || 3000;
const STORE = `http://demo.kshop.localhost:${port}`;
const PLATFORM = env.QA_PLATFORM_URL ?? `http://kshop.localhost:${port}`;
const OUT = join(root, ".titan/qa/mobile-web");
const SUPER = { email: "qa-mobile-super@e2e.kshop.test", password: "qa-mobile-super-2026" };
const groups = (env.QA_PAGES ?? "admin,store,super").split(",");
const onlyViews = env.QA_VIEWS?.split(",").map((v) => v.trim());
const wanted = (views) =>
  onlyViews
    ? views.filter((v) => onlyViews.includes(v || "home") || onlyViews.some((o) => o && v.startsWith(o)))
    : views;
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

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const storageKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

const { data: store } = await service.from("stores").select("id").eq("slug", "demo").single();
const pick = async (table, columns, extra = (q) => q) =>
  (await extra(service.from(table).select(columns).eq("store_id", store.id)).limit(1).maybeSingle()).data;
const order = await pick("orders", "id", (q) => q.order("created_at", { ascending: false }));
const product = await pick("products", "id, slug", (q) => q.order("created_at", { ascending: false }));
const category = await pick("categories", "id, slug");
const { data: superStore } = await service.from("stores").select("id").eq("slug", "demo").single();

const ADMIN_VIEWS = [
  "",
  "orders",
  order && `orders/${order.id}`,
  "orders/new",
  "orders/customers",
  "orders/payment-methods",
  "sales-today",
  "catalog",
  product && `catalog/products/${product.id}`,
  "catalog/products/new",
  "catalog/categories",
  "catalog/attributes",
  "catalog/brands",
  "catalog/collections",
  "catalog/warehouses",
  "excel-import",
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
  "pos",
].filter((v) => v !== null && v !== undefined);
const STORE_VIEWS = [
  "",
  "products",
  "categories",
  category && `category/${category.slug}`,
  product && `product/${product.slug}`,
  "search?q=blusa",
  "cart",
  "checkout",
  "favorites",
  "account/login",
  "account/register",
  "app",
].filter((v) => v !== null && v !== undefined);
const SUPER_VIEWS = [
  "",
  "stores/new",
  `stores/${superStore.id}`,
  "billing",
  "plans",
  "apps",
  "whatsapp",
  "domains",
];

/** What a phone would suffer on this page. */
function audit() {
  const vw = window.innerWidth;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const describe = (el) => {
    const text = (el.getAttribute("aria-label") ?? el.textContent ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40);
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 4).join(" ") : "";
    const id = el.getAttribute("data-testid") ?? el.id;
    return `${el.tagName.toLowerCase()}${id ? `#${id}` : ""}${cls ? `.${cls}` : ""}${text ? ` «${text}»` : ""}`;
  };
  const all = [...document.body.querySelectorAll("*")].filter(visible);

  // Who sticks out on the right: the outermost ones, so one wide table counts once.
  const wide = all.filter((el) => el.getBoundingClientRect().right > vw + 1);
  const overflow = wide
    .filter((el) => !wide.some((o) => o !== el && o.contains(el)))
    .slice(0, 6)
    .map(describe);

  const targets = all.filter(
    (el) =>
      !el.classList.contains("sr-only") &&
      el.matches(
        "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=checkbox], [role=switch], label > input",
      ),
  );
  const small = targets.filter((el) => {
    const r = el.getBoundingClientRect();
    if (el.matches('input[type="checkbox"], input[type="radio"]')) return r.height < 24 || r.width < 24;
    // Scaled-down content (the theme preview) is not something to tap; a narrow field is fine when it is tall.
    if (r.height < 12) return false;
    if (el.matches("input, select, textarea")) return r.height < 40;
    // A text link whose ::after widens the tap area (styles.css, touch): 8 px above and below, 32 px in all.
    if (el.tagName === "A" && getComputedStyle(el, "::after").position === "absolute" && r.height + 16 >= 32)
      return false;
    // Inline links inside a paragraph are read, not aimed at; still listed if tiny.
    const inline = el.tagName === "A" && el.closest("p, li, td, span") && r.height < 40;
    // A button with a word in it is wide enough: only the icon-only ones are judged by their width too.
    const narrow = r.width < 40 && !(el.textContent ?? "").trim();
    return (r.height < 40 || narrow) && !(inline && r.height >= 20);
  });
  const smallSamples = small.slice(0, 8).map((el) => {
    const r = el.getBoundingClientRect();
    return `${Math.round(r.width)}×${Math.round(r.height)} ${describe(el)}`;
  });

  const fields = all.filter((el) =>
    el.matches(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea",
    ),
  );
  const zoomFields = fields.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16);

  const tables = [...document.querySelectorAll("table")].filter(visible).map((t) => {
    let scroller = null;
    for (let p = t.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll") {
        scroller = p;
        break;
      }
    }
    return {
      width: Math.round(t.getBoundingClientRect().width),
      scrollable: !!scroller,
      columns: t.querySelectorAll("thead th").length,
    };
  });

  const tiny = all.filter((el) => {
    if (!el.matches("p, span, a, li, td, th, label, button, div, h1, h2, h3, h4, small, strong, em, time"))
      return false;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
    return parseFloat(getComputedStyle(el).fontSize) < 12;
  });

  // A way back: the «Volver» of the top bar on a phone, or a link in the page.
  const backs = [...document.querySelectorAll("a, button")].filter(
    (el) =>
      visible(el) &&
      /volver|atrás|←/i.test((el.getAttribute("aria-label") ?? "") + " " + (el.textContent ?? "")),
  );
  const sticky = all.filter((el) => {
    const cs = getComputedStyle(el);
    return (
      (cs.position === "fixed" || cs.position === "sticky") &&
      el.getBoundingClientRect().bottom >= window.innerHeight - 2 &&
      el.getBoundingClientRect().height < 200
    );
  });
  const h1 = document.querySelector("main h1, h1");
  return {
    title: h1?.textContent?.trim().slice(0, 60) ?? null,
    scrollWidth: document.documentElement.scrollWidth,
    vw,
    overflow,
    targets: targets.length,
    small: small.length,
    smallSamples,
    fields: fields.length,
    zoomFields: zoomFields.length,
    zoomSamples: zoomFields.slice(0, 4).map(describe),
    tables,
    tiny: tiny.length,
    tinySamples: tiny.slice(0, 4).map(describe),
    back: backs.map(describe),
    bottomBar: sticky.length,
    height: document.documentElement.scrollHeight,
    buttons: [...document.querySelectorAll("main button")].filter(visible).length,
    sections: [...document.querySelectorAll("main h2")].filter(visible).length,
  };
}

const phone = devices["iPhone 13"];
const browser = await chromium.launch({ executablePath: chromiumPath() });
const report = [];

async function survey(group, base, views, session) {
  const context = await browser.newContext({ ...phone, viewport: { width: 390, height: 844 }, locale: "es" });
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
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  for (const view of wanted(views)) {
    const url = `${base}/${view}`;
    const started = Date.now();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      // Loading states settle; the admin reads a few things after the boot.
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(800);
      const data = await page.evaluate(audit);
      const name = `${group}-${(view || "home").replace(/[/?=]/g, "_").slice(0, 50)}`;
      await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
      report.push({
        group,
        view: view || "/",
        url: page.url().replace(base, ""),
        ms: Date.now() - started,
        ...data,
        errors: errors.splice(0),
      });
      const flags = [
        data.scrollWidth > data.vw && `overflow ${data.scrollWidth}`,
        data.small && `small ${data.small}/${data.targets}`,
        data.zoomFields && `zoom ${data.zoomFields}/${data.fields}`,
        data.tables.some((t) => !t.scrollable && t.width > data.vw) && "table",
        data.tiny && `tiny ${data.tiny}`,
        view.includes("/") && !data.back.length && "no-back",
      ].filter(Boolean);
      console.log(`${group} /${view || ""} — ${flags.join(", ") || "ok"}`);
    } catch (error) {
      report.push({ group, view: view || "/", failed: String(error).slice(0, 200) });
      console.log(`${group} /${view || ""} — FAILED ${String(error).slice(0, 120)}`);
    }
  }
  await context.close();
}

try {
  if (groups.includes("admin")) {
    const { data, error } = await anon.auth.signInWithPassword({
      email: "dueno@demo.kshop.test",
      password: env.DEMO_OWNER_PASSWORD,
    });
    if (error) throw error;
    await survey("admin", `${STORE}/admin`, ADMIN_VIEWS, data.session);
  }
  if (groups.includes("store")) await survey("store", STORE, STORE_VIEWS, null);
  if (groups.includes("super")) {
    const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users?.users ?? [])
      if (u.email === SUPER.email) await service.auth.admin.deleteUser(u.id);
    await service.auth.admin.createUser({
      email: SUPER.email,
      password: SUPER.password,
      email_confirm: true,
      app_metadata: { role: "superadmin" },
    });
    const { data, error } = await anon.auth.signInWithPassword(SUPER);
    if (error) throw error;
    await survey("super", `${PLATFORM}/superadmin`, SUPER_VIEWS, data.session);
  }
} finally {
  await browser.close();
  const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users?.users ?? []) if (u.email === SUPER.email) await service.auth.admin.deleteUser(u.id);
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
}

const bad = report.filter((r) => r.failed || r.scrollWidth > r.vw || r.small || r.zoomFields || r.tiny);
console.log(
  `\n${report.length} pages, ${bad.length} with something to fix. Report: .titan/qa/mobile-web/report.json`,
);
