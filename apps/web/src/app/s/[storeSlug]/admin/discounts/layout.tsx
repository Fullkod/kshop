"use client";

import { Alert } from "@kshop/ui";
import type { ReactNode } from "react";
import { DiscountsNav } from "@/features/discounts/components/DiscountsPages";
import { useAdmin } from "../admin-context";

export default function DiscountsLayout({ children }: { children: ReactNode }) {
  const admin = useAdmin();
  if (!admin.enabledModules.has("discounts")) {
    return <Alert variant="destructive">Los descuentos no están incluidos en el plan de tu tienda.</Alert>;
  }
  return (
    <div className="max-w-6xl">
      <h1 className="mb-4 text-2xl font-semibold">Descuentos</h1>
      <DiscountsNav />
      {children}
    </div>
  );
}
