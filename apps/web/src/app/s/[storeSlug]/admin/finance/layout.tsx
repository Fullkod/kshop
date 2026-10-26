"use client";

import { Alert } from "@kshop/ui";
import type { ReactNode } from "react";
import { FinanceShell } from "@/features/finance/components/FinancePages";
import { useAdmin } from "../admin-context";

// Finanzas shows costs and margins: owner and admins only (PRP-6 D10).
export default function FinanceLayout({ children }: { children: ReactNode }) {
  const admin = useAdmin();
  if (!admin.enabledModules.has("finance")) {
    return <Alert variant="destructive">«Finanzas» no está incluido en el plan de tu tienda.</Alert>;
  }
  if (admin.role === "staff") {
    return <Alert variant="destructive">Solo el dueño y los administradores ven las finanzas.</Alert>;
  }
  return <FinanceShell>{children}</FinanceShell>;
}
