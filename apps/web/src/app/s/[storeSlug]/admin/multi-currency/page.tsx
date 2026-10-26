"use client";

import { Alert } from "@kshop/ui";
import { CurrencyRatesPage } from "@/features/multi-currency/components/CurrencyRatesPage";
import { useAdmin } from "../admin-context";

export default function AdminCurrenciesPage() {
  const admin = useAdmin();
  if (!admin.enabledModules.has("multi_currency")) {
    return <Alert variant="destructive">«Monedas» no está incluido en el plan de tu tienda.</Alert>;
  }
  return <CurrencyRatesPage />;
}
