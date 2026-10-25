// Load check of the Excel import against the running app (pnpm dev) on the permanent demo store:
// 1 000 rows (250 products x 4 variants) must preview and import with every request well under the
// serverless time limit. The products it creates are deleted at the end.
//
//   node scripts/e2e-excel-load.mjs

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
/** Seconds any single request may take (Vercel functions are cut at 60-300 s depending on the plan). */
const MAX_REQUEST_SECONDS = 60;
const PRODUCTS = 250;
const COMBOS = [
  ["S", "Rojo"],
  ["M", "Rojo"],
  ["L", "Rojo"],
  ["S", "Negro"],
];

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
const seconds = (start) => Math.round((performance.now() - start) / 100) / 10;

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const { data: session, error: signInError } = await client.auth.signInWithPassword({
  email: "dueno@demo.kshop.test",
  password: env.DEMO_OWNER_PASSWORD,
});
if (signInError) throw signInError;
const auth = { Authorization: `Bearer ${session.session.access_token}` };
const { data: store } = await service.from("stores").select("id").eq("slug", "demo").single();
const { data: type } = await service
  .from("product_types")
  .select("id")
  .eq("store_id", store.id)
  .eq("slug", "ropa")
  .single();
const base = `${APP}/api/v1/stores/${store.id}/catalog`;

// Build the 1 000-row file from the real template.
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(
  await (await fetch(`${base}/excel/template?productTypeId=${type.id}`, { headers: auth })).arrayBuffer(),
);
const sheet = wb.getWorksheet("Productos");
const col = Object.fromEntries(
  sheet
    .getRow(1)
    .values.map((h, i) => [h, i])
    .filter(([h]) => h),
);
const run = Date.now().toString(36).slice(-4).toUpperCase();
const prefix = `LOAD${run}`;
let row = 2;
for (let p = 1; p <= PRODUCTS; p++) {
  const code = `${prefix}${String(p).padStart(3, "0")}`;
  COMBOS.forEach(([talla, color], i) => {
    const r = sheet.getRow(row++);
    if (i === 0) {
      r.getCell(col["Nombre"]).value = `Carga ${run} ${p}`;
      r.getCell(col["Categoría"]).value = "Mujer > Blusas";
      r.getCell(col["Marca"]).value = "Kaya";
      r.getCell(col["Estado"]).value = "Borrador";
      r.getCell(col["Material"]).value = "Algodón";
    }
    r.getCell(col["Código producto"]).value = code;
    r.getCell(col["SKU"]).value = `${code}-${talla}-${color.slice(0, 3).toUpperCase()}`;
    r.getCell(col["Talla"]).value = talla;
    r.getCell(col["Color"]).value = color;
    r.getCell(col["Precio"]).value = 1000 + p;
    r.getCell(col["Costo"]).value = 2;
    r.getCell(col["Moneda costo"]).value = "USD";
    r.getCell(col["Stock"]).value = 5;
  });
}
const buffer = Buffer.from(await wb.xlsx.writeBuffer());
console.log(`# ${row - 2} rows, ${(buffer.length / 1024).toFixed(0)} KB`);

try {
  const fileKey = `stores/${store.id}/imports/${crypto.randomUUID()}-carga.xlsx`;
  const userStorage = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
    global: { headers: auth },
  }).storage;
  const uploaded = await userStorage.from("store-imports").upload(fileKey, buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  if (uploaded.error) throw uploaded.error;

  let start = performance.now();
  const res = await fetch(`${base}/imports`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ fileKey, fileName: "carga.xlsx", productTypeId: type.id, mode: "create_only" }),
  });
  const preview = await res.json();
  const previewTime = seconds(start);
  check(
    `preview of 1 000 rows in ${previewTime} s`,
    res.status === 201 &&
      preview.totalRows === PRODUCTS * COMBOS.length &&
      preview.products.create === PRODUCTS &&
      previewTime < MAX_REQUEST_SECONDS,
    preview.products ?? preview,
  );

  const times = [];
  let last;
  start = performance.now();
  for (let i = 0; i < 100; i++) {
    const t = performance.now();
    const r = await fetch(`${base}/imports/${preview.jobId}/run`, { method: "POST", headers: auth });
    last = await r.json();
    times.push(seconds(t));
    if (!r.ok || last.done) break;
  }
  const total = seconds(start);
  console.log(`# ${times.length} batches: ${times.join(", ")} s (total ${total} s)`);
  check(
    `import of ${PRODUCTS} products, slowest batch ${Math.max(...times)} s`,
    last?.done && last.created === PRODUCTS && Math.max(...times) < MAX_REQUEST_SECONDS,
    last,
  );
  const { count } = await service
    .from("product_variants")
    .select("id", { count: "exact", head: true })
    .eq("store_id", store.id)
    .like("sku", `${prefix}%`);
  check("all 1 000 variants exist", count === PRODUCTS * COMBOS.length, count);
} finally {
  // Clean up: the load products are not demo data.
  const { data: variants } = await service
    .from("product_variants")
    .select("product_id")
    .eq("store_id", store.id)
    .like("sku", `${prefix}%`);
  const ids = [...new Set((variants ?? []).map((v) => v.product_id))];
  for (let i = 0; i < ids.length; i += 100) {
    await service
      .from("products")
      .delete()
      .eq("store_id", store.id)
      .in("id", ids.slice(i, i + 100));
  }
  console.log(`# cleanup: ${ids.length} products deleted`);
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
