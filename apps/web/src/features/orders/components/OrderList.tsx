"use client";

import {
  formatMoney,
  formatPhone,
  isStalePending,
  ORDER_ACTION_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TABS,
  ORDER_TRANSITIONS,
  orderCode,
  PAYMENT_STATUS_LABELS,
  type OrderStatus,
  type OrderTabKey,
  type PaymentStatus,
} from "@kshop/core";
import { AdminOrdersQuery, type VariablesOf } from "@kshop/data";
import { Alert, Badge, Button, Card, Input, cn } from "@kshop/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApiAction } from "@/features/catalog/use-catalog";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";
import { useCheckoutSettings } from "../use-orders";

type Filter = VariablesOf<typeof AdminOrdersQuery>["filter"];
type Row = {
  id: string;
  number: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  currency: string;
  total: number | null;
  subtotal: number;
  customerName: string;
  customerPhone: string;
  createdAt: string;
  items: number;
  channel: string;
};

const PAGE_SIZE = 30;
export const STATUS_VARIANT: Record<OrderStatus, "default" | "muted" | "success" | "destructive" | "gold"> = {
  pending_confirmation: "gold",
  pending_payment: "gold",
  paid: "success",
  processing: "default",
  shipped: "default",
  delivered: "muted",
  cancelled: "destructive",
};

export function OrderList() {
  const store = useStore();
  const { graphql, api } = useSession();
  const { data: settings } = useCheckoutSettings();
  const action = useApiAction();
  const [tab, setTab] = useState<OrderTabKey>("pending");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const filter = (): Filter => {
    const statuses = ORDER_TABS.find((t) => t.key === tab)!.statuses as unknown as OrderStatus[];
    const q = query.trim().replace(/^[A-Z0-9]+-/i, "");
    const base: Filter = { storeId: { eq: store.id }, status: { in: statuses } };
    if (!q) return base;
    if (/^\d{1,9}$/.test(q) && Number(q) >= 1000) return { ...base, number: { eq: Number(q) } };
    return {
      ...base,
      or: [
        { customerName: { ilike: `%${q}%` } },
        { customerPhone: { ilike: `%${q.replace(/\D/g, "") || q}%` } },
      ],
    };
  };

  async function load(after: string | null) {
    const result = await graphql
      .query(AdminOrdersQuery, { filter: filter(), first: PAGE_SIZE, after })
      .toPromise();
    if (result.error) {
      setLoadError("No se pudieron cargar los pedidos.");
      return null;
    }
    const page = result.data?.ordersCollection;
    setTotal(page?.totalCount ?? 0);
    setCursor(page?.pageInfo.hasNextPage ? (page.pageInfo.endCursor ?? null) : null);
    return (page?.edges ?? []).map(({ node: o }) => ({
      id: o.id,
      number: o.number,
      status: o.status as OrderStatus,
      paymentStatus: o.paymentStatus as PaymentStatus,
      currency: String(o.currency),
      total: o.total == null ? null : Number(o.total),
      subtotal: Number(o.subtotal),
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      createdAt: o.createdAt,
      items: (o.orderLinesCollection?.edges ?? []).reduce((sum, e) => sum + e.node.quantity, 0),
      channel: o.channel,
    }));
  }

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const next = await load(null);
      if (!cancelled && next) setRows(next);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() is derived from these
  }, [graphql, store.id, tab, query, version]);

  async function quick(row: Row, to: Exclude<OrderStatus, "cancelled">) {
    const ok = await action.run(() => api.orders(store.id).transition(row.id, to));
    if (ok) setVersion((v) => v + 1);
  }

  const code = (n: number) => (settings ? orderCode(settings.orderPrefix, n) : `#${n}`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Estado" className="flex flex-wrap gap-1">
          {ORDER_TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                tab === t.key ? "border-primary bg-accent-soft font-medium text-primary" : "hover:bg-surface",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Input
          type="search"
          placeholder="Buscar por número, nombre o teléfono"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ml-auto max-w-xs"
          aria-label="Buscar pedidos"
        />
      </div>

      {(loadError || action.error) && <Alert variant="destructive">{loadError ?? action.error}</Alert>}

      {rows === null ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : rows.length === 0 ? (
        <Card className="text-muted-foreground">No hay pedidos aquí.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y" data-testid="orders-list">
            {rows.map((row) => {
              const next = ORDER_TRANSITIONS[row.status][0];
              const stale = isStalePending(row.status, new Date(row.createdAt));
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Link href={`/admin/orders/${row.id}`} className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{code(row.number)}</span>
                      <Badge variant={STATUS_VARIANT[row.status]}>{ORDER_STATUS_LABELS[row.status]}</Badge>
                      <Badge variant="muted">{PAYMENT_STATUS_LABELS[row.paymentStatus]}</Badge>
                      {stale && <Badge variant="destructive">Más de 48 h</Badge>}
                      {row.channel === "admin" && <Badge variant="muted">Admin</Badge>}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      {row.customerName} · {formatPhone(row.customerPhone)} · {row.items}{" "}
                      {row.items === 1 ? "producto" : "productos"} ·{" "}
                      {new Date(row.createdAt).toLocaleString("es", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </Link>
                  <span className="text-sm font-medium">
                    {row.total === null
                      ? `${formatMoney(row.subtotal, row.currency)} + envío`
                      : formatMoney(row.total, row.currency)}
                  </span>
                  {next && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={action.pending}
                      onClick={() => quick(row, next as Exclude<OrderStatus, "cancelled">)}
                    >
                      {ORDER_ACTION_LABELS[next]}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {rows && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {rows.length} de {total}
          </span>
          {cursor && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const more = await load(cursor);
                if (more) setRows((r) => [...(r ?? []), ...more]);
              }}
            >
              Ver más
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
