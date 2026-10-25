import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_CODES } from "./modules";
import { RESERVED_SLUGS } from "./slug";

const migrationsDir = join(import.meta.dirname, "../../../supabase/migrations");
const migrations = readdirSync(migrationsDir)
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n");

describe("TypeScript constants mirror the database", () => {
  it("MODULE_CODES matches the seeded public.modules", () => {
    const seed = migrations.match(/insert into public\.modules[\s\S]*?on conflict/)?.[0] ?? "";
    const codes = [...seed.matchAll(/^\s*\('([a-z_]+)'/gm)].map((m) => m[1]);
    expect(codes.sort()).toEqual([...MODULE_CODES].sort());
  });

  it("RESERVED_SLUGS matches the stores_slug_not_reserved check", () => {
    const check =
      migrations.match(/stores_slug_not_reserved check \(slug <> all \(array\[([\s\S]*?)\]\)\)/)?.[1] ?? "";
    const slugs = [...check.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(slugs.sort()).toEqual([...RESERVED_SLUGS].sort());
  });
});
