"use client";

import { Alert } from "@kshop/ui";
import { SalesTodayCard } from "@/features/sales-today/SalesTodayCard";
import { useAdmin } from "../admin-context";

export default function AdminSalesTodayPage() {
  const admin = useAdmin();
  if (!admin.enabledModules.has("sales_today")) {
    return <Alert variant="destructive">«Ventas de hoy» no está incluido en el plan de tu tienda.</Alert>;
  }
  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold">Ventas de hoy</h1>
      <SalesTodayCard />
    </div>
  );
}
