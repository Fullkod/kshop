import { z } from "zod";

/**
 * KSH0015: how a product is sold. «unit» is what every product did before (whole quantities); the rest take decimals
 * (2 at most, P2). The list is fixed in code; the database checks the same codes (products.sale_unit).
 */
export const SALE_UNITS = ["unit", "lb", "oz", "kg", "g", "l", "ml", "gal", "m", "cm", "yd", "ft", "m2"] as const;
export type SaleUnit = (typeof SALE_UNITS)[number];

export const SALE_UNIT_INFO: Record<SaleUnit, { label: string; abbr: string; step: number }> = {
  unit: { label: "Unidad", abbr: "u", step: 1 },
  lb: { label: "Libra", abbr: "lb", step: 0.5 },
  oz: { label: "Onza", abbr: "oz", step: 1 },
  kg: { label: "Kilogramo", abbr: "kg", step: 0.5 },
  g: { label: "Gramo", abbr: "g", step: 100 },
  l: { label: "Litro", abbr: "L", step: 0.5 },
  ml: { label: "Mililitro", abbr: "ml", step: 100 },
  gal: { label: "Galón", abbr: "gal", step: 1 },
  m: { label: "Metro", abbr: "m", step: 0.5 },
  cm: { label: "Centímetro", abbr: "cm", step: 10 },
  yd: { label: "Yarda", abbr: "yd", step: 0.5 },
  ft: { label: "Pie", abbr: "ft", step: 1 },
  m2: { label: "Metro cuadrado", abbr: "m²", step: 0.5 },
};

export const QUANTITY_DECIMALS = 2;
/** Whole units keep the old limit; measured quantities go higher (999 g is less than a kilo). */
export const MAX_UNIT_QUANTITY = 999;
export const MAX_MEASURED_QUANTITY = 99_999;

export const saleUnitSchema = z.enum(SALE_UNITS);

export function isSaleUnit(value: unknown): value is SaleUnit {
  return typeof value === "string" && (SALE_UNITS as readonly string[]).includes(value);
}

/** Unknown or missing (old rows, old apps) means «unit». */
export function toSaleUnit(value: unknown): SaleUnit {
  return isSaleUnit(value) ? value : "unit";
}

export function isMeasured(unit: SaleUnit | null | undefined): boolean {
  return !!unit && unit !== "unit";
}

/** Rounds to 2 decimals, half away from zero like Postgres round(numeric, 2). */
export function roundQuantity(n: number): number {
  const hundredths = Math.round(Math.abs(n) * 100 + 1e-9);
  return (Math.sign(n) * hundredths) / 100;
}

