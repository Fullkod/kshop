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
import { Alert, Badge, Button, Card, Input, MessageCircle, cn } from "@kshop/ui";
import { useEffect, useState } from "react";
import { useApiAction } from "../catalog/use-catalog";
import { useStoreVersion } from "../realtime";
import { useSession } from "../session";
import { Link, useStore } from "@kshop/storefront";
import { useCheckoutSettings } from "./use-orders";

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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
export const STATUS_VARIANT: Record<OrderStatus, "default" | "muted" | "success" | "destructive" | "gold"> = {
  pending_confirmation: "gold",
  pending_payment: "gold",
  paid: "success",
  processing: "default",
  shipped: "default",
  delivered: "muted",
  cancelled: "destructive",
};

const PILL: Record<OrderStatus, string> = {
  pending_confirmation: "bg-warning-soft text-warning",
  pending_payment: "bg-warning-soft text-warning",
  paid: "bg-accent-soft text-primary",
  processing: "bg-accent-soft text-primary",
  shipped: "bg-accent-soft text-primary",
  delivered: "bg-success-soft text-success",
  cancelled: "bg-destructive-soft text-destructive",
};

/** Order state as a pill with a dot (redesign R6: home table and order cards). */
export function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        PILL[status],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

/** The list reads again on its own when an order of the store changes (Realtime). */
export function OrderList() {
  const store = useStore();
  const { graphql, api } = useSession();
  const { data: settings } = useCheckoutSettings();
  const action = useApiAction();
  const [tab, setTab] = useState<OrderTabKey>("pending");
  // ?q= opens the list already searched (a customer picked in the global search shows their orders).
  const [query, setQuery] = useState(() =>
    typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("q") ?? ""),
  );
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const live = useStoreVersion(store.id);
  const [loadError, setLoadError] = useState<string | null>(null);

  const filter = (): Filter => {
    const statuses = ORDER_TABS.find((t) => t.key === tab)!.statuses as unknown as OrderStatus[];
    const q = query.trim().replace(/^[A-Z0-9]+-/i, "");
    // A search looks in every status (a customer's delivered orders too); the tabs filter the plain list.
    const base: Filter = { storeId: { eq: store.id }, ...(q ? {} : { status: { in: statuses } }) };
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
  }, [graphql, store.id, tab, query, version, live]);

  async function quick(row: Row, to: Exclude<OrderStatus, "cancelled">) {
    const ok = await action.run(() => api.orders(store.id).transition(row.id, to));
    if (ok) setVersion((v) => v + 1);
  }

  const code = (n: number) => (settings ? orderCode(settings.orderPrefix, n) : `#${n}`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Estado"
          className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]"
        >
          {ORDER_TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "h-[34px] rounded-full border px-3.5 text-sm whitespace-nowrap",
                tab === t.key
                  ? "border-night bg-night font-semibold text-white"
                  : "bg-background hover:bg-surface",
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
          className="h-11 w-full sm:ml-auto sm:max-w-xs"
          aria-label="Buscar pedidos"
        />
      </div>
      {query.trim() && <p className="-mt-2 text-xs text-muted-foreground">Buscando en todos los estados.</p>}

      {(loadError || action.error) && <Alert variant="destructive">{loadError ?? action.error}</Alert>}

      {rows === null ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : rows.length === 0 ? (
        <Card className="text-muted-foreground">No hay pedidos aquí.</Card>
      ) : (
        <ul className="flex flex-col gap-2.5" data-testid="orders-list">
          {rows.map((row) => {
            const next = ORDER_TRANSITIONS[row.status][0];
            const stale = isStalePending(row.status, new Date(row.createdAt));
            return (
              <li key={row.id} className="flex flex-col gap-2.5 rounded-[14px] border bg-background p-3.5">
                <div className="flex items-start gap-3">
                  <Link href={`/admin/orders/${row.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-primary">
                      {initials(row.customerName)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">{row.customerName}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {code(row.number)} ·{" "}
                        {new Date(row.createdAt).toLocaleString("es", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </span>
                  </Link>
                  <span className="font-display text-base font-bold whitespace-nowrap">
                    {row.total === null
                      ? `${formatMoney(row.subtotal, row.currency)} + envío`
                      : formatMoney(row.total, row.currency)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={row.status} />
                  <Badge variant="muted">{PAYMENT_STATUS_LABELS[row.paymentStatus]}</Badge>
                  {stale && <Badge variant="destructive">Más de 48 h</Badge>}
                  {row.channel === "admin" && <Badge variant="muted">Admin</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {row.items} {row.items === 1 ? "producto" : "productos"}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <a
                      href={`https://wa.me/${row.customerPhone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`WhatsApp de ${row.customerName} (${formatPhone(row.customerPhone)})`}
                      className="flex size-9 items-center justify-center rounded-[10px] border border-success-soft text-whatsapp"
                    >
                      <MessageCircle size={17} aria-hidden />
                    </a>
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
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
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
