import { z } from "zod";
import { MODULE_CODES } from "./modules";
import { PLAN_CODES } from "./platform";

// Phase 5: plans, add-ons, grants and manual invoices. Always USD, paid in person (cash by default).

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];
export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = { month: "Mensual", year: "Anual" };

export const INVOICE_STATUSES = ["pending", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending: "Pendiente",
  paid: "Pagada",
  void: "Anulada",
};

export const GRANT_TYPES = ["free_days", "discount_percent", "price_lock"] as const;
export type GrantType = (typeof GRANT_TYPES)[number];
export const GRANT_TYPE_LABELS: Record<GrantType, string> = {
  free_days: "Días gratis",
  discount_percent: "Descuento %",
  price_lock: "Precio congelado (fundador)",
};

export const PAYMENT_METHODS = ["cash", "transfer", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  other: "Otro",
};

export const MODULE_SOURCE_LABELS: Record<string, string> = {
  plan: "Del plan",
  addon: "Suelto",
  grant: "Regalo",
};

const usd = z.coerce
  .number()
  .min(0, "No puede ser negativo.")
  .max(100000)
  .multipleOf(0.01, "Máximo 2 decimales.");
const limit = z.coerce.number().int().min(0).max(1000000).nullable();
const isoDate = z.iso.datetime({ offset: true, error: "Fecha no válida." });
const reason = z.string().trim().max(300).optional();
const moduleCode = z.enum(MODULE_CODES);

export const planUpdateSchema = z.object({
  price: usd,
  yearlyPrice: usd.nullable(),
  isPublic: z.boolean().default(true),
  modules: z.array(moduleCode).min(1),
  limits: z.object({ maxProducts: limit, maxStaff: limit }),
});
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;

export const moduleAddonPriceSchema = z.object({ addonPrice: usd.nullable() });

export const changePlanSchema = z.object({
  planCode: z.enum(PLAN_CODES),
  interval: z.enum(BILLING_INTERVALS).default("month"),
});
export type ChangePlanInput = z.infer<typeof changePlanSchema>;

export const storeAddonSchema = z.object({ moduleCode, enabled: z.boolean() });

export const storeModuleGrantSchema = z.object({
  moduleCode,
  enabled: z.boolean(),
  endsAt: isoDate.nullable().optional(),
  reason,
});

export const subscriptionGrantSchema = z
  .object({
    type: z.enum(GRANT_TYPES),
    value: z.coerce.number().min(0).max(100000),
    reason,
    endsAt: isoDate.nullable().optional(),
  })
  .refine((g) => g.type !== "discount_percent" || (g.value >= 1 && g.value <= 100), {
    path: ["value"],
    message: "Entre 1 y 100.",
  })
  .refine((g) => g.type !== "free_days" || (Number.isInteger(g.value) && g.value >= 1 && g.value <= 365), {
    path: ["value"],
    message: "De 1 a 365 días.",
  });
export type SubscriptionGrantInput = z.infer<typeof subscriptionGrantSchema>;

export const subscriptionUpdateSchema = z.object({
  priceOverride: usd.nullable().optional(),
  limitOverrides: z.object({ maxProducts: limit.optional(), maxStaff: limit.optional() }).optional(),
  founder: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
  cancelAt: isoDate.nullable().optional(),
  comped: z.boolean().optional(),
});
export type SubscriptionUpdateInput = z.infer<typeof subscriptionUpdateSchema>;

export const platformPaymentSchema = z.object({
  amount: z.coerce.number().positive("Debe ser mayor que cero.").max(100000).multipleOf(0.01),
  method: z.enum(PAYMENT_METHODS).default("cash"),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  paidAt: isoDate.optional(),
});
export type PlatformPaymentInput = z.infer<typeof platformPaymentSchema>;

export const invoiceAdjustmentSchema = z.object({
  description: z.string().trim().min(1, "Obligatorio.").max(200),
  amount: z.coerce
    .number()
    .refine((v) => v !== 0, "No puede ser cero.")
    .refine((v) => Math.abs(v) <= 100000, "Demasiado alto."),
});

export const invoiceVoidSchema = z.object({ reason: z.string().trim().max(300).optional() });

export const billingSettingsSchema = z.object({
  invoiceLeadDays: z.coerce.number().int().min(0).max(60),
  invoiceDueDays: z.coerce.number().int().min(1).max(60),
  graceDays: z.coerce.number().int().min(0).max(60),
  trialReminderDays: z.coerce.number().int().min(0).max(60),
  defaultTrialDays: z.coerce.number().int().min(0).max(365),
  billingInstructions: z.string().trim().max(500),
  supportWhatsapp: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{8,15}$/, "Escribe el teléfono con código de país (ej. +5351234567).")
    .nullable(),
});
export type BillingSettingsInput = z.infer<typeof billingSettingsSchema>;

/** "5 USD" / "4,50 USD" (USD only). */
export function formatUsd(amount: number): string {
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2).replace(".", ",")} USD`;
}

// ---- Team (D20): the owner manages admins and staff; admins manage staff ----

export const TEAM_ROLES = ["admin", "staff"] as const;
export const teamInviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Email no válido.")),
  role: z.enum(TEAM_ROLES).default("staff"),
});
export type TeamInviteInput = z.infer<typeof teamInviteSchema>;
export const teamRoleSchema = z.object({ role: z.enum(TEAM_ROLES) });
