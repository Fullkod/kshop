"use client";

import { formatMoney, formatQuantity, parseDecimal } from "@kshop/core";
import type { ClosingProfit as ClosingProfitData, PosClosings as PosClosingsData } from "@kshop/data";
import { Link, useStore } from "@kshop/storefront";
import { Alert, Badge, Button, Card, Input, Label } from "@kshop/ui";
import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../admin-context";
import { useSession } from "../session";
import { differenceText } from "./PosCloseDay";

type Money = Record<string, number>;

const moneyList = (m: Money, zero: string) =>
  Object.entries(m)
    .filter(([, v]) => Number(v) !== 0)
    .map(([c, v]) => formatMoney(Number(v), c))
    .join(" y ") || formatMoney(0, zero);

const dayLabel = (day: string) =>
  new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
const time = (iso: string) =>
  new Intl.DateTimeFormat("es", { timeStyle: "short", timeZone: "America/Havana" }).format(new Date(iso));

/**
 * Cierres de caja (KSH0012): each closing of the till (all phones and accounts since KSH0014), what should have been
 * there, what was counted and the difference, what each account sold and its sales. Owner and admin set the float.
 */
export function PosClosings() {
  const store = useStore();
  const admin = useAdmin();
  const { reads, api } = useSession();
  const canEdit = admin.role === null || admin.role === "owner" || admin.role === "admin";
  const [data, setData] = useState<PosClosingsData | null>(null);
  const [failed, setFailed] = useState(false);

  const [attempt, setAttempt] = useState(0);
  const load = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    reads.posClosings(store.id, 30).then(
      (d) => {
        if (cancelled) return;
        setFailed(false);
        setData(d);
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [reads, store.id, attempt]);

  if (failed) {
    return (
      <Alert variant="destructive">
        No se pudieron cargar los cierres.{" "}
        <button type="button" className="underline" onClick={load}>
          Reintentar
        </button>
      </Alert>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="flex flex-col gap-4" data-testid="pos-closings">
      {canEdit && (
        <FloatForm
          currency={store.baseCurrency}
          float={data.float}
          onSave={async (float) => {
            await api.pos(store.id).setFloat(float);
            load();
          }}
        />
      )}
      {data.closings.length === 0 ? (
        <Card className="text-sm text-muted-foreground">
          Aún no hay cierres. Se cierra desde la caja: «⋯» › «Cerrar el día».
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.closings.map((c) => {
            const expected = c.expected.expected_cash ?? {};
            const diff: Money = {};
            for (const k of new Set([...Object.keys(expected), ...Object.keys(c.counted)])) {
              const d = Math.round((Number(c.counted[k] ?? 0) - Number(expected[k] ?? 0)) * 100) / 100;
              if (d !== 0) diff[k] = d;
            }
            const squares = Object.keys(diff).length === 0;
            return (
              <li key={c.id}>
                <Card className="flex flex-col gap-2 text-sm" data-testid="pos-closing">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold capitalize">
                      {dayLabel(c.day)}
                      {c.sequence > 1 && ` · cierre ${c.sequence}`}
                    </span>
                    <Badge variant={squares ? "success" : "destructive"}>{differenceText(diff)}</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    Cerró {c.cashier ?? "una cuenta borrada"} · {time(c.closedAt)} · {c.expected.sales}{" "}
                    {c.expected.sales === 1 ? "venta" : "ventas"}
                    {c.expected.voided > 0 && ` · ${c.expected.voided} anuladas`}
                    {(c.expected.older ?? 0) > 0 && ` · ${c.expected.older} de días anteriores`}
                  </p>
                  {(c.expected.by_cashier?.length ?? 0) > 1 && (
                    <ul className="flex flex-col gap-0.5 text-muted-foreground">
                      {c.expected.by_cashier!.map((v) => (
                        <li key={v.cashier}>
                          {v.cashier}: {v.sales} {v.sales === 1 ? "venta" : "ventas"}
                          {Object.keys(v.cash).length > 0 &&
                            ` · ${moneyList(v.cash, store.baseCurrency)} en efectivo`}
                        </li>
                      ))}
                    </ul>
                  )}
                  <dl className="grid grid-cols-2 gap-2">
                    <div>
                      <dt className="text-muted-foreground">Debía haber</dt>
                      <dd className="font-medium">{moneyList(expected, store.baseCurrency)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Contado</dt>
                      <dd className="font-medium">{moneyList(c.counted, store.baseCurrency)}</dd>
                    </div>
                  </dl>
                  {Object.values(c.float).some((v) => Number(v) > 0) && (
                    <p className="text-muted-foreground">Fondo: {moneyList(c.float, store.baseCurrency)}</p>
                  )}
                  {c.expected.methods.length > 0 && (
                    <p>
                      A comprobar:{" "}
                      {c.expected.methods
                        .map((m) => `${m.name} ${formatMoney(Number(m.amount), m.currency)}`)
                        .join(", ")}
                    </p>
                  )}
                  {c.profit && <ClosingProfit profit={c.profit} />}
                  {c.note && <p className="rounded bg-surface p-2">«{c.note}»</p>}
                  {c.orders.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-primary">Ver sus ventas</summary>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {c.orders.map((o) => (
                          <li key={o.id}>
                            <Link
                              href={`/admin/orders/${o.id}`}
                              className="inline-flex min-h-10 items-center rounded-md border px-3"
                            >
                              {o.number}
                              {o.cancelled && " (anulada)"}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Profit of the day (owner and admin only: the server sends nothing to the staff). Recomputed on every read, so an
 * old closing counts the costs added since; the products sold without a cost are apart, with a link to each.
 */
function ClosingProfit({ profit }: { profit: ClosingProfitData }) {
  const money = (n: number) => formatMoney(Number(n), profit.currency);
  const missing = profit.byProduct.filter((p) => p.missingCost);
  const percent =
    Number(profit.revenueWithCost) > 0
      ? `${((Number(profit.profit) * 100) / Number(profit.revenueWithCost)).toFixed(1).replace(".", ",")} %`
      : null;
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3" data-testid="pos-closing-profit">
      <dl className="grid grid-cols-3 gap-2">
        <div>
          <dt className="text-muted-foreground">Ventas</dt>
          <dd className="font-medium">{money(profit.revenue)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Costo</dt>
          <dd className="font-medium">{money(profit.cost)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ganancia</dt>
          <dd className="font-semibold text-success">
            {money(profit.profit)}
            {percent && <span className="ml-1 text-xs font-normal text-muted-foreground">{percent}</span>}
          </dd>
        </div>
      </dl>
      {profit.withoutCost.products > 0 && (
        <Alert>
          {profit.withoutCost.products === 1
            ? "1 producto vendido sin costo"
            : `${profit.withoutCost.products} productos vendidos sin costo`}{" "}
          ({money(profit.withoutCost.amount)}): su ganancia no está contada. Ponles el costo y vuelve a mirar este
          cierre.
          <ul className="mt-2 flex flex-wrap gap-2">
            {missing.map((p) =>
              p.productId ? (
                <li key={p.productId}>
                  <Link
                    href={`/admin/catalog/products/${p.productId}`}
                    className="inline-flex min-h-10 items-center rounded-md border bg-background px-3"
                  >
                    {p.name}
                  </Link>
                </li>
              ) : (
                <li key={p.name} className="inline-flex min-h-10 items-center px-1">
                  {p.name}
                </li>
              ),
            )}
          </ul>
        </Alert>
      )}
      {profit.byProduct.length > 0 && (
        <details>
          <summary className="cursor-pointer text-primary">Ganancia por producto</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">Producto</th>
                  <th className="py-1 pr-2 text-right font-medium">Cantidad</th>
                  <th className="py-1 pr-2 text-right font-medium">Venta</th>
                  <th className="py-1 pr-2 text-right font-medium">Costo</th>
                  <th className="py-1 text-right font-medium">Ganancia</th>
                </tr>
              </thead>
              <tbody>
                {profit.byProduct.map((p) => (
                  <tr key={p.productId ?? p.name} className="border-t">
                    <td className="py-1 pr-2">{p.name}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{formatQuantity(p.quantity, p.unit)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{money(p.revenue)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {p.cost == null ? <Badge variant="muted">Sin costo</Badge> : money(p.cost)}
                    </td>
                    <td className="py-1 text-right tabular-nums">{p.profit == null ? "—" : money(p.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function FloatForm({
  currency,
  float,
  onSave,
}: {
  currency: string;
  float: Money;
  onSave: (float: Money) => Promise<void>;
}) {
  const [value, setValue] = useState(float[currency] ? String(float[currency]) : "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  return (
    <Card className="flex flex-col gap-2">
      <Label htmlFor="pos-float">Fondo de caja ({currency})</Label>
      <p className="text-sm text-muted-foreground">
        El cambio con el que se abre la caja cada día. El cierre lo suma a lo que debe haber; si un día es
        distinto, se corrige al cerrar.
      </p>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = value.trim() === "" ? 0 : parseDecimal(value);
          if (!Number.isFinite(n) || n < 0) {
            setState("error");
            return;
          }
          setState("saving");
          try {
            await onSave(
              n > 0
                ? { ...float, [currency]: n }
                : Object.fromEntries(Object.entries(float).filter(([c]) => c !== currency)),
            );
            setState("saved");
          } catch {
            setState("error");
          }
        }}
      >
        <Input
          id="pos-float"
          inputMode="decimal"
          className="w-40"
          value={value}
          placeholder="0"
          onChange={(e) => {
            setValue(e.target.value);
            setState("idle");
          }}
          data-testid="pos-float-input"
        />
        <Button type="submit" disabled={state === "saving"} data-testid="pos-float-save">
          {state === "saving" ? "Guardando…" : "Guardar"}
        </Button>
      </form>
      {state === "saved" && <p className="text-sm text-success">Guardado.</p>}
      {state === "error" && <p className="text-sm text-destructive">No se pudo guardar. Revisa el número.</p>}
    </Card>
  );
}
