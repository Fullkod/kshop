"use client";

import { formatMoney, posCartTotal, posDaySummary, type CurrencyCode } from "@kshop/core";
import { Alert, Badge, Button, Card, useConfirm } from "@kshop/ui";
import { usePosPlace } from "./PosStatus";
import type { QueuedSale } from "./storage";

/** The day on this phone, per currency as it was charged, and what happened to each sale. */
export function PosDay({
  sales,
  currency,
  syncing,
  canUpload,
  onUpload,
  onVoid,
}: {
  sales: QueuedSale[];
  currency: CurrencyCode;
  syncing: boolean;
  canUpload: boolean;
  onUpload: () => void;
  onVoid: (sale: QueuedSale) => Promise<void>;
}) {
  const { confirm } = useConfirm();
  const place = usePosPlace();
  const summary = posDaySummary(sales, currency);
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
    <Card className="flex flex-col gap-3" data-testid="pos-day">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Hoy en este {place}</h2>
          <p className="text-sm" data-testid="pos-day-summary">
            {summary.count} {summary.count === 1 ? "venta" : "ventas"}
            {summary.cash.map((c) => ` · ${formatMoney(c.amount, c.currency)}`).join("")}
          </p>
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
          {todays.map((queued) => (
            <li
              key={queued.sale.id}
              className="flex items-center justify-between gap-2 border-t pt-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium">{queued.sale.localNumber}</span>
                {" · "}
                {formatMoney(posCartTotal(queued.sale.lines), currency)}{" "}
                {queued.sale.voided ? (
                  <Badge variant="muted">Anulada</Badge>
                ) : queued.uploaded ? (
                  <Badge variant="muted">Pedido {queued.uploaded.number}</Badge>
                ) : queued.held ? (
                  <Badge variant="muted">Retenida</Badge>
                ) : (
                  <Badge variant="muted">Sin subir</Badge>
                )}
              </span>
              {!queued.uploaded && !queued.sale.voided && (
                <Button size="sm" variant="ghost" onClick={() => void askVoid(queued)}>
                  Anular
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
