"use client";

import { AdminSubNav } from "@/components/AdminSubNav";
import { useStorePathname } from "@/lib/navigation";

const SECTIONS = [
  { href: "/admin/orders", label: "Pedidos" },
  { href: "/admin/orders/new", label: "Nuevo pedido" },
  { href: "/admin/orders/customers", label: "Clientes" },
  { href: "/admin/orders/payment-methods", label: "Métodos de pago" },
] as const;

export function OrdersNav() {
  const pathname = useStorePathname();
  const active = (href: string) =>
    href === "/admin/orders"
      ? pathname === href || /^\/admin\/orders\/[0-9a-f-]{36}$/.test(pathname)
      : pathname.startsWith(href);
  return (
    <AdminSubNav
      label="Secciones de pedidos"
      items={SECTIONS.map((s) => ({ href: s.href, label: s.label, active: active(s.href) }))}
    />
  );
}
