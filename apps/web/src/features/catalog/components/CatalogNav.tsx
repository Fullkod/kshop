"use client";

import { AdminSubNav } from "@/components/AdminSubNav";
import { useStorePathname } from "@/lib/navigation";

export const CATALOG_SECTIONS = [
  { href: "/admin/catalog", label: "Productos" },
  { href: "/admin/catalog/categories", label: "Categorías" },
  { href: "/admin/catalog/attributes", label: "Atributos" },
  { href: "/admin/catalog/product-types", label: "Tipos de producto" },
  { href: "/admin/catalog/brands", label: "Marcas" },
  { href: "/admin/catalog/collections", label: "Colecciones" },
  { href: "/admin/catalog/warehouses", label: "Almacenes" },
  { href: "/admin/catalog/currencies", label: "Monedas" },
] as const;

export function CatalogNav() {
  const pathname = useStorePathname();
  const active = (href: string) =>
    href === "/admin/catalog"
      ? pathname === href || pathname.startsWith("/admin/catalog/products")
      : pathname.startsWith(href);

  return (
    <AdminSubNav
      label="Secciones del catálogo"
      items={CATALOG_SECTIONS.map((s) => ({ href: s.href, label: s.label, active: active(s.href) }))}
    />
  );
}
