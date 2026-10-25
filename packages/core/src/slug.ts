import { z } from "zod";

// Subdomains that can never be a store. Mirrored in the database (private.reserved_slugs).
export const RESERVED_SLUGS = [
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "blog",
  "cdn",
  "dashboard",
  "dev",
  "docs",
  "fullkod",
  "help",
  "kshop",
  "mail",
  "platform",
  "shop",
  "soporte",
  "static",
  "status",
  "superadmin",
  "support",
  "test",
  "www",
] as const;

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export const storeSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    SLUG_PATTERN,
    "Usa de 3 a 40 letras minúsculas, números o guiones (sin guion al inicio ni al final).",
  )
  .refine((slug) => !slug.includes("--"), "No uses dos guiones seguidos.")
  .refine((slug) => !(RESERVED_SLUGS as readonly string[]).includes(slug), "Ese nombre está reservado.");

/** Suggests a slug from a store name: "Tienda Ñandú 2" -> "tienda-nandu-2". */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    // Drop combining marks left by NFD (accents): "ú" -> "u".
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}
