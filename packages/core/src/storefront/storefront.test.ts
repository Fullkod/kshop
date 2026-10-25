import { describe, expect, it } from "vitest";
import { collectionRulesSchema, homeSectionInputSchema, linkHref, linkSchema } from "./content";
import { listingFilterIds, listingQuery, parseListingParams, sortOrderBy } from "./filters";
import { contrastRatio, resolveTheme, THEME_PRESETS, themeContrastIssues } from "./theme";

const id = "4f6c2f5e-6a4b-4c1e-9f3a-2b8d7c6e5a41";

describe("theme", () => {
  it("falls back to the Kshop preset", () => {
    expect(resolveTheme(null).colors.accent).toBe("#5B21B6");
    expect(resolveTheme({ preset: "nope" }).preset).toBe("kshop");
  });

  it("applies overrides on top of the preset", () => {
    const theme = resolveTheme({ preset: "minimal", colors: { accent: "#FF0000" }, bodyFont: "lora" });
    expect(theme.colors.accent).toBe("#FF0000");
    expect(theme.colors.background).toBe(THEME_PRESETS.minimal.colors.background);
    expect(theme.bodyFont).toBe("lora");
    expect(theme.headingFont).toBe("inter");
  });

  it("measures WCAG contrast", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
  });

  it("every preset passes AA", () => {
    for (const preset of Object.values(THEME_PRESETS)) expect(themeContrastIssues(preset.colors)).toEqual([]);
  });

  it("flags low-contrast pairs", () => {
    const colors = { ...THEME_PRESETS.kshop.colors, accent: "#FFE066" };
    expect(themeContrastIssues(colors).map((i) => i.pair)).toEqual(["Texto de los botones"]);
  });
});

describe("listing params", () => {
  const attributes = [
    {
      id: "a1",
      slug: "talla",
      values: [
        { id: "v-s", slug: "s" },
        { id: "v-m", slug: "m" },
      ],
    },
    { id: "a2", slug: "sort", values: [{ id: "v-x", slug: "x" }] },
  ];

  it("parses a shared URL", () => {
    const state = parseListingParams(
      {
        talla: "m,S",
        price: "500-2000",
        sort: "price-asc",
        page: "3",
        stock: "1",
        brand: "kaya",
        q: " vestido ",
      },
      attributes,
    );
    expect(state).toEqual({
      query: "vestido",
      page: 3,
      sort: "price-asc",
      values: { talla: ["m", "s"] },
      brands: ["kaya"],
      minPrice: 500,
      maxPrice: 2000,
      inStock: true,
      onSale: false,
    });
  });

  it("ignores invalid values", () => {
    const state = parseListingParams({ page: "-4", sort: "random", price: "abc-" }, attributes);
    expect([state.page, state.sort, state.minPrice, state.maxPrice]).toEqual([1, "newest", null, null]);
  });

  it("round-trips with a stable order and prefixes reserved attribute slugs", () => {
    const query = listingQuery({
      values: { talla: ["s", "m"], sort: ["x"] },
      sort: "name",
      page: 2,
      minPrice: 100,
    });
    expect(query).toBe("?attr-sort=x&talla=m,s&price=100-&sort=name&page=2");
    const back = parseListingParams(Object.fromEntries(new URLSearchParams(query.slice(1))), attributes);
    expect(back.values).toEqual({ sort: ["x"], talla: ["m", "s"] });
    expect(listingQuery({ sort: "newest", page: 1 })).toBe("");
  });

  it("maps slugs to ids and drops unknown ones", () => {
    const state = parseListingParams({ talla: "s,xl", brand: "kaya,otra" }, attributes);
    expect(listingFilterIds(state, attributes, [{ id: "b1", slug: "kaya" }])).toEqual({
      valueIds: "v-s",
      brandIds: "b1",
    });
  });

  it("orders by price for price sorts", () => {
    expect(sortOrderBy("price-desc")[0]).toEqual({ minPrice: "DescNullsLast" });
  });
});

describe("content schemas", () => {
  it("links: URL must be http(s) or a store path", () => {
    expect(linkSchema.safeParse({ type: "url", url: "/products" }).success).toBe(true);
    expect(linkSchema.safeParse({ type: "url", url: "javascript:alert(1)" }).success).toBe(false);
    expect(linkSchema.safeParse({ type: "product", targetId: id }).success).toBe(true);
    expect(linkHref("category", "vestidos")).toBe("/category/vestidos");
    expect(linkHref("brand", null)).toBe("");
  });

  it("sections: settings depend on the type", () => {
    const carousel = homeSectionInputSchema.parse({
      type: "product_carousel",
      source: { kind: "collection", id },
    });
    expect(carousel.type === "product_carousel" && carousel.settings).toEqual({ limit: 8, sort: "newest" });
    expect(homeSectionInputSchema.safeParse({ type: "rich_text", settings: {} }).success).toBe(false);
    expect(
      homeSectionInputSchema.safeParse({
        type: "banner",
        bannerIds: [id],
        startsAt: "2026-11-02T00:00:00Z",
        endsAt: "2026-11-01T00:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("collection rules need at least one rule", () => {
    expect(collectionRulesSchema.safeParse({}).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ onSale: false }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ onSale: true, newerThanDays: 30 }).success).toBe(true);
  });
});