/** «1,5», «1.5», « 2 » → number; empty or not a number → null. Several decimals are rounded to 2. */
export function parseQuantity(text: string | number | null | undefined): number | null {
  if (typeof text === "number") return Number.isFinite(text) ? roundQuantity(text) : null;
  const clean = (text ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (clean === "" || !/^-?(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  return roundQuantity(Number(clean));
}

/** The step of the «− +» and the online minimum (P4): the product's own, or the unit's. */
export function quantityStep(unit: SaleUnit, step?: number | string | null): number {
  const own = step == null || step === "" ? null : Number(step);
  if (unit === "unit") return 1;
  return own && own > 0 ? roundQuantity(own) : SALE_UNIT_INFO[unit].step;
}

export function maxQuantity(unit: SaleUnit): number {
  return unit === "unit" ? MAX_UNIT_QUANTITY : MAX_MEASURED_QUANTITY;
}

/** Why a quantity is not valid for the unit, or null. */
export function quantityError(quantity: number, unit: SaleUnit, opts: { positive?: boolean } = {}): string | null {
  if (!Number.isFinite(quantity) || quantity < 0 || (opts.positive && quantity === 0)) return "Cantidad no válida.";
  if (quantity > maxQuantity(unit)) return `Máximo ${formatQuantity(maxQuantity(unit), unit)}.`;
  if (unit === "unit" && !Number.isInteger(quantity)) return "Este producto se vende por unidades enteras.";
  if (roundQuantity(quantity) !== quantity) return "Usa como mucho 2 decimales.";
  return null;
}

const numberFormat = new Intl.NumberFormat("es", { maximumFractionDigits: QUANTITY_DECIMALS, useGrouping: false });

/** «1,5 lb», «250 g»; units show the bare number («3»), or «3 u» with withUnit. */
export function formatQuantity(
  quantity: number | string | null | undefined,
  unit: SaleUnit | string | null | undefined,
  opts: { withUnit?: boolean } = {},
): string {
  const n = typeof quantity === "string" ? Number(quantity) : (quantity ?? 0);
  const u = toSaleUnit(unit);
  const text = numberFormat.format(Number.isFinite(n) ? n : 0);
  return u === "unit" && !opts.withUnit ? text : `${text} ${SALE_UNIT_INFO[u].abbr}`;
}

/** «/ lb» after a price; empty for units. */
export function perUnitSuffix(unit: SaleUnit | string | null | undefined): string {
  const u = toSaleUnit(unit);
  return u === "unit" ? "" : ` / ${SALE_UNIT_INFO[u].abbr}`;
}

/**
 * Total of a line: round(price × quantity, 2), the same as the database. Computed on integer hundredths so the phone
 * and the server never differ by a cent (0.1 + 0.2).
 */
export function lineTotal(unitPrice: number, quantity: number): number {
  const p = Math.round(unitPrice * 100);
  const q = Math.round(quantity * 100);
  const tenThousandths = p * q; // exact integer
  return roundQuantity(tenThousandths / 10_000);
}

/** P5: the quantity that a given amount buys, rounded to 2 decimals. */
export function quantityForAmount(amount: number, unitPrice: number): number {
  if (!(unitPrice > 0) || !(amount > 0)) return 0;
  return roundQuantity(amount / unitPrice);
}

/** A line counts as one product when it is measured (3 u + 42,5 lb is «4 products», not 45,5). */
export function countedQuantity(quantity: number, unit: SaleUnit | string | null | undefined): number {
  return toSaleUnit(unit) === "unit" ? quantity : 1;
}

/**
 * Zod schema of a quantity in requests: a number or a text with comma or dot, rounded to 2 decimals. Whether it must
 * be whole depends on the product's unit, which only the server knows: it checks with quantityError().
 */
export const quantityValueSchema = (opts: { positive?: boolean; max?: number } = {}) =>
  z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      const n = parseQuantity(v);
      if (n === null) {
        ctx.addIssue({ code: "custom", message: "Cantidad no válida." });
        return z.NEVER;
      }
      return n;
    })
    .pipe(
      z
        .number()
        .refine((n) => (opts.positive ? n > 0 : n >= 0), opts.positive ? "La cantidad tiene que ser mayor que 0." : "Cantidad no válida.")
        .refine((n) => n <= (opts.max ?? MAX_MEASURED_QUANTITY), `Máximo ${opts.max ?? MAX_MEASURED_QUANTITY}.`),
    );

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.\s]/g, "");

/** «lb», «Libra», «libras», «kg», «m²», «unidad»… (Excel, P3) → the unit; empty → undefined; unknown → null. */
export function saleUnitFromLabel(text: string): SaleUnit | null | undefined {
  const t = norm(text);
  if (!t) return undefined;
  for (const unit of SALE_UNITS) {
    const info = SALE_UNIT_INFO[unit];
    const names = [unit, norm(info.abbr), norm(info.label), `${norm(info.label)}s`, `${norm(info.label)}es`];
    if (names.includes(t)) return unit;
  }
  const aliases: Record<string, SaleUnit> = { u: "unit", ud: "unit", uds: "unit", unidades: "unit", lbs: "lb", libra: "lb", kilo: "kg", kilos: "kg", litros: "l", lt: "l", metro2: "m2", mt: "m", mts: "m" };
  return aliases[t] ?? null;
}
