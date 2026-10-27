"use client";

import { formatMoney } from "@kshop/core";
import type { SalesToday } from "@kshop/data";
import { Card } from "@kshop/ui";
import { useEffect, useState } from "react";
import { useSession } from "./session";
import { Link, useStore } from "@kshop/storefront";

/** «Ventas de hoy» (D16, module sales_today): orders and money received today in America/Havana. */
export function SalesTodayCard() {
  const store = useStore();
  const { api } = useSession();
  const [data, setData] = useState<SalesToday | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .orders(store.id)
      .salesToday()
      .then(setData, () => setFailed(true));
  }, [api, store.id]);

  if (failed) return null;
  const orders = data?.orders.reduce((sum, o) => sum + o.orders, 0) ?? 0;
  return (
    <Card className="flex flex-col gap-3" data-testid="sales-today">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ventas de hoy</h2>
        {data && data.pending > 0 && (
          <Link href="/admin/orders" className="text-sm underline">
            {data.pending} {data.pending === 1 ? "pedido pendiente" : "pedidos pendientes"}
          </Link>
        )}
      </div>
      {!data ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted-foreground">Pedidos</dt>
            <dd className="text-2xl font-semibold">{orders}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Vendido</dt>
            <dd className="font-semibold">
              {data.orders.length === 0
                ? "—"
                : data.orders.map((o) => formatMoney(o.amount, o.currency)).join(" · ")}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Cobrado</dt>
            <dd className="font-semibold">
              {data.received.length === 0
                ? "—"
                : data.received.map((r) => formatMoney(r.amount, r.currency)).join(" · ")}
            </dd>
          </div>
        </dl>
      )}
    </Card>
  );
}
