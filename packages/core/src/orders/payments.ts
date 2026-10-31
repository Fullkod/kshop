import type { CurrencyCode } from "../currency";

// KSH0002: a payment in the order currency or in another one at an agreed rate. In integer cents, like catalog/pricing.ts.

const toCents = (value: number) => Math.round(value * 100);
const fromCents = (cents: number) => cents / 100;

/** How a rate is read aloud: "1 USD = 320 CUP". The stronger currency is the unit; CUP is never it. */
export function rateQuote(
  paid: CurrencyCode,
  order: CurrencyCode,
): { unit: CurrencyCode; per: CurrencyCode } {
  return paid === "CUP" ? { unit: order, per: paid } : { unit: paid, per: order };
}

/** Units of the order currency per 1 of the paid currency, from a rate as quoted by rateQuote. */
export function quoteToOrderRate(quoted: number, paid: CurrencyCode, order: CurrencyCode): number {
  if (paid === order) return 1;
  return rateQuote(paid, order).unit === paid ? quoted : 1 / quoted;
}

/** "1 USD = 850 CUP", from what a payment stored; a quote of hundreds does not need the decimals of 1/850. */
export function formatRate(rateToOrder: number, paid: CurrencyCode, order: CurrencyCode): string {
  const { unit, per } = rateQuote(paid, order);
  const quote = unit === paid ? rateToOrder : 1 / rateToOrder;
  const digits = quote >= 100 ? 2 : 4;
  return `1 ${unit} = ${quote.toLocaleString("es", { maximumFractionDigits: digits })} ${per}`;
}

/** The quoted rate suggested by values of each currency in a common unit (elTOQUE's CUP, or the store's base). */
export function suggestedQuote(
  paid: CurrencyCode,
  order: CurrencyCode,
  values: Partial<Record<CurrencyCode, number>>,
): number | null {
  const { unit, per } = rateQuote(paid, order);
  const [a, b] = [values[unit], values[per]];
  return a && b ? Math.round((a / b) * 10_000) / 10_000 : null;
}

export type PaymentPreview = {
  /** In the order currency. */
  applied: number;
  missing: number;
  change: number;
  /** The same change, in the paid currency. */
  changeInPaid: number;
};

/** What a payment settles of the balance; without a known balance (shipping to agree) it all applies. */
export function paymentPreview(input: {
  amount: number;
  rateToOrder: number;
  remaining: number | null;
  sameCurrency: boolean;
}): PaymentPreview {
  let value = Math.round(toCents(input.amount) * input.rateToOrder);
  const remaining = input.remaining === null ? null : toCents(input.remaining);
  if (remaining === null || remaining <= 0) {
    return { applied: fromCents(value), missing: 0, change: 0, changeInPaid: 0 };
  }
  // A rate never lands exactly on the cent: within one cent of the balance, the payment settles it (same on the server).
  if (!input.sameCurrency && Math.abs(value - remaining) <= 1) value = remaining;
  const change = Math.max(0, value - remaining);
  return {
    applied: fromCents(Math.min(value, remaining)),
    missing: fromCents(Math.max(0, remaining - value)),
    change: fromCents(change),
    changeInPaid: fromCents(Math.round(change / input.rateToOrder)),
  };
}

/** How much of the paid currency settles the balance. */
export function amountToSettle(remaining: number, rateToOrder: number): number {
  return fromCents(Math.round(toCents(remaining) / rateToOrder));
}
