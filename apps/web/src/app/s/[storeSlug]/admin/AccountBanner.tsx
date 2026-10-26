"use client";

import { Alert } from "@kshop/ui";
import Link from "next/link";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import type { AdminState } from "./admin-context";

// Trial, overdue invoice or suspension, on every admin page (PRP-5 D16, D22). Staff see the state, never amounts;
// the link to «Plan y facturación» is for owner/admin.

const DAY = 86_400_000;

export function AccountBanner({ admin }: { admin: AdminState }) {
  const sub = admin.subscription;
  const [now] = useState(() => Date.now());
  const canPay = admin.role === "owner" || admin.role === "admin" || admin.isSuperadmin;
  const billingLink = canPay && (
    <>
      {" "}
      <Link href="/admin/billing" className="font-medium underline">
        Ver plan y facturación
      </Link>
    </>
  );

  if (admin.storeStatus === "suspended") {
    return (
      <Alert variant="destructive" className="mb-6" data-testid="banner-suspended">
        {sub?.status === "suspended"
          ? "La tienda está suspendida por falta de pago: los clientes no pueden comprar y el panel es solo de lectura."
          : "La tienda está suspendida: los clientes no pueden comprar y el panel es solo de lectura. Escribe a soporte de Kshop."}
        {sub?.status === "suspended" && billingLink}
      </Alert>
    );
  }
  if (sub?.status === "past_due") {
    return (
      <Alert variant="destructive" className="mb-6" data-testid="banner-past-due">
        Hay una factura de Kshop vencida. Si no se paga a tiempo, la tienda se suspenderá.{billingLink}
      </Alert>
    );
  }
  if (sub?.status === "trialing" && sub.trialEndsAt) {
    const days = Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - now) / DAY));
    return (
      <Alert className="mb-6" data-testid="banner-trial">
        Prueba gratis: {days === 1 ? "queda 1 día" : `quedan ${days} días`} (hasta{" "}
        {formatDate(sub.trialEndsAt)}).
        {billingLink}
      </Alert>
    );
  }
  return null;
}
