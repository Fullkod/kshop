"use client";

import { formatMoney, formatQuantity, normalizeSearch, orderCode } from "@kshop/core";
import type { PosClosingSales as PosClosingSalesData, PosSaleCard } from "@kshop/data";
import { Link, useStore } from "@kshop/storefront";
import { Alert, Badge, Card, Input, Label, cn } from "@kshop/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useCheckoutSettings } from "../orders/use-orders";
import { useSession } from "../session";
import {
  currentHref,
  rememberScroll,
  rememberState,
  rememberedState,
  restoreScroll,
  setUrlParam,
} from "./screen-memory";

export const closingDayLabel = (day: string) =>
  new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
export const havanaTime = (iso: string) =>
  new Intl.DateTimeFormat("es", { timeStyle: "short", timeZone: "America/Havana" }).format(new Date(iso));

type Line = PosSaleCard["lines"][number];

/** Name, variant and SKU of a line, prepared once for the search (without accents, like the counter). */
const lineText = (l: Line) => normalizeSearch(`${l.name} ${l.variant} ${l.sku}`);

/** Every word of the search in the line: «aceite 1l» finds «Aceite (1 L)». */
export function lineMatches(text: string, words: readonly string[]) {
  return words.length > 0 && words.every((w) => text.includes(w));
}

export const lineLabel = (l: Line) =>
  `${l.name}${l.variant ? ` (${l.variant})` : ""} × ${formatQuantity(l.quantity, l.unit)}`;

/**
 * One counter sale: number, time, who sold it, total, how it was paid and its products; the lines that match the
 * search stand out. Opening it remembers where the list was (see screen-memory).
 */
export function SaleCard({
  sale,
  code,
  highlight,
  memoryKey,
  extra,
}: {
  sale: PosSaleCard;
  code: (n: number) => string;
  highlight: (line: Line, index: number) => boolean;
  memoryKey: string;
  extra?: ReactNode;
}) {
  return (
    <Card
      className={cn("flex flex-col gap-1.5 p-0 text-sm", sale.cancelled && "opacity-70")}
      data-testid="pos-sale-card"
    >
      <Link
        href={`/admin/orders/${sale.orderId}?from=${encodeURIComponent(currentHref())}`}
        onClick={() => rememberScroll(memoryKey)}
        className="flex flex-col gap-1.5 rounded-[inherit] p-4 hover:bg-surface"
      >
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">
            {code(sale.number)} · {havanaTime(sale.soldAt)}
          </span>
          <span className="flex items-center gap-2">
            {sale.cancelled && <Badge variant="destructive">Anulada</Badge>}
            <span className={cn("font-semibold tabular-nums", sale.cancelled && "line-through")}>
              {formatMoney(Number(sale.total), sale.currency)}
            </span>
          </span>
        </span>
        <span className="text-muted-foreground">
          {sale.cashier ?? "Una cuenta borrada"}
          {sale.payments.length > 0 && ` · ${sale.payments.join(", ")}`}
        </span>
        <ul className="flex flex-col gap-0.5">
          {sale.lines.map((l, i) => (
            <li
              key={i}
              className={cn(
                "flex justify-between gap-3",
                highlight(l, i) && "-mx-1 rounded bg-primary/10 px-1 font-semibold",
              )}
            >
              <span className="min-w-0">{lineLabel(l)}</span>
              <span className="shrink-0 tabular-nums">{formatMoney(Number(l.lineTotal), sale.currency)}</span>
            </li>
          ))}
        </ul>
        {extra}
      </Link>
    </Card>
  );
}

type Total = { name: string; unit: string; currency: string; quantity: number; amount: number };

/** What the matching lines add up to, per product (the voided sales apart). */
function totalsOf(sales: readonly PosSaleCard[], matches: (l: Line) => boolean): Total[] {
  const byKey = new Map<string, Total>();
  for (const s of sales) {
    if (s.cancelled) continue;
    for (const l of s.lines) {
      if (!matches(l)) continue;
      const name = l.variant ? `${l.name} (${l.variant})` : l.name;
      const key = `${name}|${l.unit}|${s.currency}`;
      const t = byKey.get(key) ?? { name, unit: l.unit, currency: s.currency, quantity: 0, amount: 0 };
      t.quantity = Math.round((t.quantity + Number(l.quantity)) * 100) / 100;
      t.amount = Math.round((t.amount + Number(l.lineTotal)) * 100) / 100;
      byKey.set(key, t);
    }
  }
  return [...byKey.values()].sort((a, b) => b.amount - a.amount);
}

/**
 * Ventas del cierre (Minimercado, 2026-11-14): the sales of one closing with their products, filtered by product on
 * the phone (?q= in the address). Opening an order and coming back keeps the filter and the spot.
 */
