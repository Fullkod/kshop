// Creates a platform superadmin, or promotes an existing account (app_metadata.role = "superadmin").
//
//   pnpm superadmin:create <email>
//
// A new account gets a random password, printed once; change it after the first login.
// Existing users must sign in again so their token carries the new role.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
const envPath = join(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !env[match[1]]) env[match[1]] = match[2].trim();
  }
}

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: pnpm superadmin:create <email>");
  process.exit(1);
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}).auth.admin;

async function findUserByEmail(target) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === target);
    if (user || data.users.length < 200) return user ?? null;
  }
}

const existing = await findUserByEmail(email);
if (existing) {
  const { error } = await admin.updateUserById(existing.id, {
    app_metadata: { ...existing.app_metadata, role: "superadmin" },
  });
  if (error) throw error;
  console.log(`${email} is now superadmin. Sign in again to refresh the token.`);
} else {
  const password = randomBytes(12).toString("base64url");
  const { error } = await admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "superadmin" },
  });
  if (error) throw error;
  console.log(`Superadmin ${email} created.`);
  console.log(`Temporary password (shown once): ${password}`);
}
