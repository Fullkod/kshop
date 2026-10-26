"use client";

import { formatUsd, INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@kshop/core";
import type { InvoiceLine, PlatformInvoice, StoreUsage } from "@kshop/data";
import { Badge, Card, cn } from "@kshop/ui";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/format";

// Pieces shared by Superadmin › Cobros / Tienda and Admin › Plan y facturación.

export function InvoiceStatusBadge({ invoice }: { invoice: PlatformInvoice }) {
  if (invoice.overdue) return <Badge variant="destructive">Vencida</Badge>;
  return (
    <Badge variant={invoice.status === "paid" ? "success" : invoice.status === "void" ? "default" : "gold"}>
      {INVOICE_STATUS_LABELS[invoice.status]}
    </Badge>
  );
}

export function LinesTable({ lines, total }: { lines: InvoiceLine[]; total: number }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {lines.map((line, i) => (
          <tr key={i} className="border-b last:border-0">
            <td className="py-1.5 pr-2">
              {line.description}
              {line.quantity > 1 && <span className="text-muted-foreground"> × {line.quantity}</span>}
            </td>
            <td className={cn("py-1.5 text-right whitespace-nowrap", line.amount < 0 && "text-success")}>
              {line.amount < 0 ? `−${formatUsd(-line.amount)}` : formatUsd(line.amount)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-semibold">
          <td className="pt-2">Total</td>
          <td className="pt-2 text-right">{formatUsd(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export function InvoiceCard({
  invoice,
  showStore,
  actions,
}: {
  invoice: PlatformInvoice;
  showStore?: boolean;
  actions?: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3" data-testid={`invoice-${invoice.number}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{invoice.number}</span>
            <InvoiceStatusBadge invoice={invoice} />
          </div>
          {showStore && invoice.store && <div className="text-sm">{invoice.store.name}</div>}
          <div className="text-xs text-muted-foreground">
            Periodo {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
            {invoice.status === "pending" && ` · vence ${formatDate(invoice.dueAt)}`}
            {invoice.paidAt && ` · pagada ${formatDate(invoice.paidAt)}`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{formatUsd(invoice.total)}</div>
          {invoice.status === "pending" && invoice.amountPaid > 0 && (
            <div className="text-xs text-muted-foreground">
              Pagado {formatUsd(invoice.amountPaid)} · falta {formatUsd(invoice.total - invoice.amountPaid)}
            </div>
          )}
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-primary">Detalle</summary>
        <div className="mt-2 flex flex-col gap-2">
          <LinesTable lines={invoice.lines} total={invoice.total} />
          {invoice.payments.length > 0 && (
            <ul className="text-xs text-muted-foreground">
              {invoice.payments.map((p) => (
                <li key={p.id}>
                  {formatDate(p.paidAt)} · {formatUsd(p.amount)} · {PAYMENT_METHOD_LABELS[p.method]}
                  {p.reference && ` · ${p.reference}`}
                </li>
              ))}
            </ul>
          )}
          {invoice.voidReason && (
            <p className="text-xs text-muted-foreground">Anulada: {invoice.voidReason}</p>
          )}
        </div>
      </details>
      {actions}
    </Card>
  );
}

export function UsageMeter({ label, usage }: { label: string; usage: StoreUsage["maxProducts"] }) {
  const ratio = usage.limit ? Math.min(1, usage.used / usage.limit) : 0;
  return (
    <div className="flex flex-col gap-1" data-testid={`usage-${label}`}>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span
          className={cn(usage.limit != null && usage.used >= usage.limit && "font-semibold text-destructive")}
        >
          {usage.used} / {usage.limit ?? "sin límite"}
        </span>
      </div>
      {usage.limit != null && (
        <div className="h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
          <div
            className={cn(
              "h-full rounded-full",
              ratio >= 1 ? "bg-destructive" : ratio >= 0.8 ? "bg-gold" : "bg-primary",
            )}
            style={{ width: `${Math.max(2, ratio * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
