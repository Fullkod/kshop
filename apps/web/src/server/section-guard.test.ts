import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { isSectionFreeWrite, sectionOfWrite } from "./section-guard";

const storeApi = join(import.meta.dirname, "../app/api/v1/stores/[storeId]");

function writeRoutes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return writeRoutes(path);
    if (name !== "route.ts" || !/export const (POST|PUT|PATCH|DELETE)\b/.test(readFileSync(path, "utf8")))
      return [];
    return [relative(storeApi, dir).split(sep).join("/")];
  });
}

// Dynamic segments that choose the section: every value they take (keys of CHECKOUT_SETTINGS).
const DYNAMIC_VALUES: Record<string, string[]> = {
  "checkout-settings/[resource]": ["zones", "methods", "payment-methods"],
};

describe("section guard", () => {
  it("maps every store write route to a section or marks it as free", () => {
    const unmapped = writeRoutes(storeApi).flatMap((route) => {
      const expanded = Object.entries(DYNAMIC_VALUES).flatMap(([prefix, values]) =>
        route.startsWith(prefix) ? values.map((v) => route.replace("[resource]", v)) : [],
      );
      // Other dynamic segments ([id]) never decide the section: the static segments before them do.
      return (expanded.length ? expanded : [route])
        .map((path) => path.replace(/\[[^\]]+\]/g, "x"))
        .filter((path) => !sectionOfWrite(path) && !isSectionFreeWrite(path));
    });
    expect(unmapped).toEqual([]);
  });

  it("decides by sub-route, not by folder", () => {
    expect(sectionOfWrite("checkout-settings/zones/abc")).toBe("shipping");
    expect(sectionOfWrite("checkout-settings/payment-methods/abc")).toBeNull();
    expect(sectionOfWrite("catalog/imports/abc/run")).toBe("excel_import");
    expect(sectionOfWrite("catalog/products/abc")).toBeNull();
    expect(sectionOfWrite("catalog/stock")).toBe("multi_warehouse");
    expect(sectionOfWrite("content/theme")).toBe("themes");
    expect(sectionOfWrite("customers/abc")).toBeNull();
    expect(sectionOfWrite("customer/addresses")).toBeNull();
  });
});
