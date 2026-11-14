"use client";

import { PosClosingSales } from "@kshop/admin";
import { Alert } from "@kshop/ui";
import { useSearchParams } from "next/navigation";
import { useRouteParam } from "@/lib/use-route-param";
import { useAdmin } from "../../../admin-context";

export default function ClosingSalesPage() {
  const admin = useAdmin();
  const closingId = useRouteParam("closingId");
  const query = useSearchParams().get("q") ?? "";
  if (!admin.enabledModules.has("pos")) {
    return <Alert variant="destructive">«Caja» no está incluido en el plan de tu tienda.</Alert>;
  }
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Ventas del cierre</h1>
      <PosClosingSales
        key={closingId}
        closingId={closingId}
        closingsHref="/admin/pos?tab=closings"
        initialQuery={query}
      />
    </div>
  );
}
