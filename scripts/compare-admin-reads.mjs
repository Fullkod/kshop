// R11: the admin's RPC reads (supabase/migrations/20261108100400_admin_reads.sql, 20261108100500_admin_reads_all.sql)
// must return exactly what the pg_graphql queries they replace return. Runs both as the Tienda Demo owner inside a
// read-only transaction and compares them (only endCursor differs: the RPCs use offset cursors).
//   node scripts/db-env.mjs node scripts/compare-admin-reads.mjs
// pg_graphql only exists in the test project (removed from production on 2026-10-28): run this there, after
// `pnpm db:test:migrate` (the default target of scripts/db-env.mjs).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim();
}
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

// The GraphQL documents, straight from packages/data (none of them uses fragments).
const src = ["order", "notification", "catalog", "discount", "content"]
  .map((f) => readFileSync(join(root, `packages/data/src/${f}-queries.ts`), "utf8"))
  .join("\n");
const doc = (name) => src.match(new RegExp(String.raw`graphql\(\`\s*(query ${name}\b[\s\S]*?)\`\)`))[1];

const [{ id: storeId }] = await sql("select id from public.stores where slug = 'demo'");
const [{ id: ownerId }] = await sql("select id from auth.users where email = 'dueno@demo.kshop.test'");
const orders = await sql(
  `select id from public.orders where store_id = '${storeId}' order by created_at desc limit 5`,
);
const [{ id: noticeOrder } = {}] = await sql(
  `select order_id as id from public.notification_log where store_id = '${storeId}' and order_id is not null limit 1`,
);
const [{ name: someName } = {}] = await sql(
  `select substr(customer_name, 1, 3) as name from public.orders where store_id = '${storeId}' limit 1`,
);
const [{ number: someNumber } = {}] = await sql(
  `select number from public.orders where store_id = '${storeId}' order by created_at desc limit 1`,
);
// Products with the most variants, prices, costs and media first (the detail has the most nested reads).
const products = await sql(`select p.id from public.products p where p.store_id = '${storeId}'
  order by (select count(*) from public.product_variants v where v.product_id = p.id) desc, p.id limit 4`);
const [{ word } = {}] = await sql(
  `select lower(split_part(name, ' ', 1)) as word from public.products where store_id = '${storeId}' limit 1`,
);
const [{ id: categoryId } = {}] = await sql(
  `select id from public.categories where store_id = '${storeId}' and parent_id is null limit 1`,
);
const [{ phone, first: firstName } = {}] = await sql(
  `select phone, substr(first_name, 1, 3) as first from public.customers where store_id = '${storeId}' limit 1`,
);
const productIds = products.map((p) => p.id);