export function PosClosingSales({
  closingId,
  closingsHref,
  initialQuery = "",
}: {
  closingId: string;
  closingsHref: string;
  /** ?q= of the address, from the page's router (the address is not updated yet while a new page renders). */
  initialQuery?: string;
}) {
  const store = useStore();
  const { reads } = useSession();
  const { data: settings } = useCheckoutSettings();
  const memoryKey = `closing-sales:${store.id}:${closingId}`;
  const [data, setData] = useState<PosClosingSalesData | null | undefined>(() =>
    rememberedState<PosClosingSalesData>(memoryKey),
  );
  const [query, setQuery] = useState(initialQuery);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Remembered or not, read it again: a sale can be voided after the closing.
  useEffect(() => {
    let cancelled = false;
    reads.posClosingSales(store.id, closingId).then(
      (d) => {
        if (cancelled) return;
        setFailed(false);
        setData(d);
        if (d) rememberState(memoryKey, d);
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [reads, store.id, closingId, memoryKey, attempt]);

  const loaded = data !== undefined;
  useEffect(() => {
    if (loaded) restoreScroll(memoryKey);
  }, [loaded, memoryKey]);

  const words = useMemo(() => normalizeSearch(query).split(" ").filter(Boolean), [query]);
  const texts = useMemo(
    () => new Map((data?.sales ?? []).map((s) => [s.orderId, s.lines.map(lineText)])),
    [data],
  );
  const shown = useMemo(
    () =>
      words.length === 0
        ? (data?.sales ?? [])
        : (data?.sales ?? []).filter((s) => texts.get(s.orderId)!.some((t) => lineMatches(t, words))),
    [data, texts, words],
  );
  const totals = useMemo(
    () => (words.length === 0 ? [] : totalsOf(shown, (l) => lineMatches(lineText(l), words))),
    [shown, words],
  );

  if (failed && !data) {
    return (
      <Alert variant="destructive">
        No se pudieron cargar las ventas del cierre.{" "}
        <button type="button" className="underline" onClick={() => setAttempt((n) => n + 1)}>
          Reintentar
        </button>
      </Alert>
    );
  }
  if (data === undefined) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (data === null) {
    return (
      <Alert>
        No se encontró este cierre.{" "}
        <Link href={closingsHref} className="underline">
          Ver los cierres
        </Link>
      </Alert>
    );
  }

  const code = (n: number) => (settings ? orderCode(settings.orderPrefix, n) : `#${n}`);
  const active = shown.filter((s) => !s.cancelled).length;
  const voided = shown.length - active;
  const c = data.closing;

  return (
    <div className="flex flex-col gap-4" data-testid="pos-closing-sales">
      <div className="flex flex-col gap-1">
        <Link href={closingsHref} className="hidden text-sm text-muted-foreground underline md:inline">
          Cierres de caja
        </Link>
        <h2 className="font-display text-xl font-bold capitalize">
          {closingDayLabel(c.day)}
          {c.sequence > 1 && ` · cierre ${c.sequence}`}
        </h2>
        <p className="text-sm text-muted-foreground">
          Cerró {c.cashier ?? "una cuenta borrada"} · {havanaTime(c.closedAt)} · {data.sales.length}{" "}
          {data.sales.length === 1 ? "venta" : "ventas"}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="closing-sales-search">Buscar producto</Label>
        <Input
          id="closing-sales-search"
          type="search"
          value={query}
          placeholder="Nombre o código, p. ej. aceite"
          onChange={(e) => {
            setQuery(e.target.value);
            setUrlParam("q", e.target.value.trim());
          }}
          data-testid="closing-sales-search"
        />
      </div>

      {words.length > 0 && (
        <Card className="flex flex-col gap-1 text-sm" data-testid="closing-sales-summary">
          <p className="font-semibold">
            {active === 0
              ? `Ninguna venta con «${query.trim()}»`
              : `${active} ${active === 1 ? "venta" : "ventas"} con «${query.trim()}»`}
            {voided > 0 && ` · ${voided} ${voided === 1 ? "anulada" : "anuladas"} aparte`}
          </p>
          {totals.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {totals.map((t) => (
                <li key={`${t.name}|${t.unit}|${t.currency}`} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    {t.name} × {formatQuantity(t.quantity, t.unit)}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatMoney(t.amount, t.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {data.sales.length === 0 ? (
        <Card className="text-sm text-muted-foreground">Este cierre no tiene ventas.</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((s) => (
            <li key={s.orderId}>
              <SaleCard
                sale={s}
                code={code}
                memoryKey={memoryKey}
                highlight={(_, i) => lineMatches(texts.get(s.orderId)![i]!, words)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
