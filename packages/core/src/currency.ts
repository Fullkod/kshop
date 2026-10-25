import { z } from "zod";

// MLC no longer exists (decision 17).
export const CURRENCY_CODES = ["CUP", "USD", "EUR"] as const;
export const currencyCodeSchema = z.enum(CURRENCY_CODES);
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;
