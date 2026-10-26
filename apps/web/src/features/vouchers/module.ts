import type { AdminModule } from "../types";

// Coupons and the manual discount (Pro or add-on); its screens live with the discounts feature.
export const vouchersModule: AdminModule = {
  code: "vouchers",
  label: "Cupones",
  adminPath: "/admin/discounts/vouchers",
  availableInPhase: 4,
};