const cases = [
  ["AdminOrders", { filter: { storeId: { eq: storeId } }, first: 20 }, `admin_orders('${storeId}', 20)`],
  ["AdminOrders", { filter: { storeId: { eq: storeId } }, first: 5 }, `admin_orders('${storeId}', 5)`],
  [
    "AdminOrders",
    {
      filter: { storeId: { eq: storeId }, status: { in: ["pending_confirmation", "pending_payment"] } },
      first: 20,
    },
    `admin_orders('${storeId}', 20, p_statuses => '{pending_confirmation,pending_payment}')`,
  ],
  [
    "AdminOrders",
    {
      filter: {
        storeId: { eq: storeId },
        or: [{ customerName: { ilike: `%${someName}%` } }, { customerPhone: { ilike: `%${someName}%` } }],
      },
      first: 20,
    },
    `admin_orders('${storeId}', 20, p_name => '%${someName}%', p_phone => '%${someName}%')`,
  ],
  [
    "AdminOrders",
    { filter: { storeId: { eq: storeId }, status: { in: ["delivered", "cancelled"] } }, first: 20 },
    `admin_orders('${storeId}', 20, p_statuses => '{delivered,cancelled}')`,
  ],
  // Second page: pg_graphql's cursor after the first 5 against offset 5.
  [
    "AdminOrders",
    { filter: { storeId: { eq: storeId } }, first: 5, after: "$cursor" },
    `admin_orders('${storeId}', 5, 5)`,
  ],
  ...orders.map((o) => ["AdminOrder", { id: o.id }, `admin_order('${o.id}')`]),
  ["CheckoutSettings", { storeId }, `admin_checkout_settings('${storeId}')`],
  [
    "NotificationLog",
    { filter: { storeId: { eq: storeId } }, first: 50 },
    `admin_notification_log('${storeId}', 50)`,
  ],
  ...(noticeOrder
    ? [
        [
          "NotificationLog",
          { filter: { storeId: { eq: storeId }, orderId: { eq: noticeOrder } }, first: 50 },
          `admin_notification_log('${storeId}', 50, '${noticeOrder}')`,
        ],
      ]
    : []),
  // Global search (Ctrl K): number OR name OR phone.
  [
    "AdminOrders",
    {
      filter: {
        storeId: { eq: storeId },
        or: [{ number: { eq: someNumber } }, { customerName: { ilike: `%${someName}%` } }],
      },
      first: 5,
    },
    `admin_orders('${storeId}', 5, p_name => '%${someName}%', p_search_number => ${someNumber})`,
  ],
  [
    "AdminCustomers",
    { filter: { storeId: { eq: storeId } }, first: 50 },
    `admin_customers('${storeId}', 50)`,
  ],
  [
    "AdminCustomers",
    {
      filter: {
        storeId: { eq: storeId },
        or: [{ firstName: { ilike: `%${firstName}%` } }, { lastName: { ilike: `%${firstName}%` } }],
      },
      first: 50,
    },
    `admin_customers('${storeId}', 50, p_name => '%${firstName}%')`,
  ],
  [
    "AdminCustomers",
    { filter: { storeId: { eq: storeId }, phone: { eq: phone } }, first: 1 },
    `admin_customers('${storeId}', 1, p_phone => '${phone}')`,
  ],
  ["CatalogStructure", { storeId }, `admin_catalog_structure('${storeId}')`],
  ["AdminProducts", { storeId, first: 20 }, `admin_products('${storeId}', 20)`],
  ["AdminProducts", { storeId, first: 20, after: "$cursor" }, `admin_products('${storeId}', 20, 20)`],
  [
    "AdminProducts",
    { storeId, query: word, first: 20 },
    `admin_products('${storeId}', 20, p_query => '${word}')`,
  ],
  [
    "AdminProducts",
    { storeId, status: "published", lowStock: true, first: 20 },
    `admin_products('${storeId}', 20, p_status => 'published', p_low_stock => true)`,
  ],
  ...(categoryId
    ? [
        [
          "AdminProducts",
          { storeId, categoryId, first: 20 },
          `admin_products('${storeId}', 20, p_category_id => '${categoryId}')`,
        ],
      ]
    : []),
  ...products.map((p) => ["ProductDetail", { id: p.id }, `admin_product('${p.id}')`]),
  ["OrderVariantSearch", { storeId, query: word }, `admin_variant_search('${storeId}', '${word}')`],
  ["OrderVariantSearch", { storeId }, `admin_variant_search('${storeId}')`],
  ["AdminPromotions", { storeId }, `admin_promotions('${storeId}')`],
  ["AdminVouchers", { storeId }, `admin_vouchers('${storeId}')`],
  [
    "DiscountTargets",
    { storeId, productIds },
    `admin_discount_targets('${storeId}', '{${productIds.join(",")}}')`,
  ],
  ["AdminContent", { storeId }, `admin_content('${storeId}')`],
  ["NotificationSettings", { storeId }, `admin_notification_settings('${storeId}')`],
];

const dropCursors = (v) =>
  Array.isArray(v)
    ? v.map(dropCursors)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([k]) => k !== "endCursor")
            .map(([k, x]) => [k, dropCursors(x)]),
        )
      : v;
function firstDiff(a, b, path = "") {
  if (isDeepStrictEqual(a, b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  return `${path}: graphql=${JSON.stringify(a)?.slice(0, 120)} rpc=${JSON.stringify(b)?.slice(0, 120)}`;
}

const claims = JSON.stringify({ sub: ownerId, role: "authenticated" });
const asOwner = (select) =>
  sql(`begin read only; set local role authenticated;
    select set_config('request.jwt.claims', '${claims}', true); ${select}; commit;`);
// A store without orders or customers (a fresh test project) has no sample for some cases: they are skipped, and said.
const runnable = cases.filter(([, , call]) => !call.includes("undefined"));
if (runnable.length < cases.length) {
  console.log(
    `# ${cases.length - runnable.length} cases skipped: the Demo of this project has no data for them`,
  );
}
let failed = 0;
for (const [name, given, call] of runnable) {
  let vars = given;
  if (vars.after === "$cursor") {
    const [first] = await asOwner(
      `select graphql.resolve($q$${doc(name)}$q$, '${JSON.stringify({ ...vars, after: undefined })}'::jsonb) as g`,
    );
    vars = { ...vars, after: Object.values(first.g.data)[0].pageInfo.endCursor };
  }
  const [row] = await asOwner(
    `select graphql.resolve($q$${doc(name)}$q$, '${JSON.stringify(vars)}'::jsonb) as g, public.${call} as r`,
  );
  const g = row.g;
  const diff = g.errors
    ? `graphql errors: ${JSON.stringify(g.errors)}`
    : firstDiff(dropCursors(g.data), dropCursors(row.r));
  const size = JSON.stringify(row.r).length;
  console.log(
    `${diff ? "not ok" : "ok"} - ${name} ${call.slice(0, 60)} (${size} bytes)${diff ? `\n  ${diff}` : ""}`,
  );
  if (diff) failed++;
}
console.log(
  failed ? `${failed} of ${runnable.length} differ` : `${runnable.length}/${runnable.length} identical`,
);
process.exit(failed ? 1 : 0);
