import type { HelpContext } from "../types";

// Most specific first: the first prefix that matches wins.
const ADMIN_PREFIXES: [string, HelpContext][] = [
  ["/admin/orders/new", "order-new"],
  ["/admin/orders/customers", "customers"],
  ["/admin/orders/payment-methods", "payment-methods"],
  ["/admin/discounts/vouchers", "vouchers"],
  ["/admin/whatsapp-notifications/templates", "whatsapp-templates"],
  ["/admin/whatsapp-notifications/log", "whatsapp-log"],
  ["/admin/whatsapp-notifications", "whatsapp"],
  ["/admin/catalog/products", "product"],
  ["/admin/catalog/categories", "categories"],
  ["/admin/catalog/attributes", "attributes"],
  ["/admin/catalog/product-types", "product-types"],
  ["/admin/catalog/brands", "brands"],
  ["/admin/catalog/collections", "collections"],
  ["/admin/catalog/warehouses", "warehouses"],
  ["/admin/catalog/currencies", "currencies"],
  ["/admin/catalog", "products"],
  ["/admin/multi-warehouse/movements", "multi-warehouse-movements"],
  ["/admin/multi-warehouse/transfer", "multi-warehouse-transfer"],
  ["/admin/multi-warehouse", "multi-warehouse"],
  ["/admin/themes/home", "themes-home"],
  ["/admin/themes/banners", "themes-banners"],
  ["/admin/themes/menus", "themes-menus"],
  ["/admin/themes/pages", "themes-pages"],
  ["/admin/themes", "themes"],
  ["/admin/finance/breakdown", "finance-breakdown"],
  ["/admin/finance/expenses", "finance-expenses"],
  ["/admin/finance/inventory", "finance-inventory"],
  ["/admin/finance/margin", "finance-margin"],
  ["/admin/finance", "finance"],
  ["/admin/shipping", "shipping"],
  ["/admin/discounts", "discounts"],
  ["/admin/excel-import", "excel-import"],
  ["/admin/multi-currency", "multi-currency"],
  ["/admin/custom-domain", "custom-domain"],
  ["/admin/mobile-app", "mobile-app"],
  ["/admin/sales-today", "sales-today"],
  // Kshop Admin's «Ventas» tab.
  ["/admin/sales", "sales-today"],
  ["/admin/pos", "pos"],
  ["/admin/billing", "billing"],
  ["/admin/team", "team"],
  ["/superadmin/stores/new", "superadmin-store-new"],
  ["/superadmin/stores", "superadmin-store"],
  ["/superadmin/plans", "superadmin-plans"],
  ["/superadmin/billing", "superadmin-billing"],
  ["/superadmin/domains", "superadmin-domains"],
  ["/superadmin/apps", "superadmin-apps"],
  ["/superadmin/whatsapp", "superadmin-whatsapp"],
];

/**
 * The help context of a screen, from its path (store admin as the staff sees it, Kshop Admin or superadmin). Tabs
 * that are routes get their own context; the Caja's two tabs (local state) share `pos`. Unknown admin paths fall
 * back to Inicio's guides.
 */
export function helpContextForPath(pathname: string): HelpContext {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const [prefix, context] of ADMIN_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return context;
  }
  // After the named subpages (new, customers…): anything else under /admin/orders/ is one order.
  if (path.startsWith("/admin/orders/")) return "order";
  if (path === "/admin/orders") return "orders";
  return path.startsWith("/superadmin") ? "superadmin-stores" : "home";
}
