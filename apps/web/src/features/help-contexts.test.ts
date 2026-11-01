import { helpContextForPath } from "@kshop/admin/help";
import { describe, expect, it } from "vitest";
import { ADMIN_MODULES } from "./registry";

// KSH0005: a new module must get its own help context (and so its guides), not fall back to Inicio's.
describe("help contexts", () => {
  it("gives every admin module its own context", () => {
    const fallback = ADMIN_MODULES.filter((m) => helpContextForPath(m.adminPath) === "home").map(
      (m) => m.adminPath,
    );
    expect(fallback).toEqual([]);
  });
});
