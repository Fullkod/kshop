import { describe, expect, it } from "vitest";
import { excelRowSchema, IMPORT_MAX_IMAGES } from "./excel";
import { convertFromBase, convertToBase, marginPercent } from "./pricing";
import { productInputSchema, productTypeInputSchema } from "./schemas";
import {
  catalogSlug,
  combinationKey,
  suggestSku,
  variantMatrix,
  variantName,
  type VariantAxis,
} from "./variants";

const talla: VariantAxis = {
  attributeId: "talla",
  values: [
    { id: "s", name: "S", slug: "s" },
    { id: "m", name: "M", slug: "m" },
    { id: "l", name: "L", slug: "l" },
  ],
};
const color: VariantAxis = {
  attributeId: "color",
  values: [
    { id: "r", name: "Rojo", slug: "rojo" },
    { id: "n", name: "Negro", slug: "negro" },
  ],
};

describe("variantMatrix", () => {
  it("builds every combination", () => {
    const combos = variantMatrix([talla, color]);
    expect(combos).toHaveLength(6);
    expect(variantName(combos[0]!)).toBe("S / Rojo");
    expect(variantName(combos[5]!)).toBe("L / Negro");
  });

  it("ignores axes without selected values", () => {
    expect(variantMatrix([talla, { attributeId: "x", values: [] }])).toHaveLength(3);
    expect(variantMatrix([])).toEqual([]);
  });
});

describe("SKU and slugs", () => {
  it("suggests SKUs from the product and values", () => {
    const combo = variantMatrix([talla, color])[0]!;
    expect(suggestSku("Vestido Ñandú", combo)).toBe("VESTIDO-NANDU-S-ROJO");
    expect(suggestSku("Gorra")).toBe("GORRA");
  });

  it("matches combinations regardless of order", () => {
    expect(
      combinationKey([
        { attributeId: "b", valueId: "2" },
        { attributeId: "a", valueId: "1" },
      ]),
    ).toBe(
      combinationKey([
        { attributeId: "a", valueId: "1" },
        { attributeId: "b", valueId: "2" },
      ]),
    );
  });

  it("makes catalog slugs", () => {
    expect(catalogSlug("Camisa Básica (Algodón)")).toBe("camisa-basica-algodon");
  });
});

describe("pricing", () => {
  it("converts from the base currency with rounding", () => {
    // 1 USD = 300 CUP: 1500 CUP -> 5 USD
    expect(convertFromBase(1500, 300)).toBe(5);
    expect(convertFromBase(1000, 300)).toBe(3.33);
    expect(convertFromBase(1000, 300, 0.5)).toBe(3.5);
    // 1 CUP = 1/300 USD: 5 USD -> 1500 CUP, rounded up to 10
    expect(convertFromBase(5.03, 1 / 300, 10)).toBe(1510);
  });

  it("converts to base and computes margins", () => {
    expect(convertToBase(5, 200)).toBe(1000);
    expect(marginPercent(1500, 1000)).toBe(33.3);
    expect(marginPercent(1500, null)).toBeNull();
  });
});

describe("schemas", () => {
  const variant = { sku: "A-1", price: "1500.555" };

  it("normalizes a product input", () => {
    const parsed = productInputSchema.parse({
      productTypeId: "4f6c2f5e-6a4b-4c1e-9f3a-2b8d7c6e5a41",
      name: " Vestido ",
      slug: "vestido",
      variants: [variant],
    });
    expect(parsed.name).toBe("Vestido");
    expect(parsed.variants[0]!.price).toBe(1500.56);
    expect(parsed.status).toBe("draft");
  });

  it("rejects duplicated SKUs (case-insensitive)", () => {
    const result = productInputSchema.safeParse({
      productTypeId: "4f6c2f5e-6a4b-4c1e-9f3a-2b8d7c6e5a41",
      name: "X",
      slug: "x",
      variants: [variant, { ...variant, sku: "a-1" }],
    });
    expect(result.success).toBe(false);
  });

  it("product types without variants only take product attributes", () => {
    const result = productTypeInputSchema.safeParse({
      name: "Accesorios",
      hasVariants: false,
      attributes: [{ attributeId: "4f6c2f5e-6a4b-4c1e-9f3a-2b8d7c6e5a41", scope: "variant" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("excel rows", () => {
  const row = {
    productCode: "V1",
    name: "Vestido",
    description: "",
    category: "",
    brand: "",
    collections: "",
    tags: "",
    status: "",
    sku: "V1-S",
    price: "1500",
    compareAtPrice: "",
    cost: "",
    costCurrency: "",
    stock: "",
    attributes: {},
  };

  it("splits image URLs by commas, spaces and line breaks", () => {
    const parsed = excelRowSchema.parse({
      ...row,
      images: "https://a.example/1.jpg, https://a.example/2.png\nhttp://b.example/3.webp",
    });
    expect(parsed.images).toEqual([
      "https://a.example/1.jpg",
      "https://a.example/2.png",
      "http://b.example/3.webp",
    ]);
    expect(excelRowSchema.parse({ ...row, images: "" }).images).toEqual([]);
  });

  it("rejects non-http image URLs and too many images", () => {
    expect(excelRowSchema.safeParse({ ...row, images: "ftp://a.example/1.jpg" }).success).toBe(false);
    expect(excelRowSchema.safeParse({ ...row, images: "foto.jpg" }).success).toBe(false);
    const many = Array.from({ length: IMPORT_MAX_IMAGES + 1 }, (_, i) => `https://a.example/${i}.jpg`);
    expect(excelRowSchema.safeParse({ ...row, images: many.join(",") }).success).toBe(false);
  });
});
