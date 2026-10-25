// Excel import/export checks against the running app (pnpm dev) on the permanent demo store.
// Needs the demo store with the product type "Ropa" (Talla, Color as variant attributes; Material).
// Imported products ("Blusa Excel NN") stay in the demo store as sample data.
//
//   node scripts/e2e-excel.mjs

import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const line of existsSync(join(root, ".env.local"))
  ? readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
  : []) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !env[match[1]]) env[match[1]] = match[2].trim();
}
const APP = env.E2E_APP_URL ?? "http://localhost:3000";
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(
    `${ok ? "ok" : "not ok"} - ${name}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail).slice(0, 400)})`}`,
  );
};

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const { data: session, error: signInError } = await client.auth.signInWithPassword({
  email: "dueno@demo.kshop.test",
  password: env.DEMO_OWNER_PASSWORD,
});
if (signInError) throw signInError;
const token = session.session.access_token;
const { data: store } = await service.from("stores").select("id").eq("slug", "demo").single();
const { data: type } = await service
  .from("product_types")
  .select("id")
  .eq("store_id", store.id)
  .eq("slug", "ropa")
  .single();
const base = `${APP}/api/v1/stores/${store.id}/catalog`;
const auth = { Authorization: `Bearer ${token}` };

async function download(path) {
  const res = await fetch(`${base}/excel/${path}?productTypeId=${type.id}`, { headers: auth });
  const wb = new ExcelJS.Workbook();
  if (res.ok) await wb.xlsx.load(await res.arrayBuffer());
  return { status: res.status, wb, disposition: res.headers.get("content-disposition") };
}

async function upload(wb, name) {
  const key = `stores/${store.id}/imports/${crypto.randomUUID()}-${name}`;
  const userStorage = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
    global: { headers: auth },
  }).storage;
  const { error } = await userStorage
    .from("store-imports")
    .upload(key, Buffer.from(await wb.xlsx.writeBuffer()), {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  if (error) throw error;
  return key;
}

async function importFile(wb, name, mode) {
  const fileKey = await upload(wb, name);
  const res = await fetch(`${base}/imports`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ fileKey, fileName: name, productTypeId: type.id, mode, createMissing: true }),
  });
  return { status: res.status, body: await res.json() };
}

async function runAll(jobId) {
  let last;
  for (let i = 0; i < 50; i++) {
    const res = await fetch(`${base}/imports/${jobId}/run`, { method: "POST", headers: auth });
    last = await res.json();
    if (!res.ok || last.done) break;
  }
  return last;
}

// 1. Template
const template = await download("template");
const headers = template.wb.getWorksheet("Productos").getRow(1).values.filter(Boolean);
check(
  "template downloads as xlsx",
  template.status === 200 && /plantilla-ropa\.xlsx/.test(template.disposition ?? ""),
  template.status,
);
check(
  "template has fixed and attribute columns",
  ["Código producto", "SKU", "Talla", "Color", "Material", "Moneda costo"].every((h) => headers.includes(h)),
  headers,
);
check(
  "template has a dropdown on Categoría",
  !!template.wb.getWorksheet("Productos").getCell("D2").dataValidation?.formulae,
  null,
);

// 2. Fill 20 products x 3 variants, with a new category and a new color, and 2 broken rows.
const sheet = template.wb.getWorksheet("Productos");
const col = Object.fromEntries(
  sheet
    .getRow(1)
    .values.map((h, i) => [h, i])
    .filter(([h]) => h),
);
const run = Date.now().toString(36).slice(-4).toUpperCase();
let row = 2;
for (let p = 1; p <= 20; p++) {
  const code = `BLX${run}${String(p).padStart(2, "0")}`;
  ["S", "M", "L"].forEach((talla, v) => {
    const r = sheet.getRow(row++);
    if (v === 0) {
      r.getCell(col["Nombre"]).value = `Blusa Excel ${String(p).padStart(2, "0")} ${run}`;
      r.getCell(col["Categoría"]).value = "Mujer > Blusas";
      r.getCell(col["Marca"]).value = "Kaya";
      r.getCell(col["Estado"]).value = "Publicado";
      r.getCell(col["Material"]).value = "Lino";
      r.getCell(col["Etiquetas"]).value = "excel, verano";
    }
    r.getCell(col["Código producto"]).value = code;
    r.getCell(col["SKU"]).value = `${code}-${talla}`;
    r.getCell(col["Talla"]).value = talla;
    r.getCell(col["Color"]).value = p % 2 ? "Azul" : "Rojo";
    r.getCell(col["Precio"]).value = 1200 + p * 10;
    r.getCell(col["Costo"]).value = 2.5;
    r.getCell(col["Moneda costo"]).value = "USD";
    r.getCell(col["Stock"]).value = 4;
  });
}
// Broken: product 19 bad price, product 20 missing SKU on one row.
sheet.getRow(2 + 18 * 3).getCell(col["Precio"]).value = "abc";
sheet.getRow(2 + 19 * 3 + 1).getCell(col["SKU"]).value = null;

// The demo store keeps data between runs: only what does not exist yet must be listed as new.
const { count: hadBlusas } = await service
  .from("categories")
  .select("id", { count: "exact", head: true })
  .eq("store_id", store.id)
  .eq("name", "Blusas");
const { count: hadAzul } = await service
  .from("attribute_values")
  .select("id", { count: "exact", head: true })
  .eq("store_id", store.id)
  .eq("name", "Azul");
const first = await importFile(template.wb, "blusas.xlsx", "create_only");
const pv = first.body;
check("preview -> 201", first.status === 201, first.body);
check("preview: 18 to create, 2 skipped", pv.products?.create === 18 && pv.products?.skip === 2, pv.products);
check(
  "preview: errors reported per row",
  pv.errorRows?.length === 2 && pv.errorRows.every((e) => e.errors.length > 0),
  pv.errorRows,
);
check(
  "preview: missing category and color value are listed to create",
  pv.toCreate?.categories.includes("Mujer > Blusas") === !hadBlusas &&
    pv.toCreate?.values.includes("Color: Azul") === !hadAzul,
  pv.toCreate,
);

const done = await runAll(pv.jobId);
check("run: 18 products created", done?.done && done.created === 18, done);
const { data: imported } = await service
  .from("products")
  .select("id, name, status, min_price, in_stock, category_id")
  .eq("store_id", store.id)
  .like("name", `% ${run}`);
check(
  "18 products in the store, published, in stock",
  imported?.length === 18 && imported.every((p) => p.status === "published" && p.in_stock),
  imported?.length,
);
const { data: blusas } = await service
  .from("categories")
  .select("id, parent_id")
  .eq("store_id", store.id)
  .eq("name", "Blusas")
  .single();
check(
  "category Mujer > Blusas created under Mujer",
  !!blusas?.parent_id && imported.every((p) => p.category_id === blusas.id),
  blusas,
);
const { count: moves } = await service
  .from("stock_movements")
  .select("id", { count: "exact", head: true })
  .eq("import_job_id", pv.jobId);
check("initial stock movements carry the job id", moves === 54, moves);

// 3. Fix the 2 broken products and import them alone.
const fix = new ExcelJS.Workbook();
await fix.xlsx.load(await template.wb.xlsx.writeBuffer());
const fixSheet = fix.getWorksheet("Productos");
fixSheet.getRow(2 + 18 * 3).getCell(col["Precio"]).value = 1390;
fixSheet.getRow(2 + 19 * 3 + 1).getCell(col["SKU"]).value = `BLX${run}20-M`;
const second = await importFile(fix, "blusas-corregido.xlsx", "create_only");
check(
  "re-import create_only: 2 new, 18 existing skipped",
  second.body.products?.create === 2 && second.body.products?.skip === 18,
  second.body.products,
);
const done2 = await runAll(second.body.jobId);
check("run: 2 created", done2?.created === 2, done2);

// 4. Export, change price and stock, re-import as update.
const exported = await download("export");
const exSheet = exported.wb.getWorksheet("Productos");
const exCol = Object.fromEntries(
  exSheet
    .getRow(1)
    .values.map((h, i) => [h, i])
    .filter(([h]) => h),
);
let target;
exSheet.eachRow((r, n) => {
  if (n > 1 && r.getCell(exCol["SKU"]).text === `BLX${run}01-S`) target = r;
});
check("export contains the imported SKUs", !!target, null);
target.getCell(exCol["Precio"]).value = 999;
target.getCell(exCol["Stock"]).value = 11;
const third = await importFile(exported.wb, "productos.xlsx", "upsert");
check(
  "upsert preview: updates, no errors",
  third.body.products?.update >= 20 && third.body.errorRows?.length === 0,
  third.body.products ?? third.body,
);
const done3 = await runAll(third.body.jobId);
check("run upsert: products updated", done3?.updated >= 20, done3);
const { data: variant } = await service
  .from("product_variants")
  .select("id, price, stock_available")
  .eq("store_id", store.id)
  .eq("sku", `BLX${run}01-S`)
  .single();
check(
  "price and stock updated from the Excel",
  Number(variant.price) === 999 && variant.stock_available === 11,
  variant,
);
const { data: mv } = await service
  .from("stock_movements")
  .select("quantity, type")
  .eq("variant_id", variant.id)
  .eq("import_job_id", third.body.jobId);
check(
  "stock change recorded as import movement (+7)",
  mv?.length === 1 && mv[0].quantity === 7 && mv[0].type === "import",
  mv,
);

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
