"use client";

import { formatMoney, formatRate, orderCode, posFlagText } from "@kshop/core";
import { useCheckoutSettings, LoadError, ORDER_TABLES, useStoreVersion } from "@kshop/admin";
import type { PosOverview } from "@kshop/data";
import { Card, cn } from "@kshop/ui";
import { Link, useStore } from "@kshop/storefront";
import { useEffect, useState } from "react";
import { useAdmin } from "@/app/s/[storeSlug]/admin/admin-context";
import { useSession } from "@/lib/session";

const PERIODS = [
  { days: 1, label: "Hoy" },
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
];

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("es", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Havana",
  }).format(new Date(iso));

/** Admin › Caja: the sale happens on the phone (Kshop Admin); here the owner sees what came in and what to check. */
export function PosPage() {
  const store = useStore();
  const admin = useAdmin();
  const { reads } = useSession();
  const { data: settings } = useCheckoutSettings();
  const live = useStoreVersion(store.id, ORDER_TABLES);
  const [days, setDays] = useState(1);
  const [overview, setOverview] = useState<PosOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    reads.posOverview(store.id, days).then(
      (data) => {
        if (cancelled) return;
        setFailed(false);
        setOverview(data);
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [reads, store.id, days, live, attempt]);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Caja</h1>
      <Card className="text-sm">
        <p>
          Se vende desde <strong>Kshop Admin</strong> en el teléfono, también sin internet. Las ventas llegan
          aquí cuando el teléfono tiene conexión, con la fecha en que se vendieron.
        </p>
        {admin.enabledModules.has("mobile_app") && (
          <Link href="/admin/mobile-app" className="mt-2 inline-block underline">
            Instalar Kshop Admin
          </Link>
        )}
      </Card>

      <div role="tablist" aria-label="Periodo" className="flex gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            role="tab"
            aria-selected={days === p.days}
            onClick={() => setDays(p.days)}
            className={cn(
              "h-[34px] rounded-full border px-3.5 text-sm whitespace-nowrap",
              days === p.days
                ? "border-night bg-night font-semibold text-white"
                : "bg-background hover:bg-surface",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {failed && !overview && (
        <LoadError message="No se pudo cargar la caja." onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {!overview ? (
        failed ? null : (
          <p className="text-muted-foreground">Cargando…</p>
        )
      ) : (
        <>
          <Card className="flex flex-col gap-2" data-testid="pos-overview">
            <p className="font-display text-xl font-bold">
              {overview.count} {overview.count === 1 ? "venta" : "ventas"}
            </p>
            {overview.cash.length > 0 ? (
              <ul className="flex flex-col gap-0.5 text-sm" data-testid="pos-cash">
                {overview.cash.map((c) => (
                  <li key={c.currency}>En caja: {formatMoney(c.amount, c.currency)}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin cobros en este periodo.</p>
            )}
            {overview.cancelled > 0 && (
              <p className="text-sm text-muted-foreground">
                {overview.cancelled === 1 ? "1 cancelada" : `${overview.cancelled} canceladas`}, fuera de
                estas cuentas.
              </p>
            )}
            <Link href="/admin/orders?tab=counter" className="text-sm underline">
              Ver las ventas de mostrador
            </Link>
          </Card>

          {overview.rates.length > 0 && (
            <Card className="text-sm" data-testid="pos-rates">
              <h2 className="mb-2 font-semibold">Tasas usadas</h2>
              <ul className="flex flex-col gap-0.5">
                {overview.rates.map((r) => (
                  <li key={`${r.currency}-${r.rateToOrder}`}>
                    {formatRate(r.rateToOrder, r.currency, r.orderCurrency)} ·{" "}
                    {r.payments === 1 ? "1 cobro" : `${r.payments} cobros`}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {overview.flaggedCount > 0 && (
            <Card className="text-sm" data-testid="pos-flagged">
              <h2 className="mb-2 font-semibold">Para revisar ({overview.flaggedCount})</h2>
              {overview.flaggedCount > overview.flagged.length && (
                <p className="mb-2 text-muted-foreground">
                  Se muestran las {overview.flagged.length} más recientes.
                </p>
              )}
              <ul className="flex flex-col divide-y">
                {overview.flagged.map((sale) => (
                  <li key={sale.orderId} className="flex flex-col gap-0.5 py-2">
                    <Link href={`/admin/orders/${sale.orderId}`} className="font-medium underline">
                      {settings ? orderCode(settings.orderPrefix, sale.number) : `#${sale.number}`} ·{" "}
                      {dateTime(sale.soldAt)}
                    </Link>
                    {sale.flags.map((flag, i) => (
                      <span key={i} className="text-muted-foreground">
                        {posFlagText(flag, sale.currency)}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
