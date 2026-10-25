import { z } from "zod";

// Promotions, vouchers and discounts of /api/v1 (PRP-4 D2–D10). Amounts of fixed rewards and minimums are in
// the store's base currency; the SQL engine converts them with the order rate.

export const DISCOUNT_REWARDS = ["percent", "fixed"] as const;
export type DiscountReward = (typeof DISCOUNT_REWARDS)[number];
export const DISCOUNT_TARGETS = ["product", "variant", "category", "collection", "brand"] as const;
export type DiscountTarget = (typeof DISCOUNT_TARGETS)[number];
export const VOUCHER_SCOPES = ["order", "specific", "shipping"] as const;
export type VoucherScope = (typeof VOUCHER_SCOPES)[number];

export const DISCOUNT_TARGET_LABELS: Record<DiscountTarget, string> = {
  product: "Producto",
  variant: "Variante",
  category: "Categoría",
  collection: "Colección",
  brand: "Marca",
};
export const VOUCHER_SCOPE_LABELS: Record<VoucherScope, string> = {
  order: "Todo el pedido",
  specific: "Solo ciertos productos",
  shipping: "El envío",
};

const text = (min: number, max: number) =>
  z.string().trim().min(min, "Obligatorio.").max(max, `Máximo ${max} caracteres.`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);
const amount = z.coerce
  .number({ error: "Escribe un número." })
  .positive("Debe ser mayor que 0.")
  .max(9_999_999_999.99)
  .transform((v) => Math.round(v * 100) / 100);
const optionalAmount = amount.nullable().default(null);
const optionalCount = z.coerce.number().int().min(1, "Mínimo 1.").max(1_000_000).nullable().default(null);
const date = z.iso.datetime({ offset: true, error: "Fecha no válida." });

/** Voucher code as the customer types it: any case, stored uppercase. */
export const voucherCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,40}$/, "De 3 a 40 letras, números, - o _ (sin espacios).");

export const discountTargetSchema = z.object({ type: z.enum(DISCOUNT_TARGETS), id: z.uuid() });

const rewardRefine = (v: { reward: DiscountReward; value: number }, ctx: z.RefinementCtx) => {
  if (v.reward === "percent" && v.value > 100)
    ctx.addIssue({ code: "custom", path: ["value"], message: "Un porcentaje no puede pasar de 100." });
};
const datesRefine = (v: { startsAt?: string | null; endsAt: string | null }, ctx: z.RefinementCtx) => {
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt)
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Debe terminar después de empezar." });
};

export const promotionSchema = z
  .object({
    name: text(1, 80),
    description: optionalText(500),
    reward: z.enum(DISCOUNT_REWARDS),
    value: amount,
    startsAt: date.optional(),
    endsAt: date.nullable().default(null),
    isActive: z.boolean().default(true),
    priority: z.coerce.number().int().min(-100).max(100).default(0),
    targets: z.array(discountTargetSchema).min(1, "Elige a qué productos se aplica.").max(200),
  })
  .superRefine(rewardRefine)
  .superRefine(datesRefine);
export type PromotionInput = z.infer<typeof promotionSchema>;

export const voucherSchema = z
  .object({
    code: voucherCodeSchema,
    name: text(1, 80),
    scope: z.enum(VOUCHER_SCOPES).default("order"),
    reward: z.enum(DISCOUNT_REWARDS),
    value: amount,
    minSubtotal: optionalAmount,
    minQuantity: optionalCount,
    usageLimit: optionalCount,
    usagePerCustomer: optionalCount,
    startsAt: date.optional(),
    endsAt: date.nullable().default(null),
    isActive: z.boolean().default(true),
    targets: z.array(discountTargetSchema).max(200).default([]),
  })
  .superRefine(rewardRefine)
  .superRefine(datesRefine)
  .superRefine((v, ctx) => {
    if (v.scope === "specific" && v.targets.length === 0)
      ctx.addIssue({ code: "custom", path: ["targets"], message: "Elige a qué productos se aplica." });
  });
export type VoucherInput = z.infer<typeof voucherSchema>;

/** Code typed in the cart (null removes it). */
export const cartVoucherSchema = z.object({
  token: z.uuid().optional(),
  code: voucherCodeSchema.nullable(),
});
export type CartVoucherInput = z.infer<typeof cartVoucherSchema>;

/** Manual discount of an admin order (D10): fixed amounts are in the order currency. */
export const manualDiscountSchema = z
  .object({
    reward: z.enum(DISCOUNT_REWARDS),
    value: amount,
    reason: optionalText(300),
  })
  .superRefine(rewardRefine);
export type ManualDiscountInput = z.infer<typeof manualDiscountSchema>;

/** "-20 %" or "-300 CUP" style label of a reward. */
export function rewardLabel(reward: DiscountReward, value: number, currency: string): string {
  return reward === "percent" ? `-${Number(value)} %` : `-${Number(value)} ${currency}`;
}

/** Percent saved from a list price (for the storefront badge), rounded down. */
export function savingPercent(listPrice: number, price: number): number {
  return listPrice > 0 && price < listPrice ? Math.floor(((listPrice - price) / listPrice) * 100) : 0;
}

// Dates of promotions and vouchers are typed and shown in Cuba's time zone (America/Havana, with DST).
export const STORE_TIME_ZONE = "America/Havana";

function zoneOffsetMinutes(utc: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(utc)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!);
  return Math.round((asUtc - Math.floor(utc.getTime() / 60000) * 60000) / 60000);
}

/** "2026-11-27T00:00" in Havana -> ISO instant (null for an empty input). */
export function localToIso(local: string, timeZone = STORE_TIME_ZONE): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const naive = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  const offset = zoneOffsetMinutes(new Date(naive), timeZone);
  return new Date(naive - offset * 60000).toISOString();
}

/** ISO instant -> "2026-11-27T00:00" in Havana (for datetime-local inputs). */
export function isoToLocal(iso: string | null | undefined, timeZone = STORE_TIME_ZONE): string {
  if (!iso) return "";
  const date = new Date(iso);
  const local = new Date(date.getTime() + zoneOffsetMinutes(date, timeZone) * 60000);
  return local.toISOString().slice(0, 16);
}
