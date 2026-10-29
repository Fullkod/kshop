import type { ConfigurableSection } from "@kshop/core";

// R12: which admin section a store write belongs to, by its path after /api/v1/stores/{id}/. The first matching prefix
// wins, so the more specific ones go first. Writes not listed belong to a basic section (orders, catalog, team,
// customers) or to the public endpoints, and are never blocked by visibility. A test checks that every write route
// is either here or in SECTION_FREE_WRITES.
//
// Known gap: catalog/currencies serves both Catálogo › Monedas (basic) and Monedas (multi_currency), so it stays
// with the catalog: a managed «Monedas» can still be edited from Catálogo › Monedas.
export const SECTION_WRITES: readonly (readonly [prefix: string, section: ConfigurableSection])[] = [
  ["checkout-settings/zones", "shipping"],
  ["checkout-settings/methods", "shipping"],
  ["promotions", "discounts"],
  ["vouchers", "vouchers"],
  ["notification-contacts", "whatsapp_notifications"],
  ["notifications", "whatsapp_notifications"],
  ["whatsapp-templates", "whatsapp_notifications"],
  ["catalog/imports", "excel_import"],
  ["catalog/stock", "multi_warehouse"],
  ["warehouses", "multi_warehouse"],
  ["content", "themes"],
  ["custom-domain", "custom_domain"],
  ["mobile-app", "mobile_app"],
  ["finance", "finance"],
];

/** Write routes that are never blocked by section visibility (basic sections and public endpoints). */
export const SECTION_FREE_WRITES: readonly string[] = [
  "cart",
  "checkout",
  "customer",
  "customer-auth",
  "staff-auth",
  "customers",
  "orders",
  "team",
  "catalog",
  "checkout-settings/payment-methods",
];

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Section of a write, given the path after /api/v1/stores/{id}/ (e.g. "promotions/123"). */
export function sectionOfWrite(path: string): ConfigurableSection | null {
  return SECTION_WRITES.find(([prefix]) => matches(path, prefix))?.[1] ?? null;
}

export function isSectionFreeWrite(path: string): boolean {
  return SECTION_FREE_WRITES.some((prefix) => matches(path, prefix));
}
