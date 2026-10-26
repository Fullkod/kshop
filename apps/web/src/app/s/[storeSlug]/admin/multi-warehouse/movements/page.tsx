"use client";

import { useSearchParams } from "next/navigation";
import { MovementsPage } from "@/features/multi-warehouse/components/WarehousePages";

export default function AdminWarehouseMovementsPage() {
  const warehouseId = useSearchParams().get("warehouseId") ?? undefined;
  return <MovementsPage key={warehouseId} initialWarehouseId={warehouseId} />;
}
