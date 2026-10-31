import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  amountToSettle,
  canTransition,
  checkoutSchema,
  customerRegisterSchema,
  isStalePending,
  needsShippingCost,
  normalizePhone,
  orderPaymentSchema,
  orderWhatsappText,
  paymentPreview,
  quoteToOrderRate,
  rateQuote,
  shippingMethodSchema,
  suggestedQuote,
  type WhatsappOrder,
} from "../index";

describe("normalizePhone", () => {
  it.each([
    ["51234567", "+5351234567"],
    ["5123 4567", "+5351234567"],
    ["+53 5 123-4567", "+5351234567"],
    ["0053 51234567", "+5351234567"],
    ["53 51234567", "+5351234567"],
    ["(+1) 305 555 0100", "+13055550100"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "abc", "1234", "+0123456789"])("rejects %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it("the same person always gets the same phone (one account per store)", () => {
    expect(
      customerRegisterSchema.parse({ firstName: "Ana", phone: "5123-4567", password: "secreta123" }).phone,
    ).toBe(
      customerRegisterSchema.parse({ firstName: "Ana", phone: "+53 51234567", password: "secreta123" }).phone,
    );
  });
});

describe("order states", () => {
  it("matches the SQL transition table (private.order_transition_allowed)", () => {
    const dir = join(import.meta.dirname, "../../../../supabase/migrations");
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    const body = /function private\.order_transition_allowed[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)?.[1] ?? "";
    const pairs = [...body.matchAll(/\('(\w+)', '(\w+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const core = ORDER_STATUSES.flatMap((from) =>
      ORDER_TRANSITIONS[from].map((to) => `${from}>${to}`),
    ).sort();
    expect(pairs.length).toBeGreaterThan(0);
    expect(core).toEqual(pairs);
  });

  it("allows the klauShop flow and blocks jumps", () => {
    expect(canTransition("pending_confirmation", "paid")).toBe(true);
    expect(canTransition("pending_confirmation", "delivered")).toBe(false);
    expect(canTransition("delivered", "paid")).toBe(false);
  });

  it("needs a shipping cost to confirm or mark paid", () => {
    expect(needsShippingCost("pending_payment", null)).toBe(true);
    expect(needsShippingCost("paid", 0)).toBe(false);
    expect(needsShippingCost("shipped", null)).toBe(false);
  });

  it("flags pending orders older than 48 h", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    expect(isStalePending("pending_payment", new Date("2026-10-25T11:00:00Z"), now)).toBe(true);
    expect(isStalePending("pending_payment", new Date("2026-10-26T11:00:00Z"), now)).toBe(false);
    expect(isStalePending("paid", new Date("2026-10-01T11:00:00Z"), now)).toBe(false);
  });
});

describe("schemas", () => {
  it("normalizes the checkout phone and drops empty optional texts", () => {
    const input = checkoutSchema.parse({
      idempotencyKey: "abcdefgh",
      customer: { name: " Ana ", phone: "5123 4567" },
      shipping: { address: "" },
      note: "",
    });
    expect(input.customer).toEqual({ name: "Ana", phone: "+5351234567" });
    expect(input.shipping.address).toBeUndefined();
    expect(input.note).toBeUndefined();
  });

  it("pickup needs a warehouse and to_agree has no price", () => {
    expect(shippingMethodSchema.safeParse({ type: "pickup", name: "Tienda" }).success).toBe(false);
    expect(shippingMethodSchema.safeParse({ type: "to_agree", name: "A convenir", price: 5 }).success).toBe(
      false,
    );
    expect(shippingMethodSchema.safeParse({ type: "delivery", name: "Mensajería", price: 200 }).success).toBe(
      true,
    );
  });
});

describe("orderWhatsappText", () => {
  const order: WhatsappOrder = {
    code: "DEMO-1001",
    storeName: "Tienda Demo",
    customerName: "Ana",
    currency: "CUP",
    lines: [{ name: "Vestido (M)", quantity: 2, lineTotal: 3000 }],
    subtotal: 3000,
    shippingType: "to_agree",
    shippingTotal: null,
    total: null,
    url: "https://demo.kshop.fullkod.com/order/abc",
  };

  it("says the total is pending while the shipping is to agree, and ends with the link", () => {
    const text = orderWhatsappText(order);
    expect(text).toContain("DEMO-1001");
    expect(text).toContain("A convenir");
    expect(text).toContain("Total: a confirmar");
    expect(text.trimEnd().endsWith(order.url)).toBe(true);
  });

  it("summarizes long orders", () => {
    const lines = Array.from({ length: 80 }, (_, i) => ({
      name: `Producto con un nombre bastante largo número ${i}`,
      quantity: 1,
      lineTotal: 100,
    }));
    const text = orderWhatsappText({ ...order, lines });
    expect(text.length).toBeLessThanOrEqual(1800);
    expect(text).toMatch(/… y \d+ productos más/);
    expect(text).toContain(order.url);
  });
});

describe("payments in another currency (KSH0002)", () => {
  it("50 USD at 320 of 20 000 CUP leaves 4 000 CUP", () => {
    expect(paymentPreview({ amount: 50, rateToOrder: 320, remaining: 20_000, sameCurrency: false })).toEqual({
      applied: 16_000,
      missing: 4_000,
      change: 0,
      changeInPaid: 0,
    });
  });

  it("gives change in either currency when it pays too much", () => {
    expect(paymentPreview({ amount: 50, rateToOrder: 320, remaining: 15_000, sameCurrency: false })).toEqual({
      applied: 15_000,
      missing: 0,
      change: 1_000,
      changeInPaid: 3.13,
    });
  });

  it("settles when the rate lands within one cent of the balance", () => {
    const rate = quoteToOrderRate(333, "CUP", "USD");
    const preview = paymentPreview({
      amount: 5770.89,
      rateToOrder: rate,
      remaining: 17.33,
      sameCurrency: false,
    });
    expect(preview).toMatchObject({ applied: 17.33, missing: 0, change: 0 });
  });

  it("does not round a payment in the same currency", () => {
    expect(
      paymentPreview({ amount: 99.99, rateToOrder: 1, remaining: 100, sameCurrency: true }).missing,
    ).toBe(0.01);
  });

  it("without a known balance it all applies", () => {
    expect(
      paymentPreview({ amount: 10, rateToOrder: 320, remaining: null, sameCurrency: false }),
    ).toMatchObject({
      applied: 3_200,
      change: 0,
    });
  });

  it("quotes with the stronger currency as the unit", () => {
    expect(rateQuote("USD", "CUP")).toEqual({ unit: "USD", per: "CUP" });
    expect(rateQuote("CUP", "USD")).toEqual({ unit: "USD", per: "CUP" });
    expect(quoteToOrderRate(320, "USD", "CUP")).toBe(320);
    expect(quoteToOrderRate(320, "CUP", "USD")).toBe(1 / 320);
    expect(suggestedQuote("USD", "CUP", { CUP: 1, USD: 320 })).toBe(320);
    expect(suggestedQuote("CUP", "USD", { CUP: 1, USD: 320 })).toBe(320);
    expect(suggestedQuote("EUR", "CUP", { CUP: 1, USD: 320 })).toBeNull();
  });

  it("knows how much of the other currency settles the balance", () => {
    expect(amountToSettle(4_000, 320)).toBe(12.5);
    expect(amountToSettle(17.33, 1 / 333)).toBe(5770.89);
  });

  it("the change needs its currency", () => {
    expect(orderPaymentSchema.safeParse({ amount: 50, changeAmount: 3 }).success).toBe(false);
    expect(orderPaymentSchema.safeParse({ amount: 50, changeAmount: 3, changeCurrency: "CUP" }).success).toBe(
      true,
    );
  });
});
