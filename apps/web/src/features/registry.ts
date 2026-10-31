import type { ModuleCode } from "@kshop/core";
import { catalogModule } from "./catalog/module";
import { ordersModule } from "./orders/module";
import { shippingModule } from "./shipping/module";
import { discountsModule } from "./discounts/module";
import { vouchersModule } from "./vouchers/module";
import { themesModule } from "./themes/module";
import { excelImportModule } from "./excel-import/module";
import { mobileAppModule } from "./mobile-app/module";
import { posModule } from "./pos/module";
import { salesTodayModule } from "./sales-today/module";
import { financeModule } from "./finance/module";
import { multiWarehouseModule } from "./multi-warehouse/module";
import { multiCurrencyModule } from "./multi-currency/module";
import { whatsappNotificationsModule } from "./whatsapp-notifications/module";
import { customDomainModule } from "./custom-domain/module";
import type { AdminModule } from "./types";

/** Central module registry: the admin menu and module pages are built from it. Order = menu order inside each group. */
export const ADMIN_MODULES: readonly AdminModule[] = [
  ordersModule,
  shippingModule,
  discountsModule,
  vouchersModule,
  whatsappNotificationsModule,
  catalogModule,
  excelImportModule,
  multiWarehouseModule,
  multiCurrencyModule,
  themesModule,
  customDomainModule,
  mobileAppModule,
  salesTodayModule,
  posModule,
  financeModule,
];

export function getAdminModule(code: ModuleCode): AdminModule | undefined {
  return ADMIN_MODULES.find((m) => m.code === code);
}

export function getAdminModuleByPath(segment: string): AdminModule | undefined {
  return ADMIN_MODULES.find((m) => m.adminPath === `/admin/${segment}`);
}
