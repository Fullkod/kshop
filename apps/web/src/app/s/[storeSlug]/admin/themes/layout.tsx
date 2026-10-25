"use client";

import { Alert } from "@kshop/ui";
import type { ReactNode } from "react";
import { useAdmin } from "../admin-context";

export default function ThemesLayout({ children }: { children: ReactNode }) {
  const admin = useAdmin();
  if (!admin.enabledModules.has("themes")) {
    return <Alert variant="destructive">«Apariencia» no está incluida en el plan de tu tienda.</Alert>;
  }
  if (admin.role === "staff") {
    return (
      <Alert variant="destructive">Solo los administradores de la tienda pueden cambiar la apariencia.</Alert>
    );
  }
  return children;
}
