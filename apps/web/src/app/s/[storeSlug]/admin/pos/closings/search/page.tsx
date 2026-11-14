"use client";

import { PosProductSales } from "@kshop/admin";
import { Alert } from "@kshop/ui";
import { useSearchParams } from "next/navigation";
import { useAdmin } from "../../../admin-context";

export default function ProductSalesPage() {
  const admin = useAdmin();
  const productId = useSearchParams().get("product") ?? "";
  if (!admin.enabledModules.has("pos")) {
    return <Alert variant="destructive">«Caja» no está incluido en el plan de tu tienda.</Alert>;
  }
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Buscar un producto en los cierres</h1>
      <PosProductSales closingsHref="/admin/pos?tab=closings" initialProductId={productId} />
    </div>
  );
}
