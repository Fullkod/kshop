// R11 phase 5: the admin's RPC reads (admin_orders, admin_order, admin_checkout_settings, admin_notification_log)
// must return exactly what the pg_graphql queries they replace return. Runs both as the Tienda Demo owner inside a
// read-only transaction and compares them (only endCursor differs: the RPCs use offset cursors).
//   node scripts/compare-admin-reads.mjs        (through scripts/db-env.mjs: test project by default)
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

// The GraphQL documents, straight from packages/data (fragments are not used by these four).
const src =
  readFileSync(join(root, "packages/data/src/order-queries.ts"), "utf8") +
  readFileSync(join(root, "packages/data/src/notification-queries.ts"), "utf8");
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
let failed = 0;
for (const [name, given, call] of cases) {
  let vars = given;
  if (vars.after === "$cursor") {
    const [first] = await asOwner(
      `select graphql.resolve($q$${doc(name)}$q$, '${JSON.stringify({ ...vars, after: undefined })}'::jsonb) as g`,
    );
    vars = { ...vars, after: first.g.data.ordersCollection.pageInfo.endCursor };
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
console.log(failed ? `${failed} of ${cases.length} differ` : `${cases.length}/${cases.length} identical`);
process.exit(failed ? 1 : 0);
