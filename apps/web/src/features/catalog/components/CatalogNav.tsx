"use client";

import { cn } from "@kshop/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/admin/catalog"
      ? pathname === href || pathname.startsWith("/admin/catalog/products")
      : pathname.startsWith(href);

  return (
    <nav className="mb-6 flex gap-5 overflow-x-auto border-b" aria-label="Secciones del catálogo">
      {CATALOG_SECTIONS.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={cn(
            "-mb-px border-b-2 border-transparent pt-1 pb-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
            active(s.href) && "border-primary font-bold text-primary",
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
