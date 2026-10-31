"use client";

import { Alert } from "@kshop/ui";
import { PosPage } from "@/features/pos/components/PosPage";
import { useAdmin } from "../admin-context";

export default function AdminPosPage() {
  const admin = useAdmin();
  if (!admin.enabledModules.has("pos")) {
    return <Alert variant="destructive">«Caja» no está incluido en el plan de tu tienda.</Alert>;
  }
  return <PosPage />;
}
