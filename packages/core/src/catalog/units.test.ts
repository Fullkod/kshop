import { describe, expect, it } from "vitest";
import { cartLineSchema } from "../orders/schemas";
import { posSaleSchema } from "../pos";
import {
  countedQuantity,
  formatQuantity,
  lineTotal,
  parseQuantity,
  perUnitSuffix,
  quantityError,
  quantityForAmount,
  quantityStep,
  quantityValueSchema,
  roundQuantity,
  saleUnitFromLabel,
  toSaleUnit,
} from "./units";
import { excelRowSchema } from "./excel";

describe("sale units (KSH0015)", () => {
  it("parses comma and dot, rounds to 2 decimals", () => {
    expect(parseQuantity("1,5")).toBe(1.5);
    expect(parseQuantity(" 2.25 ")).toBe(2.25);
    expect(parseQuantity("1,375")).toBe(1.38);
    expect(parseQuantity("3")).toBe(3);
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("1,2,3")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
    expect(roundQuantity(0.1 + 0.2)).toBe(0.3);
    expect(roundQuantity(1.005)).toBe(1.01);
  });

  it("whole units reject decimals; measured units take 2", () => {
    expect(quantityError(1.5, "unit")).toMatch(/enteras/);
    expect(quantityError(3, "unit")).toBeNull();
    expect(quantityError(1000, "unit")).toMatch(/Máximo/);
    expect(quantityError(1.37, "lb")).toBeNull();
    expect(quantityError(1.375, "lb")).toMatch(/2 decimales/);
    expect(quantityError(0, "lb", { positive: true })).not.toBeNull();
    expect(quantityError(1500, "g")).toBeNull();
  });

  it("line total rounds like Postgres round(price × qty, 2)", () => {
    expect(lineTotal(650, 1.37)).toBe(890.5);
    expect(lineTotal(1700, 1.37)).toBe(2329);
    expect(lineTotal(0.1, 3)).toBe(0.3);
    expect(lineTotal(33.33, 0.5)).toBe(16.67); // 16.665 → 16.67 (half away from zero)
    expect(lineTotal(120, 2)).toBe(240);
  });

  it("formats with the unit and Spanish decimals", () => {
    expect(formatQuantity(1.5, "lb")).toBe("1,5 lb");
    expect(formatQuantity("3.00", "unit")).toBe("3");
    expect(formatQuantity(3, "unit", { withUnit: true })).toBe("3 u");
    expect(formatQuantity("250.00", "g")).toBe("250 g");
    expect(formatQuantity(2, "m2")).toBe("2 m²");
    expect(perUnitSuffix("lb")).toBe(" / lb");
    expect(perUnitSuffix(null)).toBe("");
    expect(toSaleUnit("nope")).toBe("unit");
  });

  it("steps, amounts and counting", () => {
    expect(quantityStep("lb")).toBe(0.5);
    expect(quantityStep("lb", "0.25")).toBe(0.25);
    expect(quantityStep("unit", 0.5)).toBe(1);
    expect(quantityStep("g")).toBe(100);
    expect(quantityForAmount(100, 650)).toBe(0.15);
    expect(quantityForAmount(100, 0)).toBe(0);
    expect(countedQuantity(3, "unit")).toBe(3);
    expect(countedQuantity(42.5, "lb")).toBe(1);
  });

  it("units from Excel labels", () => {
    expect(saleUnitFromLabel("Libra")).toBe("lb");
    expect(saleUnitFromLabel("libras")).toBe("lb");
    expect(saleUnitFromLabel("KG")).toBe("kg");
    expect(saleUnitFromLabel("m²")).toBe("m2");
    expect(saleUnitFromLabel("Unidad")).toBe("unit");
    expect(saleUnitFromLabel("")).toBeUndefined();
    expect(saleUnitFromLabel("saco")).toBeNull();
  });

  it("request schemas take decimals and old whole numbers", () => {
    expect(quantityValueSchema().parse("1,5")).toBe(1.5);
    expect(quantityValueSchema().parse(2)).toBe(2);
    expect(quantityValueSchema({ positive: true }).safeParse(0).success).toBe(false);
    expect(quantityValueSchema().safeParse("x").success).toBe(false);
    expect(cartLineSchema.parse({ variantId: "00000000-0000-4000-8000-000000000000", quantity: "0,5" }).quantity).toBe(0.5);
    const sale = {
      id: "00000000-0000-4000-8000-000000000001",
      deviceId: "00000000-0000-4000-8000-000000000002",
      localNumber: "A-1",
      soldAt: "2026-11-07T10:00:00-04:00",
      lines: [{ variantId: "00000000-0000-4000-8000-000000000003", quantity: 1, unitPrice: 100, productName: "X" }],
      payments: [],
    };
    const parsed = posSaleSchema.safeParse(sale);
    if (parsed.success) expect(parsed.data.lines[0]!.quantity).toBe(1);
  });

  it("Excel: «Unidad» column and decimal stock", () => {
    const base = {
      productCode: "", name: "Arroz", description: "", category: "", brand: "", collections: "", tags: "",
      status: "", sku: "ARROZ", price: "120", compareAtPrice: "", cost: "", costCurrency: "", stock: "35,5",
      images: "", attributes: {},
    };
    const row = excelRowSchema.parse({ ...base, saleUnit: "Libra" });
    expect(row.saleUnit).toBe("lb");
    expect(row.stock).toBe(35.5);
    expect(excelRowSchema.parse(base).saleUnit).toBeUndefined();
    expect(excelRowSchema.safeParse({ ...base, saleUnit: "saco" }).success).toBe(false);
  });
});
