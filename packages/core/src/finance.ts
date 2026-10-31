import { z } from "zod";
import { currencyCodeSchema } from "./currency";

// Phase 6: Finanzas (module finance, owner/admin). Days are Havana days; amounts stay in the currency they were
// sold in, plus an «Equivalente» in the currency the owner picks.

export const FINANCE_MAX_DAYS = 366;

/** Common query of every report: ?from=YYYY-MM-DD&to=YYYY-MM-DD&currency=CUP */
export const financePeriodSchema = z
  .object({
    from: z.iso.date({ error: "Fecha no válida." }),
    to: z.iso.date({ error: "Fecha no válida." }),
    currency: currencyCodeSchema,
  })
  .refine((v) => v.from <= v.to, { message: "La fecha final va después de la inicial.", path: ["to"] })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 < FINANCE_MAX_DAYS, {
    message: "El periodo es de un año como máximo.",
    path: ["from"],
  });
export type FinancePeriod = z.infer<typeof financePeriodSchema>;

export const MARGIN_GROUPS = ["product", "category", "brand"] as const;
export type MarginGroup = (typeof MARGIN_GROUPS)[number];
export const MARGIN_GROUP_LABELS: Record<MarginGroup, string> = {
  product: "Producto",
  category: "Categoría",
  brand: "Marca",
};

export const INVENTORY_FILTERS = ["all", "low", "out", "stale"] as const;
export type InventoryFilter = (typeof INVENTORY_FILTERS)[number];
export const INVENTORY_FILTER_LABELS: Record<InventoryFilter, string> = {
  all: "Todo",
  low: "Pocas unidades",
  out: "Agotados",
  stale: "Sin movimiento",
};

export const financeInventoryQuerySchema = z.object({
  currency: currencyCodeSchema,
  warehouseId: z.uuid().optional(),
  filter: z.enum(INVENTORY_FILTERS).default("all"),
  staleDays: z.coerce.number().int().min(1).max(3650).default(60),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type FinanceInventoryQuery = z.infer<typeof financeInventoryQuerySchema>;

export const ORDER_CHANNEL_LABELS: Record<string, string> = { web: "Tienda web", app: "App", admin: "Admin", pos: "Mostrador" };

/** Manual expenses (net profit = margin − expenses). */
export const expenseInputSchema = z.object({
  spentOn: z.iso.date({ error: "Fecha no válida." }),
  category: z.string().trim().min(1, "Indica en qué fue el gasto.").max(60, "Máximo 60 caracteres."),
  amount: z.coerce
    .number({ error: "Escribe un número." })
    .positive("Debe ser mayor que 0.")
    .max(9_999_999_999.99)
    .transform((v) => Math.round(v * 100) / 100),
  currency: currencyCodeSchema,
  note: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
});
export type ExpenseInput = z.infer<typeof expenseInputSchema>;

/** Usual expense categories offered in the form (free text is allowed). */
export const EXPENSE_CATEGORY_SUGGESTIONS = [
  "Mensajería",
  "Compra de mercancía",
  "Alquiler",
  "Salarios",
  "Publicidad",
  "Envases y bolsas",
  "Transporte",
  "Electricidad",
  "Otros",
];
