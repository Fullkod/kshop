"use client";

import { CURRENCY_CODES, type CurrencyCode } from "@kshop/core";
import { ApiError, type CurrencyRatesResponse, type StoreCurrencyRates } from "@kshop/data";
import { Alert, Badge, Button, Card, Input, Label, cn } from "@kshop/ui";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAdmin } from "@/app/s/[storeSlug]/admin/admin-context";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";

// Admin › Monedas (module multi_currency, PRP-6 D16, D17). The owner sets every rate by hand (decision 4); elTOQUE's
// informal rate is only shown as a suggestion and never applied by itself. Changing a rate moves the converted
// prices of the storefront, not the fixed prices nor any existing order.

const number = (value: number) => new Intl.NumberFormat("es", { maximumFractionDigits: 4 }).format(value);

export function CurrencyRatesPage() {
  const store = useStore();
  const admin = useAdmin();
  const { api } = useSession();
  const [data, setData] = useState<CurrencyRatesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api
        .currencyRates(store.id)
        .get()
        .then(setData, (e: unknown) =>
          setError(e instanceof ApiError ? e.message : "No se pudieron cargar las monedas."),
        ),
    [api, store.id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (admin.role === "staff") {
    return <Alert variant="destructive">Solo el dueño y los administradores cambian las tasas.</Alert>;
  }
  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;

  const missing = CURRENCY_CODES.filter((c) => !data.currencies.some((x) => x.currency === c));
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Monedas</h1>
        <p className="text-sm text-muted-foreground">
          Los precios se guardan en {data.baseCurrency}. En las demás monedas la tienda los convierte con tu
          tasa (y el redondeo), salvo los productos con precio fijo en esa moneda. Cambiar una tasa no toca
          los pedidos ya hechos.
        </p>
        {data.reference && (
          <p className="mt-1 text-xs text-muted-foreground">
            Tasa de referencia: mercado informal según elTOQUE ({formatDate(data.reference.date)}). Es solo
            una sugerencia.
          </p>
        )}
      </div>
      {data.currencies
        .filter((c) => !c.isBase)
        .map((c) => (
          <CurrencyCard key={c.currency} base={data.baseCurrency} row={c} onSaved={load} />
        ))}
      {missing.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Para añadir {missing.join(" o ")} ve a{" "}
          <Link href="/admin/catalog/currencies" className="underline">
            Catálogo › Monedas
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function CurrencyCard({
  base,
  row,
  onSaved,
}: {
  base: CurrencyCode;
  row: StoreCurrencyRates;
  onSaved: () => Promise<unknown>;
}) {
  const store = useStore();
  const { api } = useSession();
  const [rate, setRate] = useState(String(row.rateToBase));
  const [rounding, setRounding] = useState(row.rounding ? String(row.rounding) : "");
  const [sells, setSells] = useState(row.sells);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      await api.catalog(store.id).setCurrency({
        currency: row.currency,
        rateToBase: Number(rate),
        sells,
        rounding: rounding ? Number(rounding) : undefined,
      });
      await onSaved();
      setMessage({ ok: true, text: "Guardado. Los precios de la tienda ya usan la tasa nueva." });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : "No se pudo guardar." });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4" data-testid={`currency-${row.currency}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{row.currency}</h2>
        {row.sells ? <Badge variant="success">Se vende</Badge> : <Badge variant="muted">Solo costos</Badge>}
        <span className="text-sm text-muted-foreground">
          1 {row.currency} = {number(row.rateToBase)} {base}
        </span>
      </div>

      <form onSubmit={(e) => void save(e)} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`rate-${row.currency}`}>
            1 {row.currency} = ? {base}
          </Label>
          <Input
            id={`rate-${row.currency}`}
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`rounding-${row.currency}`}>Redondear a (opcional)</Label>
          <Input
            id={`rounding-${row.currency}`}
            inputMode="decimal"
            placeholder="5, 10, 0.5…"
            value={rounding}
            onChange={(e) => setRounding(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm sm:pb-2">
          <input type="checkbox" checked={sells} onChange={(e) => setSells(e.target.checked)} />
          Vender en {row.currency}
        </label>
        <Button type="submit" disabled={pending}>
          Actualizar tasa
        </Button>
      </form>

      {row.suggested !== null && (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-testid={`suggested-${row.currency}`}>
          <span>
            elTOQUE hoy: 1 {row.currency} = {number(row.suggested)} {base}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => setRate(String(row.suggested))}>
            Usar esta tasa
          </Button>
        </div>
      )}
      {row.fixedPrices > 0 && (
        <p className="text-sm text-muted-foreground">
          {row.fixedPrices} {row.fixedPrices === 1 ? "producto tiene" : "productos tienen"} precio fijo en{" "}
          {row.currency} y no {row.fixedPrices === 1 ? "cambia" : "cambian"} con la tasa.
        </p>
      )}
      {message && (
        <p className={cn("text-sm", message.ok ? "text-success" : "text-destructive")} role="status">
          {message.text}
        </p>
      )}

      {row.history.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Historial de tasas</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid={`history-${row.currency}`}>
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Fecha</th>
                  <th className="py-1 font-medium">Tasa</th>
                  <th className="py-1 font-medium">Quién</th>
                </tr>
              </thead>
              <tbody>
                {row.history.map((h) => (
                  <tr key={h.setAt} className="border-t">
                    <td className="py-1">{formatDate(h.setAt)}</td>
                    <td className="py-1 tabular-nums">
                      {number(h.rate)} {base}
                    </td>
                    <td className="py-1 text-muted-foreground">{h.setBy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Card>
  );
}
