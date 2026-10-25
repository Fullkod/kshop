import { MODULE_CODES } from "@kshop/core";
import { describe, expect, it } from "vitest";
import { ADMIN_MODULES } from "./registry";

describe("module registry", () => {
  it("registers every module code exactly once", () => {
    expect(ADMIN_MODULES.map((m) => m.code).sort()).toEqual([...MODULE_CODES].sort());
  });

  it("uses unique admin paths", () => {
    expect(new Set(ADMIN_MODULES.map((m) => m.adminPath)).size).toBe(ADMIN_MODULES.length);
  });
});
