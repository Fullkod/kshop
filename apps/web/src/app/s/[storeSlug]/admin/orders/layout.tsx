"use client";

import { Alert } from "@kshop/ui";
import type { ReactNode } from "react";
import { OrdersNav } from "@/features/orders/components/OrdersNav";
import { useAdmin } from "../admin-context";

export default function OrdersLayout({ children }: { children: ReactNode }) {
  const admin = useAdmin();
  if (!admin.enabledModules.has("orders")) {
    return <Alert variant="destructive">Los pedidos no están incluidos en el plan de tu tienda.</Alert>;
  }
  return (
    <div className="max-w-6xl">
      <h1 className="mb-4 text-2xl font-semibold">Pedidos</h1>
      <OrdersNav />
      {children}
    </div>
  );
}
