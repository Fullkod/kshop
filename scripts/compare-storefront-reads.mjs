// R11: the storefront's RPC reads (supabase/migrations/20261108100700_storefront_reads.sql) must return exactly what
// the pg_graphql queries of packages/data return. Runs both as anon (a visitor) on the Tienda Demo inside a read-only
// transaction and compares them (only endCursor differs: the RPCs use offset cursors).
//   node scripts/db-env.mjs node scripts/compare-storefront-reads.mjs
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

const src = ["storefront-queries", "queries"]
  .map((f) => readFileSync(join(root, `packages/data/src/${f}.ts`), "utf8"))
  .join("\n");
const defs = Object.fromEntries(
  [...src.matchAll(/graphql\(`\s*((?:query|fragment)\s+(\w+)[\s\S]*?)`\)/g)].map((m) => [m[2], m[1]]),
);
function doc(name) {
  let text = defs[name];
  const seen = new Set();
  for (let added = true; added;) {
    added = false;
    for (const [, f] of text.matchAll(/\.\.\.(\w+)/g)) {
      if (!seen.has(f)) {
        seen.add(f);
        text += `\n${defs[f]}`;
        added = true;
      }
    }
  }
  return text;
}
const snake = (name) => name.replace(/[A-Z]/g, (c, i) => (i ? "_" : "") + c.toLowerCase());

const [{ id: storeId }] = await sql("select id from public.stores where slug = 'demo'");
const one = async (q) => (await sql(q))[0] ?? {};
const { slug } = await one(
  `select slug from public.products where store_id = '${storeId}' and status = 'published' limit 1`,
);
const products =
  await sql(`select p.id from public.products p where p.store_id = '${storeId}' and p.status = 'published'
  order by (select count(*) from public.product_variants v where v.product_id = p.id) desc, p.id limit 3`);
const { id: promoProduct } = await one(`select product_id as id from public.variant_promotions
  where store_id = '${storeId}' limit 1`);
const cats = await sql(
  `select id from public.categories where store_id = '${storeId}' order by depth, id limit 3`,
);
const cols = await sql(`select id from public.collections where store_id = '${storeId}' order by id limit 2`);
const { id: brandId } = await one(`select id from public.brands where store_id = '${storeId}' limit 1`);
const { word } = await one(`select lower(split_part(name, ' ', 1)) as word from public.products
  where store_id = '${storeId}' and status = 'published' limit 1`);
const { ids: valueIds } =
  await one(`select string_agg(id::text, ',') as ids from (select id from public.attribute_values
  where store_id = '${storeId}' limit 2) x`);
const { slug: pageSlug } = await one(`select slug from public.pages where store_id = '${storeId}' limit 1`);
const sorts = [
  [{ publishedAt: "DescNullsLast" }, { name: "AscNullsLast" }],
  [{ minPrice: "AscNullsLast" }, { name: "AscNullsLast" }],
  [{ minPrice: "DescNullsLast" }, { name: "AscNullsLast" }],
  [{ name: "AscNullsLast" }],
];
const productIds = [...products.map((p) => p.id), ...(promoProduct ? [promoProduct] : [])];

