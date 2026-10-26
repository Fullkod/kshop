"use client";

import { Alert } from "@kshop/ui";
import { CustomDomainPage } from "@/features/custom-domain/components/CustomDomainPage";
import { useAdmin } from "../admin-context";

export default function AdminCustomDomainPage() {
  const admin = useAdmin();
  if (!admin.enabledModules.has("custom_domain")) {
    return <Alert variant="destructive">«Dominio propio» no está incluido en el plan de tu tienda.</Alert>;
  }
  return <CustomDomainPage />;
}
