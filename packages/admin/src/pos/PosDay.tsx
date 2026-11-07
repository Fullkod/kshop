"use client";

import { formatMoney, posCartTotal, posDaySummary, type CurrencyCode } from "@kshop/core";
import { Link } from "@kshop/storefront";
import { Alert, Badge, Button, ChevronRight, useConfirm } from "@kshop/ui";
import { usePosPlace } from "./PosStatus";
import type { QueuedSale } from "./storage";

/** The day on this phone, per currency as it was charged, and what happened to each sale. */
export function PosDay({
  sales,
  currency,
  methods,
  syncing,
  canUpload,
  onUpload,
  onVoid,
}: {
  sales: QueuedSale[];
  currency: CurrencyCode;
  /** The store's payment methods (catalog snapshot), to name how each sale was paid (KSH0010). */
  methods: { id: string; name: string }[];
  syncing: boolean;
  canUpload: boolean;
  onUpload: () => void;
  onVoid: (sale: QueuedSale) => Promise<void>;
}) {
  const { confirm } = useConfirm();
  const place = usePosPlace();
  const summary = posDaySummary(sales, currency);
  const methodName = new Map(methods.map((m) => [m.id, m.name]));
  // Payments of a method the catalog no longer has stay out of the names, not out of the till.
  const byMethod = new Map<string, string[]>();
  for (const m of summary.byMethod) {
    const name = methodName.get(m.methodId);
    if (name) byMethod.set(name, [...(byMethod.get(name) ?? []), formatMoney(m.amount, m.currency)]);
  }
  const saleMethods = (queued: QueuedSale) => [
    ...new Set(queued.sale.payments.flatMap((p) => methodName.get(p.paymentMethodId ?? "") ?? [])),
  ];
  const held = sales.filter((s) => s.held && !s.uploaded);
  const pending = sales.filter((s) => !s.uploaded);
  const today = new Date().toDateString();
  const todays = sales
    .filter((s) => new Date(s.sale.soldAt).toDateString() === today || !s.uploaded)
    .sort((a, b) => b.sale.soldAt.localeCompare(a.sale.soldAt));

  async function askVoid(queued: QueuedSale) {
    const ok = await confirm({
      title: `¿Anular la venta ${queued.sale.localNumber}?`,
      description: "Devuelve el dinero al cliente. El dueño verá la venta como cancelada.",
      confirmLabel: "Anular venta",
      tone: "destructive",
    });
    if (ok) await onVoid(queued);
  }

  return (
    <section className="flex flex-col gap-3 border-t pt-4" data-testid="pos-day">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Hoy en este {place}</h2>
          <p className="text-sm" data-testid="pos-day-summary">
            {summary.count} {summary.count === 1 ? "venta" : "ventas"}
            {summary.cash.map((c) => ` · ${formatMoney(c.amount, c.currency)}`).join("")}
          </p>
          {byMethod.size > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="pos-day-methods">
              {[...byMethod].map(([name, amounts]) => `${name} ${amounts.join(" + ")}`).join(" · ")}
            </p>
          )}
        </div>
        {pending.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={!canUpload || syncing}
            onClick={onUpload}
            data-testid="pos-upload"
          >
            {syncing ? "Subiendo…" : "Subir ahora"}
          </Button>
        )}
      </div>

      {held.length > 0 && (
        <Alert variant="destructive" data-testid="pos-held">
          {held.length === 1 ? "1 venta retenida" : `${held.length} ventas retenidas`}:{" "}
          {held[0]?.held?.message} Siguen guardadas en este {place} y se suben solas cuando se resuelva.
        </Alert>
      )}
      {pending.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {place === "teléfono"
            ? "Si desinstalas la app, las ventas sin subir se pierden."
            : "Las ventas sin subir solo están en este navegador: si borras sus datos, se pierden."}
        </p>
      )}

      {todays.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="pos-day-list">
          {todays.map((queued) => {
            const summary = (
              <span className="min-w-0">
                <span className="font-medium">{queued.sale.localNumber}</span>
                {" · "}
                {formatMoney(posCartTotal(queued.sale.lines), currency)}
                {saleMethods(queued).map((m) => ` · ${m}`)}{" "}
                {queued.sale.voided ? (
                  <Badge variant="muted">Anulada</Badge>
                ) : queued.uploaded?.cancelled ? (
                  <Badge variant="muted">Pedido {queued.uploaded.number} cancelado</Badge>
                ) : queued.uploaded ? (
                  <Badge variant="muted">Pedido {queued.uploaded.number}</Badge>
                ) : queued.held ? (
                  <Badge variant="muted">Retenida</Badge>
                ) : (
                  <Badge variant="muted">Sin subir</Badge>
                )}
              </span>
            );
            return (
              <li key={queued.sale.id} className="border-t pt-2 text-sm">
                {queued.uploaded ? (
                  // Once uploaded the sale is an order: the row opens it (Roberto, 2026-11-05).
                  <Link
                    href={`/admin/orders/${queued.uploaded.orderId}`}
                    className="-mx-2 flex min-h-10 items-center justify-between gap-2 rounded-md px-2 hover:bg-surface"
                  >
                    {summary}
                    <ChevronRight size={16} aria-hidden className="shrink-0 text-muted-foreground" />
                  </Link>
                ) : (
                  <span className="flex min-h-10 items-center justify-between gap-2">
                    {summary}
                    {!queued.sale.voided && (
                      <Button size="sm" variant="ghost" onClick={() => void askVoid(queued)}>
                        Anular
                      </Button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
