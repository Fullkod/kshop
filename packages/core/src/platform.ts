import { z } from "zod";
import { currencyCodeSchema } from "./currency";
import { storeSlugSchema } from "./slug";

export const STORE_STATUSES = ["active", "suspended", "archived"] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const PLAN_CODES = ["base", "pro"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{8,15}$/, "Escribe el teléfono con código de país, solo números (ej. +5351234567).");

export const createStoreInputSchema = z.object({
  name: z.string().trim().min(2, "El nombre es muy corto.").max(80),
  slug: storeSlugSchema,
  ownerEmail: z.string().trim().toLowerCase().pipe(z.email("Email no válido.")),
  baseCurrency: currencyCodeSchema.default("CUP"),
  orderPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,6}$/, "De 1 a 6 letras o números."),
  whatsappPhone: phoneSchema.optional(),
  planCode: z.enum(PLAN_CODES).default("base"),
  trialDays: z.number().int().min(0).max(365).default(30),
});
export type CreateStoreInput = z.infer<typeof createStoreInputSchema>;

export const updateStoreStatusInputSchema = z.object({
  status: z.enum(STORE_STATUSES),
});
