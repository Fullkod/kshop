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
    <nav className="mb-6 flex gap-5 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)] [scrollbar-width:none]" aria-label="Secciones de pedidos">
      {SECTIONS.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={cn(
            "shrink-0 border-b-2 border-transparent pt-1 pb-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
            active(s.href) && "border-primary font-bold text-primary",
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
