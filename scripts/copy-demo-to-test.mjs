// Copies the Tienda Demo of production (read only) into the test project ("KShop Test"), so development and the
// read comparators run on realistic data (R11). Same store id; owner and staff mapped to the test accounts by e-mail
// (run `pnpm demo:seed` first); customers are not copied (their orders become guest orders). Triggers and FKs are off
// while loading (session_replication_role = replica), so derived columns arrive exactly as in production.
//   node scripts/copy-demo-to-test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const PROD = env.SUPABASE_PROJECT_REF;
const TEST = env.SUPABASE_TEST_PROJECT_REF;
if (!PROD || !TEST || PROD === TEST) {
  console.error(
    "copy-demo-to-test: needs SUPABASE_PROJECT_REF and a different SUPABASE_TEST_PROJECT_REF in .env.local",
  );
  process.exit(1);
}

async function query(ref, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`${ref}: ${res.status} ${await res.text()}`);
  return res.json();
}
const prod = (sql) => query(PROD, sql);
const test = (sql) => query(TEST, sql);

// Rows tied to customer accounts or to running jobs stay behind.
const SKIP = new Set([
  "customers",
  "customer_addresses",
  "customer_favorites",
  "carts",
  "cart_lines",
  "voucher_usages",
  "import_jobs",
  "import_job_rows",
  "inventory_reservations",
]);

const [{ id: storeId }] = await prod("select id from public.stores where slug = 'demo'");
const members =
  await prod(`select m.user_id, u.email from public.store_members m join auth.users u on u.id = m.user_id
  where m.store_id = '${storeId}'`);
const testUsers = await test("select id, email from auth.users");
const userMap = new Map();
for (const m of members) {
  const t = testUsers.find((u) => u.email === m.email);
  if (t) userMap.set(m.user_id, t.id);
}
console.log("store", storeId, "members mapped", userMap.size, "of", members.length);

const tables = await test(`
  select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'store_id' and not a.attisdropped
  where n.nspname = 'public' and c.relkind = 'r' order by 1`);
const userCols = await test(`
  select c.relname as t, a.attname as col, a.attnotnull as notnull from pg_constraint k
  join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
  where n.nspname = 'public' and k.contype = 'f' and k.confrelid = 'auth.users'::regclass`);
const columns = await test(`
  select c.relname as t, string_agg(format('%I', a.attname), ', ' order by a.attnum) as list
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
  where n.nspname = 'public' and c.relkind = 'r' group by 1`);
const listOf = new Map(columns.map((c) => [c.t, c.list]));

// The Management API takes a limited body: the load goes table by table, in chunks, each in its own transaction (a
// half-done run is fixed by running it again: it starts by removing the Demo).
const replica = (sql) => test(`begin; set local session_replication_role = replica;\n${sql}\ncommit;`);
const deletes = [];
const seeded = await test(`select id from public.stores where slug = 'demo' or id = '${storeId}'`);
for (const s of seeded) {
  for (const { t } of tables) deletes.push(`delete from public.${t} where store_id = '${s.id}';`);
  deletes.push(`delete from public.stores where id = '${s.id}';`);
}
if (deletes.length) await replica(deletes.join("\n"));
const counts = [];
for (const t of ["stores", ...tables.map((x) => x.t)]) {
  if (SKIP.has(t)) continue;
  const where = t === "stores" ? `id = '${storeId}'` : `store_id = '${storeId}'`;
  const [{ rows }] = await prod(
    `select coalesce(json_agg(x), '[]'::json) as rows from public.${t} x where ${where}`,
  );
  if (!rows.length) continue;
  for (const row of rows) {
    for (const { col, notnull } of userCols.filter((u) => u.t === t)) {
      if (row[col] == null) continue;
      row[col] = userMap.get(row[col]) ?? (notnull ? "__drop__" : null);
    }
    if (t === "orders") row.customer_id = null;
  }
  const kept = rows.filter((r) => !Object.values(r).includes("__drop__"));
  const list = listOf.get(t);
  for (let i = 0; i < kept.length; i += 150) {
    const chunk = JSON.stringify(kept.slice(i, i + 150));
    await replica(
      `insert into public.${t} (${list}) select ${list} from json_populate_recordset(null::public.${t}, $json$${chunk}$json$::json);`,
    );
  }
  counts.push(`${t} ${kept.length}`);
}
console.log(counts.join(" · "));
console.log("done");
