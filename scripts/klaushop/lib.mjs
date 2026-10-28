// Shared pieces of the klauShop migration (phase 8): environment, read-only access to klauShop through the Supabase
// Management API, the Kshop service client, the snapshot folder and the small mappings (phones, slugs, HTML, colours).

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** Git-ignored: the snapshot carries real names and phones. */
export const SNAPSHOT_DIR = join(ROOT, ".klaushop-snapshot");

export function loadEnv() {
  const env = { ...process.env };
  const envPath = join(ROOT, ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !env[match[1]]) env[match[1]] = match[2].trim();
    }
  }
  return env;
}

export const env = loadEnv();

function need(name) {
  if (!env[name]) {
    console.error(`klaushop: set ${name} in .env.local`);
    process.exit(1);
  }
  return env[name];
}

/** Kshop (service role: the import writes through SQL functions and PostgREST, bypassing RLS). */
export function kshopService() {
  return createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Runs SQL on klauShop inside a `read only` transaction through the Management API (its own account token;
 * KLAUSHOP_ACCESS_TOKEN is never used for anything else). Postgres refuses any write in such a transaction.
 */
export async function klauQuery(sql) {
  const ref = need("KLAUSHOP_PROJECT_REF");
  const token = need("KLAUSHOP_ACCESS_TOKEN");
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `begin transaction read only; ${sql}; rollback;` }),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`klauShop query -> ${res.status}: ${data?.message ?? text}`);
  return data;
}

/** Reads a whole table in pages (the API has no cursor; ids are stable). */
export async function klauTable(table, columns, { where = "", order = "id", page = 500 } = {}) {
  const rows = [];
  for (let offset = 0; ; offset += page) {
    const batch = await klauQuery(
      `select ${columns} from ${table}${where ? ` where ${where}` : ""} order by ${order} limit ${page} offset ${offset}`,
    );
    rows.push(...batch);
    if (batch.length < page) return rows;
  }
}

export function klauStorageUrl(key) {
  return `${need("KLAUSHOP_STORAGE_PUBLIC_URL").replace(/\/$/, "")}/${key}`;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export function writeSnapshot(name, data) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(join(SNAPSHOT_DIR, name), JSON.stringify(data, null, 1));
}

export function readSnapshot(name = "snapshot.json") {
  const path = join(SNAPSHOT_DIR, name);
  if (!existsSync(path)) {
    console.error(`klaushop: ${path} not found; run pnpm klaushop:export first`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args._.push(a);
      continue;
    }
    const [key, inline] = a.slice(2).split("=");
    const next = argv[i + 1];
    if (inline !== undefined) args[key] = inline;
    else if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else args[key] = true;
  }
  return args;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function log(...parts) {
  console.log(new Date().toISOString().slice(11, 19), ...parts);
}

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------

/** klauShop stores arrays as JSON text inside json columns ("[\"M\",\"L\"]"); older rows hold real arrays. */
export function jsonArray(value) {
  if (value == null) return [];
  let v = value;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (typeof v === "string") return jsonArray(v);
  return Array.isArray(v) ? v.filter((x) => x != null && String(x).trim() !== "").map((x) => String(x).trim()) : [];
}

export function jsonObject(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** E.164; Cuban mobiles written as 8 digits get +53. Returns null when it cannot be a phone. */
export function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  const e164 = digits.length === 8 ? `+53${digits}` : digits.startsWith("53") && digits.length === 10 ? `+${digits}` : `+${digits}`;
  return /^\+[1-9][0-9]{7,14}$/.test(e164) ? e164 : null;
}

export function slugify(text, max = 80) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

export const isValidSlug = (s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s ?? "");

/** Product descriptions in klauShop are HTML; Kshop shows plain text with line breaks. */
export function htmlToText(html) {
  if (!html) return "";
  let t = String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  t = t
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
  return t
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const COLOR_NAMES = {
  "#000000": "Negro",
  "#050505": "Negro",
  "#ffffff": "Blanco",
  "#ff0000": "Rojo",
  "#f50505": "Rojo",
  "#0000ff": "Azul",
  "#0008ff": "Azul",
  "#3700ff": "Azul eléctrico",
  "#00bfff": "Celeste",
  "#ffefd5": "Crema",
  "#ffffe0": "Amarillo claro",
  "#ffff00": "Amarillo",
  "#fbff00": "Amarillo",
  "#ffd700": "Dorado",
  "#feb43f": "Mostaza",
  "#ff8c00": "Naranja",
  "#ff7b00": "Naranja",
  "#ff4500": "Naranja rojizo",
  "#ff1493": "Rosa fuerte",
  "#e63b7a": "Rosa",
  "#fb00ff": "Fucsia",
  "#b950b6": "Lila",
  "#008000": "Verde",
  "#00ff00": "Verde claro",
  "#22f406": "Verde claro",
};

/** Name shown for a klauShop colour (a hex); unknown hexes keep the hex as name. */
export function colorName(hex) {
  const key = String(hex ?? "").trim().toLowerCase();
  return COLOR_NAMES[key] ?? String(hex ?? "").trim().toUpperCase();
}

export const BADGE_LABELS = { new_product: "Nuevo", best_sale: "Más vendido", featured: "Destacado" };

/** Variant key shared by the product import and the order lines: legacy product + the three options. */
export function variantKey(legacyProductId, color, size, material) {
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  return `${legacyProductId}|${norm(color)}|${norm(size)}|${norm(material)}`;
}

export function money(v) {
  return Math.round(Number(v ?? 0) * 100) / 100;
}
