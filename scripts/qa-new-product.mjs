// QA in the browser (Tienda Demo, owner, 390 px): two products in a row from «Nuevo producto» (bug of 2026-11-03).
// After saving, the new product must load (no «No se pudo cargar el producto.», no admin_product call with Next's
// %%drp: placeholder instead of the id) and the topbar «+» must open «Nuevo producto» empty. Deletes what it creates.
// Only a production build shows the placeholder: build and start one against the test database with
// NEXT_PUBLIC_PLATFORM_DOMAIN=kshop.localhost:<port>. Screenshots in .titan/qa/nuevo-producto/.
//
//   QA_BASE_URL=http://localhost:3300 pnpm qa:new-product

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
const PORT = new URL(env.QA_BASE_URL ?? "http://localhost:3000").port || "3000";
const BASE = `http://demo.kshop.localhost:${PORT}`;
const OUT = join(root, ".titan/qa/nuevo-producto");
mkdirSync(OUT, { recursive: true });

function chromiumPath() {
  if (env.QA_CHROMIUM_PATH) return env.QA_CHROMIUM_PATH;
  const cache = join(env.LOCALAPPDATA ?? "", "ms-playwright");
  const dirs = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d));
  dirs.sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const dir of dirs)
    if (existsSync(join(cache, dir, "chrome-win64/chrome.exe")))
      return join(cache, dir, "chrome-win64/chrome.exe");
  throw new Error("No Chromium");
}

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(
    `${ok ? "ok" : "not ok"} - ${name}${ok || detail === undefined ? "" : ` (${String(detail).slice(0, 300)})`}`,
  );
};

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const { data: signIn, error } = await anon.auth.signInWithPassword({
  email: env.DEMO_OWNER_EMAIL ?? "dueno@demo.kshop.test",
  password: env.DEMO_OWNER_PASSWORD,
});
if (error) throw error;
const storageKey = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

const browser = await chromium.launch({ executablePath: chromiumPath() });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
await context.addInitScript(
  ([k, v]) => localStorage.setItem(k, v),
  [storageKey, JSON.stringify(signIn.session)],
);
const page = await context.newPage();
const badParams = [];
page.on("request", (r) => {
  if (r.url().includes("/rpc/admin_product") && (r.postData() ?? "").includes("%%drp:"))
    badParams.push(r.postData());
});

const stamp = Date.now();
const created = [];
try {
  await page.goto(`${BASE}/admin/catalog`);
  for (const [i, name] of [`QA alta ${stamp} uno`, `QA alta ${stamp} dos`].entries()) {
    await page.locator(`a[href$="/admin/catalog/products/new"]`).first().click();
    await page.waitForURL(/\/admin\/catalog\/products\/new$/, { timeout: 30000 });
    await page.getByRole("heading", { name: "Nuevo producto" }).waitFor({ timeout: 30000 });
    const nameField = page.getByLabel("Nombre", { exact: true });
    await nameField.waitFor({ timeout: 30000 });
    check(
      `«Nuevo producto» opens empty (${i + 1})`,
      (await nameField.inputValue()) === "",
      await nameField.inputValue(),
    );
    await nameField.fill(name);
    await page
      .getByLabel(/^Precio/)
      .first()
      .fill("100");
    await page.getByRole("button", { name: "Guardar" }).click();
    // Roberto (2026-11-07): saving goes back to the list, where the new product shows.
    await page.waitForURL(/\/admin\/catalog$/, { timeout: 30000 });
    const { data: row } = await service.from("products").select("id").eq("name", name).maybeSingle();
    if (row) created.push(row.id);
    const listed = await page
      .getByText(name)
      .first()
      .waitFor({ timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    check(`saving goes back to the list and the new product is there (${i + 1})`, !!row && listed);
    await page.screenshot({ path: join(OUT, `alta-${i + 1}.png`) });
    // The next round opens «Nuevo producto» from the topbar «+»: a client navigation, so the hidden page comes back.
  }
  check("no admin_product call with a %%drp: placeholder", badParams.length === 0, badParams[0]);
} finally {
  if (created.length) await service.from("products").delete().in("id", created);
  await browser.close();
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
