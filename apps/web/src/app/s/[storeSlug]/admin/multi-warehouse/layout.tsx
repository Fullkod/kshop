"use client";

import { Alert } from "@kshop/ui";
import type { ReactNode } from "react";
import { WarehousesNav } from "@/features/multi-warehouse/components/WarehousePages";
import { useAdmin } from "../admin-context";

export default function MultiWarehouseLayout({ children }: { children: ReactNode }) {
  const admin = useAdmin();
  if (!admin.enabledModules.has("multi_warehouse")) {
    return <Alert variant="destructive">«Almacenes» no está incluido en el plan de tu tienda.</Alert>;
  }
  return (
    <div className="max-w-6xl">
      <h1 className="mb-4 text-2xl font-semibold">Almacenes</h1>
      <WarehousesNav />
      {children}
    </div>
  );
}
