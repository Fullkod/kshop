"use client";

import { cn } from "@kshop/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/admin/orders", label: "Pedidos" },
  { href: "/admin/orders/new", label: "Nuevo pedido" },
  { href: "/admin/orders/customers", label: "Clientes" },
  { href: "/admin/orders/payment-methods", label: "Métodos de pago" },
] as const;

export function OrdersNav() {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/admin/orders"
      ? pathname === href || /^\/admin\/orders\/[0-9a-f-]{36}$/.test(pathname)
      : pathname.startsWith(href);
  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b pb-2" aria-label="Secciones de pedidos">
      {SECTIONS.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm whitespace-nowrap hover:bg-surface",
            active(s.href) && "bg-accent-soft font-medium text-primary",
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
