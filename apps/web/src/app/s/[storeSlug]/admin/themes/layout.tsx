"use client";

import { Alert } from "@kshop/ui";
import type { ReactNode } from "react";
import { useAdmin } from "../admin-context";

export default function ThemesLayout({ children }: { children: ReactNode }) {
  const admin = useAdmin();
  if (!admin.enabledModules.has("themes")) {
    return (
      <Alert>
        La apariencia de tu tienda (colores, portada, banners, menús y páginas) la configura el equipo de
        Kshop. Escríbenos para cualquier cambio, o pásate al plan Pro para hacerlo tú.
      </Alert>
    );
  }
  if (admin.role === "staff") {
    return (
      <Alert variant="destructive">Solo los administradores de la tienda pueden cambiar la apariencia.</Alert>
    );
  }
  return children;
}
