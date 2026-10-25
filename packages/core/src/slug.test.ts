import { describe, expect, it } from "vitest";
import { createStoreInputSchema } from "./platform";
import { slugify, storeSlugSchema } from "./slug";

describe("storeSlugSchema", () => {
  it("accepts valid slugs", () => {
    expect(storeSlugSchema.parse("tienda-a")).toBe("tienda-a");
    expect(storeSlugSchema.parse("KlauShop")).toBe("klaushop");
  });

  it("rejects invalid or reserved slugs", () => {
    for (const bad of ["ab", "-abc", "abc-", "a--b", "tienda_a", "www", "superadmin", "a".repeat(41)]) {
      expect(storeSlugSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("slugify", () => {
  it("removes accents and symbols", () => {
    expect(slugify("Tienda Ñandú 2")).toBe("tienda-nandu-2");
    expect(slugify("  Klau's Shop!! ")).toBe("klau-s-shop");
  });
});

describe("createStoreInputSchema", () => {
  it("applies defaults and normalizes", () => {
    const parsed = createStoreInputSchema.parse({
      name: "Tienda A",
      slug: "tienda-a",
      ownerEmail: " Owner@Example.com ",
      orderPrefix: "ta",
    });
    expect(parsed).toMatchObject({
      ownerEmail: "owner@example.com",
      orderPrefix: "TA",
      baseCurrency: "CUP",
      planCode: "base",
      trialDays: 30,
    });
  });
});
