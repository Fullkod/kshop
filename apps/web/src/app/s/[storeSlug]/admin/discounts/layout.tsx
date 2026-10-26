"use client";

import { Alert } from "@kshop/ui";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DiscountsNav } from "@/features/discounts/components/DiscountsPages";
import { useAdmin } from "../admin-context";

// Ofertas (promotions, module discounts) and Cupones (module vouchers) share this section; each page needs its own.
export default function DiscountsLayout({ children }: { children: ReactNode }) {
  const admin = useAdmin();
  const pathname = usePathname();
  const onVouchers = pathname.startsWith("/admin/discounts/vouchers");
  if (!admin.enabledModules.has(onVouchers ? "vouchers" : "discounts")) {
    return (
      <Alert variant="destructive">
        {onVouchers
          ? "Los cupones no están incluidos en el plan de tu tienda."
          : "Las ofertas no están incluidas en el plan de tu tienda."}
      </Alert>
    );
  }
  return (
    <div className="max-w-6xl">
      <h1 className="mb-4 text-2xl font-semibold">{onVouchers ? "Cupones" : "Ofertas"}</h1>
      <DiscountsNav />
      {children}
    </div>
  );
}
