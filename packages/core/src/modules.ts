// Module codes. Must match public.modules (seeded by a migration); a test checks both lists.
export const MODULE_CODES = [
  "catalog",
  "orders",
  "storefront",
  "shipping",
  "discounts",
  "vouchers",
  "themes",
  "excel_import",
  "mobile_app",
  "sales_today",
  "pos",
  "finance",
  "multi_warehouse",
  "multi_currency",
  "whatsapp_notifications",
  "custom_domain",
] as const;

export type ModuleCode = (typeof MODULE_CODES)[number];

/** Modules without a screen of their own in the admin (KSH0004: the online store is the public web, not a section). */
export const HEADLESS_MODULES: readonly ModuleCode[] = ["storefront"];

export function isModuleCode(value: string): value is ModuleCode {
  return (MODULE_CODES as readonly string[]).includes(value);
}

export type Entitlement = {
  moduleCode: ModuleCode;
  limits: Record<string, number>;
};