const cases = [
  ["StoreBySlug", { slug: "demo" }],
  ["StoreSlugById", { id: storeId }],
  ["StoreSlugs", {}],
  ["StorefrontShell", { storeId }],
  ["StorefrontHome", { storeId }],
  [
    "StorefrontProductCounts",
    { storeId, categoryIds: cats.map((c) => c.id).join(","), collectionIds: cols.map((c) => c.id).join(",") },
  ],
  ...(pageSlug ? [["StorefrontPage", { storeId, slug: pageSlug }]] : []),
  ...sorts.map((orderBy) => [
    "StorefrontCarousel",
    { filter: { storeId: { eq: storeId }, status: { eq: "published" } }, orderBy, first: 12 },
  ]),
  [
    "StorefrontCarousel",
    {
      filter: {
        storeId: { eq: storeId },
        status: { eq: "published" },
        categoryId: { in: cats.map((c) => c.id) },
      },
      orderBy: sorts[0],
      first: 12,
    },
  ],
  ...(brandId
    ? [
        [
          "StorefrontCarousel",
          {
            filter: { storeId: { eq: storeId }, status: { eq: "published" }, brandId: { eq: brandId } },
            orderBy: sorts[1],
            first: 12,
          },
        ],
      ]
    : []),
  [
    "StorefrontCarousel",
    {
      filter: { storeId: { eq: storeId }, status: { eq: "published" }, onSale: { eq: true } },
      orderBy: sorts[0],
      first: 12,
    },
  ],
  ...cols.map((c) => [
    "StorefrontCollectionCarousel",
    { storeId, collectionId: c.id, orderBy: sorts[0], first: 12 },
  ]),
  ...sorts.map((orderBy) => ["StorefrontProducts", { storeId, orderBy, first: 24, offset: 0 }]),
  ["StorefrontProducts", { storeId, orderBy: sorts[0], first: 24, offset: 24 }],
  ["StorefrontProducts", { storeId, query: word, orderBy: sorts[3], first: 24 }],
  ["StorefrontProducts", { storeId, categoryId: cats[0]?.id, orderBy: sorts[1], first: 24 }],
  [
    "StorefrontProducts",
    { storeId, minPrice: "1000", maxPrice: "1300", inStock: true, orderBy: sorts[0], first: 24 },
  ],
  ["StorefrontProducts", { storeId, onSale: true, orderBy: sorts[2], first: 24 }],
  ...(valueIds ? [["StorefrontProducts", { storeId, valueIds, orderBy: sorts[0], first: 24 }]] : []),
  ["StorefrontFacets", { storeId }],
  ["StorefrontFacets", { storeId, categoryId: cats[0]?.id, inStock: true }],
  ["StorefrontProductCards", { storeId, ids: productIds }],
  ["ProductSlugs", { storeId, ids: productIds }],
  ["StorefrontProduct", { storeId, slug }],
  ...productIds.map((id) => ["StorefrontProductById", { storeId, id }]),
  ["StorefrontSitemap", { storeId }],
  ["StorefrontSitemap", { storeId, after: "$cursor" }],
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
  return `${path}: graphql=${JSON.stringify(a)?.slice(0, 140)} rpc=${JSON.stringify(b)?.slice(0, 140)}`;
}

const asAnon = (select) => sql(`begin read only; set local role anon; ${select}; commit;`);
const lit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
let failed = 0;
for (const [name, given] of cases) {
  let gqlVars = given;
  let rpcVars = given;
  if (given.after === "$cursor") {
    const [first] = await asAnon(`select graphql.resolve($q$${doc(name)}$q$, ${lit({ storeId })}) as g`);
    gqlVars = { ...given, after: Object.values(first.g.data)[0].pageInfo.endCursor };
    rpcVars = { ...given, after: "100" };
  }
  const [row] = await asAnon(
    `select graphql.resolve($q$${doc(name)}$q$, ${lit(gqlVars)}) as g, public.sf_${snake(name)}(${lit(rpcVars)}) as r`,
  );
  const diff = row.g.errors
    ? `graphql errors: ${JSON.stringify(row.g.errors)}`
    : firstDiff(dropCursors(row.g.data), dropCursors(row.r));
  const size = JSON.stringify(row.r).length;
  console.log(
    `${diff ? "not ok" : "ok"} - ${name} ${JSON.stringify(given).slice(0, 70)} (${size} bytes)${diff ? `\n  ${diff}` : ""}`,
  );
  if (diff) failed++;
}
console.log(failed ? `${failed} of ${cases.length} differ` : `${cases.length}/${cases.length} identical`);
process.exit(failed ? 1 : 0);
