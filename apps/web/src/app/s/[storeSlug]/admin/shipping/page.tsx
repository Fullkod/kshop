"use client";

import { Alert } from "@kshop/ui";
import { ShippingPage } from "@/features/orders/components/CheckoutSettingsPages";
import { useAdmin } from "../admin-context";

export default function AdminShippingPage() {
  const admin = useAdmin();
  if (!admin.enabledModules.has("shipping")) {
    return <Alert variant="destructive">«Entregas» no está incluido en el plan de tu tienda.</Alert>;
  }
  return (
    <div className="max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Entregas</h1>
      <ShippingPage />
    </div>
  );
}
