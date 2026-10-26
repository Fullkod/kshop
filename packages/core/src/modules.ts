// Module codes. Must match public.modules (seeded by a migration); a test checks both lists.
export const MODULE_CODES = [
  "catalog",
  "orders",
  "shipping",
  "discounts",
  "vouchers",
  "themes",
  "excel_import",
  "mobile_app",
  "sales_today",
  "finance",
  "multi_warehouse",
  "multi_currency",
  "whatsapp_notifications",
  "custom_domain",
] as const;

export type ModuleCode = (typeof MODULE_CODES)[number];

export function isModuleCode(value: string): value is ModuleCode {
  return (MODULE_CODES as readonly string[]).includes(value);
}

export type Entitlement = {
  moduleCode: ModuleCode;
  limits: Record<string, number>;
};
