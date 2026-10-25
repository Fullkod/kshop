// Creates (or repairs) the permanent test store "Tienda Demo" (http://demo.kshop.localhost:3000) on plan Pro,
// with an owner and a staff account. Idempotent: run it again to recreate whatever is missing and to reset the
// passwords to the ones in .env.local (DEMO_OWNER_PASSWORD / DEMO_STAFF_PASSWORD, generated on first run).
//
//   pnpm demo:seed
//
// Accounts use the reserved .test TLD (no real inbox). `pnpm e2e:cleanup` never touches them.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

function loadEnv() {
  const env = { ...process.env };
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !env[match[1]]) env[match[1]] = match[2].trim();
    }
  }
  return env;
}

let env = loadEnv();
const additions = [];
if (!env.DEMO_OWNER_PASSWORD) additions.push(`DEMO_OWNER_PASSWORD=${randomBytes(12).toString("base64url")}`);
if (!env.DEMO_STAFF_PASSWORD) additions.push(`DEMO_STAFF_PASSWORD=${randomBytes(12).toString("base64url")}`);
if (additions.length) {
  appendFileSync(
    envPath,
    `\n# Permanent test store "Tienda Demo" (pnpm demo:seed)\n${additions.join("\n")}\n`,
  );
  env = loadEnv();
}

export const DEMO = {
  slug: "demo",
  name: "Tienda Demo",
  owner: "dueno@demo.kshop.test",
  staff: "empleado@demo.kshop.test",
};

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureUser(email, password) {
  const { data, error } = await service.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((u) => u.email === email);
  if (existing) {
    const { error: updateError } = await service.auth.admin.updateUserById(existing.id, { password });
    if (updateError) throw updateError;
    return existing.id;
  }
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw createError;
  return created.user.id;
}

const ownerId = await ensureUser(DEMO.owner, env.DEMO_OWNER_PASSWORD);
const staffId = await ensureUser(DEMO.staff, env.DEMO_STAFF_PASSWORD);

let { data: store, error } = await service
  .from("stores")
  .select("id, status")
  .eq("slug", DEMO.slug)
  .maybeSingle();
if (error) throw error;

if (!store) {
  const result = await service
    .rpc("create_store", {
      p_name: DEMO.name,
      p_slug: DEMO.slug,
      p_owner_id: ownerId,
      p_base_currency: "CUP",
      p_order_prefix: "DEMO",
      p_whatsapp_phone: "+5350000000",
      p_plan_code: "pro",
      p_trial_days: 0,
      p_platform_domain: env.PLATFORM_CANONICAL_DOMAIN ?? "kshop.fullkod.com",
      p_created_by: null,
    })
    .single();
  if (result.error) throw result.error;
  store = result.data;
  console.log(`Created store ${DEMO.name} (${store.id})`);
} else {
  if (store.status !== "active") {
    const { error: statusError } = await service
      .from("stores")
      .update({ status: "active" })
      .eq("id", store.id);
    if (statusError) throw statusError;
  }
  console.log(`Store ${DEMO.name} already exists (${store.id})`);
}

const { error: memberError } = await service
  .from("store_members")
  .upsert(
    { store_id: store.id, user_id: staffId, role: "staff" },
    { onConflict: "store_id,user_id", ignoreDuplicates: true },
  );
if (memberError) throw memberError;

console.log(`Owner: ${DEMO.owner} (DEMO_OWNER_PASSWORD) · Staff: ${DEMO.staff} (DEMO_STAFF_PASSWORD)`);
console.log("Admin: http://demo.kshop.localhost:3000/admin");
