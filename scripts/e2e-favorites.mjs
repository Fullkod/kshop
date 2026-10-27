// Redesign v2 (PRP-R D3): customer favorites API on the Tienda Demo, with `pnpm dev` running.
// A temporary customer (@e2e.kshop.test) adds, lists and removes favorites; guests, another store's
// customer and unknown products are rejected. Everything it creates is deleted at the end.
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
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
const PASSWORD = randomBytes(12).toString("base64url");
const EMAIL = "fav-customer@e2e.kshop.test";
const OTHER_EMAIL = "fav-customer-other@e2e.kshop.test";

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
function check(name, ok, detail) {
  results.push(ok);
  console.log(
    `${ok ? "ok" : "not ok"} - ${name}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail).slice(0, 300)})`}`,
  );
}

async function removeUsers() {
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data.users) {
    if (u.email === EMAIL || u.email === OTHER_EMAIL) await service.auth.admin.deleteUser(u.id);
  }
}

/** Customer account of a store (as the API creates them, minus the phone login) and its access token. */
async function customer(email, storeId, phone) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { kind: "customer", store_id: storeId },
  });
  if (error) throw error;
  const { error: rowError } = await service
    .from("customers")
    .insert({ store_id: storeId, user_id: data.user.id, phone, first_name: "Favoritos" });
  if (rowError) throw rowError;
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;
  return session.session.access_token;
}

const call = (method, path, token) =>
  fetch(`${APP}/api/v1${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

await removeUsers();
const { data: stores } = await service.from("stores").select("id, slug").in("slug", ["demo"]);
const demo = stores?.[0];
if (!demo) throw new Error("Tienda Demo not found: run pnpm demo:seed");
const { data: products } = await service
  .from("products")
  .select("id")
  .eq("store_id", demo.id)
  .eq("status", "published")
  .limit(2);
// Another store, for the cross-store token check (the FK test in 10_favorites_isolation covers foreign products).
const { data: other } = await service.from("stores").select("id").neq("id", demo.id).limit(1).single();
const [p1, p2] = products.map((p) => p.id);

try {
  const token = await customer(EMAIL, demo.id, "+5359990001");
  const otherToken = await customer(OTHER_EMAIL, other.id, "+5359990002");
  const base = `/stores/${demo.id}/customer/favorites`;

  check("guest: 401", (await call("GET", base)).status === 401);
  check("customer of another store: 401", (await call("GET", base, otherToken)).status === 401);

  let res = await call("GET", base, token);
  let body = await res.json();
  check("empty at first", res.status === 200 && body.productIds.length === 0, body);

  check("add a favorite: 204", (await call("PUT", `${base}/${p1}`, token)).status === 204);
  check("adding it again is idempotent", (await call("PUT", `${base}/${p1}`, token)).status === 204);
  check("add a second one", (await call("PUT", `${base}/${p2}`, token)).status === 204);
  check("an unknown product: 404", (await call("PUT", `${base}/${randomUUID()}`, token)).status === 404);

  res = await call("GET", base, token);
  body = await res.json();
  check(
    "list: newest first, with product cards",
    body.productIds.join() === [p2, p1].join() && body.products.length === 2 && !!body.products[0].slug,
    body.productIds,
  );

  check("remove: 204", (await call("DELETE", `${base}/${p2}`, token)).status === 204);
  check("remove again is idempotent", (await call("DELETE", `${base}/${p2}`, token)).status === 204);
  body = await (await call("GET", base, token)).json();
  check("list after removing", body.productIds.join() === p1, body.productIds);
  check(
    "the other store's customer still has none",
    (await (await call("GET", `/stores/${other.id}/customer/favorites`, otherToken)).json()).productIds
      .length === 0,
  );
} finally {
  await removeUsers();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
