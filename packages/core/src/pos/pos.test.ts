import { describe, expect, it } from "vitest";
import {
  normalizeSearch,
  parseDecimal,
  posCartTotal,
  posDaySummary,
  posItemPrice,
  posSaleSchema,
  posSearchIndex,
  searchPosCatalog,
} from "../index";

const item = (productName: string, sku = "X", variantName = "") => ({ productName, variantName, sku });
const names = (query: string, items: ReturnType<typeof item>[]) =>
  searchPosCatalog(posSearchIndex(items), query).map((i) => i.productName);

describe("search of the counter (P5)", () => {
  const catalog = [
    item("Arroz integral", "A1"),
    item("Blanco arroz fino", "A2"),
    item("Arroz largo blanco", "A3"),
    item("Arroz blanco 1 lb", "A4"),
    item("Aceite de oliva", "A5"),
  ];

  it("first the consecutive phrase, then scattered in order, out of order and partial", () => {
    expect(names("arroz blanco", catalog)).toEqual([
      "Arroz blanco 1 lb",
      "Arroz largo blanco",
      "Blanco arroz fino",
      "Arroz integral",
    ]);
  });

  it("a longer consecutive piece beats more scattered words", () => {
    const items = [item("Largo arroz ahora blanco"), item("Arroz blanco grano")];
    expect(names("arroz blanco largo", items)).toEqual(["Arroz blanco grano", "Largo arroz ahora blanco"]);
  });

  it("finds pieces of words, without accents or case", () => {
    expect(names("CAFE", [item("Café molido")])).toEqual(["Café molido"]);
    expect(names("mol caf", [item("Café molido"), item("Té")])).toEqual(["Café molido"]);
    expect(normalizeSearch("Café  (1 lb)")).toBe("cafe 1 lb");
  });

  it("looks in the variant too", () => {
    expect(names("rojo", [item("Vestido", "V1", "Rojo"), item("Vestido", "V2", "Azul")])).toEqual([
      "Vestido",
    ]);
  });

  it("the exact code of a barcode reader comes first", () => {
    const items = [item("Código 7501 en el nombre", "OTRO"), item("Refresco", "7501")];
    expect(names("7501", items)[0]).toBe("Refresco");
  });

  it("nothing for an empty search or no match", () => {
    expect(names("   ", catalog)).toEqual([]);
    expect(names("zzz", catalog)).toEqual([]);
  });

  it("keeps up with 5 000 variants", () => {
    const many = Array.from({ length: 5000 }, (_, i) =>
      item(`Producto número ${i} de la tienda`, `SKU-${i}`),
    );
    const index = posSearchIndex(many);
    const started = performance.now();
    for (const query of ["p", "pr", "producto", "producto num", "numero 49", "tienda producto"]) {
      searchPosCatalog(index, query);
    }
    // Six searches: well under what a person notices per key on a phone several times slower than this machine.
    expect(performance.now() - started).toBeLessThan(300);
  });
});

describe("price and money at the counter", () => {
  const at = new Date("2026-10-31T12:00:00Z").getTime();

  it("a running promotion applies; one that ended does not", () => {
    expect(posItemPrice({ price: 100, promoPrice: 80, promoEndsAt: null }, at)).toBe(80);
    expect(posItemPrice({ price: 100, promoPrice: 80, promoEndsAt: "2026-11-01T00:00:00Z" }, at)).toBe(80);
    expect(posItemPrice({ price: 100, promoPrice: 80, promoEndsAt: "2026-10-30T00:00:00Z" }, at)).toBe(100);
    expect(posItemPrice({ price: 100, promoPrice: null, promoEndsAt: null }, at)).toBe(100);
  });

  it("adds in cents", () => {
    expect(
      posCartTotal([
        { unitPrice: 0.1, quantity: 3 },
        { unitPrice: 19.99, quantity: 2 },
      ]),
    ).toBe(40.28);
  });

  it("reads a comma from a Spanish keyboard", () => {
    expect(parseDecimal("12,5")).toBe(12.5);
    expect(parseDecimal(" 3.25 ")).toBe(3.25);
    expect(parseDecimal("abc")).toBeNaN();
  });
});

describe("summary of the day", () => {
  const now = new Date("2026-10-31T15:00:00");
  const sold = (
    extra = {},
    payments: { amount: number; currency?: string; changeAmount?: number; changeCurrency?: string }[] = [
      { amount: 100 },
    ],
  ) => ({
    sale: { soldAt: "2026-10-31T10:00:00", payments, ...extra },
  });

  it("per currency, as charged and net of the change", () => {
    const summary = posDaySummary(
      [
        sold(),
        sold({}, [{ amount: 50, currency: "USD", changeAmount: 1000, changeCurrency: "CUP" }]),
        sold({}, [{ amount: 900.5 }]),
      ],
      "CUP",
      now,
    );
    expect(summary).toEqual({
      count: 3,
      cash: [
        { currency: "CUP", amount: 0.5 },
        { currency: "USD", amount: 50 },
      ],
    });
  });

  it("voided sales and other days do not count", () => {
    expect(
      posDaySummary([sold({ voided: true }), sold({ soldAt: "2026-10-30T10:00:00" })], "CUP", now),
    ).toEqual({
      count: 0,
      cash: [],
    });
  });
});

describe("posSaleSchema", () => {
  const sale = {
    id: "11111111-1111-4111-8111-111111111111",
    deviceId: "22222222-2222-4222-8222-222222222222",
    localNumber: "AB12-1",
    soldAt: "2026-10-31T12:00:00.000Z",
    lines: [
      {
        variantId: "33333333-3333-4333-8333-333333333333",
        quantity: 1,
        unitPrice: 100,
        productName: "Arroz",
      },
    ],
    payments: [{ amount: 100 }],
  };

  it("accepts a sale", () => {
    expect(posSaleSchema.safeParse(sale).success).toBe(true);
  });

  it("refuses a sale without lines or with a bad quantity", () => {
    expect(posSaleSchema.safeParse({ ...sale, lines: [] }).success).toBe(false);
    expect(posSaleSchema.safeParse({ ...sale, lines: [{ ...sale.lines[0], quantity: 1.5 }] }).success).toBe(
      false,
    );
  });
});
