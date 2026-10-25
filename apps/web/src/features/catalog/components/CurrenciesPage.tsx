"use client";

import { CURRENCY_CODES, type CurrencyCode } from "@kshop/core";
import { Alert, Badge, Button, Card, Input, Label } from "@kshop/ui";
import { useState } from "react";
import { useApiAction, useCatalogApi, useCatalogStructure } from "../use-catalog";

/** Base currency + exchange rates. Rates of other currencies are needed for costs (Base plan) and,
 * with multi_currency (Pro), to sell in more than one currency. */
export function CurrenciesPage() {
  const { data, error, reload } = useCatalogStructure();
  const { catalog, canManageStructure, has } = useCatalogApi();
  const action = useApiAction();
  const [savedCurrency, setSavedCurrency] = useState<CurrencyCode | null>(null);

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;

  const base = data.currencies.find((c) => c.isBase);
  const multiCurrency = has("multi_currency");

  async function save(currency: CurrencyCode, form: HTMLFormElement) {
    const values = new FormData(form);
    const ok = await action.run(() =>
      catalog.setCurrency({
        currency,
        rateToBase: Number(values.get("rate")),
        sells: values.get("sells") === "on",
        rounding: values.get("rounding") ? Number(values.get("rounding")) : undefined,
      }),
    );
    if (ok) {
      setSavedCurrency(currency);
      reload();
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Monedas</h2>
        <p className="text-sm text-muted-foreground">
          Los precios se guardan en la moneda principal ({base?.currency}). Las tasas sirven para calcular
          costos y márgenes{multiCurrency ? " y para vender en otras monedas" : ""}. Las fijas tú, a mano.
        </p>
      </div>
      {action.error && <Alert variant="destructive">{action.error}</Alert>}
      {CURRENCY_CODES.map((code) => {
        const row = data.currencies.find((c) => c.currency === code);
        if (row?.isBase) {
          return (
            <Card key={code} className="flex items-center justify-between">
              <span className="font-medium">{code}</span>
              <Badge>Moneda principal</Badge>
            </Card>
          );
        }
        return (
          <Card key={code}>
            <form
              className="grid items-end gap-3 sm:grid-cols-[6rem_1fr_1fr_auto_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                void save(code, e.currentTarget);
              }}
            >
              <span className="font-medium sm:pb-2">{code}</span>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`rate-${code}`}>
                  1 {code} = ? {base?.currency}
                </Label>
                <Input
                  id={`rate-${code}`}
                  name="rate"
                  inputMode="decimal"
                  defaultValue={row ? String(row.rateToBase) : ""}
                  disabled={!canManageStructure}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`rounding-${code}`}>Redondear a (opcional)</Label>
                <Input
                  id={`rounding-${code}`}
                  name="rounding"
                  inputMode="decimal"
                  placeholder="5, 10, 0.5…"
                  defaultValue={row?.rounding ? String(row.rounding) : ""}
                  disabled={!canManageStructure || !multiCurrency}
                />
              </div>
              <label
                className="flex items-center gap-2 text-sm sm:pb-2"
                title={multiCurrency ? "" : "Disponible en el plan Pro"}
              >
                <input
                  type="checkbox"
                  name="sells"
                  defaultChecked={row?.sells ?? false}
                  disabled={!canManageStructure || !multiCurrency}
                />
                Vender en {code}
                {!multiCurrency && <Badge variant="gold">Pro</Badge>}
              </label>
              {canManageStructure && (
                <Button type="submit" variant="outline" disabled={action.pending}>
                  {savedCurrency === code ? "Guardado" : "Guardar"}
                </Button>
              )}
            </form>
          </Card>
        );
      })}
    </div>
  );
}
