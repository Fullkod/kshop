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
  return roundPrice(toCents(basePrice) / rateToBase, rounding);
}

/** Cents to an amount: to the cent, or up to a multiple of `rounding` (5 -> 1503 becomes 1505). */
function roundPrice(cents: number, rounding?: number | null): number {
  if (!rounding) return fromCents(Math.round(cents));
  const step = toCents(rounding);
  return fromCents(Math.ceil(Math.round(cents * 1000) / 1000 / step) * step);
}

/** Cost of one unit when a lot was bought at once: a bag of 160 candies for 250 -> 1.56 (to the cent, like variant_costs). */
export function unitCost(lotCost: number, units: number): number {
  if (units <= 0) throw new Error("units must be positive");
  return fromCents(Math.round(toCents(lotCost) / units));
}

export type MarginBasis = "cost" | "price";

/**
 * Sale price from a unit cost and a commercial margin, both in the same currency.
 * `basis` "cost": the margin is added to the cost (100 at 30 % -> 130).
 * `basis` "price": the margin is the share of the sale price, what marginPercent reports (100 at 30 % -> 142.86).
 * `rounding` rounds up to a multiple (5 -> 143 becomes 145); without it, to cents.
 */
export function priceFromCost(
  cost: number,
  margin: number,
  basis: MarginBasis,
  rounding?: number | null,
): number {
  if (cost < 0 || margin < 0) throw new Error("cost and margin must not be negative");
  if (basis === "price" && margin >= 100) throw new Error("a margin over the price must be below 100 %");
  const cents = basis === "cost" ? toCents(cost) * (1 + margin / 100) : toCents(cost) / (1 - margin / 100);
  return roundPrice(cents, rounding);
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
