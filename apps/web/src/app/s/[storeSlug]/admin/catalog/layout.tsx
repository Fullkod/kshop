"use client";

import { Alert } from "@kshop/ui";
import type { ReactNode } from "react";
import { CatalogNav } from "@/features/catalog/components/CatalogNav";
import { useAdmin } from "../admin-context";

export default function CatalogLayout({ children }: { children: ReactNode }) {
  const admin = useAdmin();
  if (!admin.enabledModules.has("catalog")) {
    return <Alert variant="destructive">El catálogo no está incluido en el plan de tu tienda.</Alert>;
  }
  return (
    <div className="max-w-6xl">
      <h1 className="mb-4 text-2xl font-semibold">Catálogo</h1>
      <CatalogNav />
      {children}
    </div>
  );
}
