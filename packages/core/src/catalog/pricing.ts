// Money math in integer cents to avoid floating point drift.

const toCents = (value: number) => Math.round(value * 100);
const fromCents = (cents: number) => cents / 100;

/**
 * Converts a base-currency price into another currency of the store.
 * `rateToBase` = base units per 1 unit of the target (1 USD = 300 CUP -> 300).
 * `rounding` rounds up to a multiple (e.g. 5 -> 1503 CUP becomes 1505); without it, to cents.
 */
export function convertFromBase(basePrice: number, rateToBase: number, rounding?: number | null): number {
  if (rateToBase <= 0) throw new Error("rateToBase must be positive");
  const cents = toCents(basePrice) / rateToBase;
  if (!rounding) return fromCents(Math.round(cents));
  const step = toCents(rounding);
  return fromCents(Math.ceil(Math.round(cents * 1000) / 1000 / step) * step);
}

/** Converts an amount in a store currency into the base currency (for costs and margins). */
export function convertToBase(amount: number, rateToBase: number): number {
  return fromCents(Math.round(toCents(amount) * rateToBase));
}

/**
 * Gross margin of a sale price over a cost, both in base currency. null when there is no cost or price.
 * 1500 CUP price, 5 USD cost at 200 -> cost 1000 CUP -> margin 33.3 %.
 */
export function marginPercent(priceBase: number, costBase: number | null | undefined): number | null {
  if (costBase == null || priceBase <= 0) return null;
  return Math.round(((priceBase - costBase) / priceBase) * 1000) / 10;
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
