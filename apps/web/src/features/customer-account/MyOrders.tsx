"use client";

import { formatMoney, ORDER_STATUS_LABELS } from "@kshop/core";
import type { CustomerOrderSummary } from "@kshop/data";
import { Badge, Card } from "@kshop/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store-context";
import { useCustomerSession } from "./CustomerSession";

/** «Mis pedidos» in the account: only the customer's orders of this store (RLS). */
export function MyOrders() {
  const store = useStore();
  const { api } = useCustomerSession();
  const [orders, setOrders] = useState<CustomerOrderSummary[] | null>(null);

  useEffect(() => {
    api
      .customer(store.id)
      .orders()
      .then((r) => setOrders(r.orders), () => setOrders([]));
  }, [api, store.id]);

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold">Mis pedidos</h2>
      {orders === null ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no has hecho pedidos.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {orders.map((o) => (
            <li key={o.publicToken}>
              <Link href={`/order/${o.publicToken}`} className="flex items-center justify-between gap-3 py-3">
                <span className="flex flex-col text-sm">
                  <span className="font-medium">{o.code}</span>
                  <span className="text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString("es")} · {o.itemCount}{" "}
                    {o.itemCount === 1 ? "producto" : "productos"}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1 text-sm">
                  <Badge>{ORDER_STATUS_LABELS[o.status]}</Badge>
                  <span>{o.total === null ? "Total pendiente" : formatMoney(o.total, o.currency)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
