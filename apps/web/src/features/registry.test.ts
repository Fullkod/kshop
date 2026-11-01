import { HEADLESS_MODULES, MODULE_CODES } from "@kshop/core";
import { describe, expect, it } from "vitest";
import { ADMIN_MODULES } from "./registry";

describe("module registry", () => {
  it("registers every module code with a screen exactly once", () => {
    expect(ADMIN_MODULES.map((m) => m.code).sort()).toEqual(
      MODULE_CODES.filter((code) => !HEADLESS_MODULES.includes(code)).sort(),
    );
  });

  it("uses unique admin paths", () => {
    expect(new Set(ADMIN_MODULES.map((m) => m.adminPath)).size).toBe(ADMIN_MODULES.length);
  });
});
