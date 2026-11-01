"use client";

import {
  CURRENCY_CODES,
  convertToBase,
  formatMoney,
  marginPercent,
  priceFromCost,
  unitCost,
  type CurrencyCode,
  type MarginBasis,
} from "@kshop/core";
import { Button, Dialog, Input, Label, Segmented, Select } from "@kshop/ui";
import { useId, useState } from "react";

export type CalculatedPrice = { cost: string; costCurrency: CurrencyCode; price: string };

const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));

const BASIS_OPTIONS = [
  { value: "cost", label: "Sobre el costo" },
  { value: "price", label: "Sobre el precio" },
] as const;

/**
 * KSH0003: the unit cost and the sale price out of a wholesale purchase ("a bag of 160 candies for 250 CUP") and a
 * commercial margin. Optional: it only fills the cost and the price of the variant (or of every variant) on «Usar».
 */
export function PriceCalculatorDialog({
  open,
  onClose,
  target,
  baseCurrency,
  rate,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  /** What the result goes to: a variant name or «todas las variantes». */
  target: string;
  baseCurrency: CurrencyCode;
  /** Base units per 1 unit of a currency, undefined when the store has no rate for it. */
  rate: (currency: CurrencyCode) => number | undefined;
  onApply: (result: CalculatedPrice) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Calcular costo y precio" description={target}>
      {open && <CalculatorForm baseCurrency={baseCurrency} rate={rate} onApply={onApply} onClose={onClose} />}
    </Dialog>
  );
}

function CalculatorForm({
  baseCurrency,
  rate,
  onApply,
  onClose,
}: {
  baseCurrency: CurrencyCode;
  rate: (currency: CurrencyCode) => number | undefined;
  onApply: (result: CalculatedPrice) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [lotCost, setLotCost] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(baseCurrency);
  const [units, setUnits] = useState("1");
  const [margin, setMargin] = useState("");
  const [basis, setBasis] = useState<MarginBasis>("cost");
  const [rounding, setRounding] = useState("");

  const lotCostN = num(lotCost);
  const unitsN = num(units);
  const marginN = num(margin);
  const roundingN = num(rounding) ?? null;
  const costRate = rate(currency);

  const cost =
    lotCostN != null && lotCostN >= 0 && unitsN != null && unitsN > 0 ? unitCost(lotCostN, unitsN) : null;
  const costBase = cost != null && costRate ? convertToBase(cost, costRate) : null;
  const marginTooHigh = basis === "price" && marginN != null && marginN >= 100;
  const price =
    costBase != null && marginN != null && marginN >= 0 && !marginTooHigh
      ? priceFromCost(costBase, marginN, basis, roundingN)
      : null;
  const realMargin = price != null ? marginPercent(price, costBase) : null;

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      data-testid="price-calculator"
      onSubmit={(e) => {
        e.preventDefault();
        if (cost == null || price == null) return;
        onApply({ cost: String(cost), costCurrency: currency, price: String(price) });
        onClose();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-lot`}>Pagaste</Label>
        <div className="flex gap-1">
          <Input
            id={`${id}-lot`}
            inputMode="decimal"
            value={lotCost}
            onChange={(e) => setLotCost(e.target.value)}
            placeholder="250"
            className="min-w-0 flex-1"
            autoFocus
          />
          <Select
            aria-label="Moneda de la compra"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            className="w-auto"
          >
            {CURRENCY_CODES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-units`}>Por cuántas unidades</Label>
        <Input
          id={`${id}-units`}
          inputMode="numeric"
          value={units}
          onChange={(e) => setUnits(e.target.value)}
          placeholder="160"
        />
        <p className="text-xs text-muted-foreground">La bolsa, la caja o el paquete que compraste.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-margin`}>Margen comercial (%)</Label>
        <Input
          id={`${id}-margin`}
          inputMode="decimal"
          value={margin}
          onChange={(e) => setMargin(e.target.value)}
          placeholder="30"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Cómo se aplica</span>
        <Segmented
          options={BASIS_OPTIONS}
          value={basis}
          onSelect={setBasis}
          label="Cómo se aplica el margen"
        />
        <p className="text-xs text-muted-foreground">
          {basis === "cost"
            ? "Se suma al costo: 100 al 30 % se vende a 130."
            : "Es la parte del precio que te queda: 100 al 30 % se vende a 142,86."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-rounding`}>Redondear el precio hacia arriba</Label>
        <Select id={`${id}-rounding`} value={rounding} onChange={(e) => setRounding(e.target.value)}>
          <option value="">Al centavo</option>
          <option value="1">A {formatMoney(1, baseCurrency)}</option>
          <option value="5">A {formatMoney(5, baseCurrency)}</option>
          <option value="10">A {formatMoney(10, baseCurrency)}</option>
          <option value="50">A {formatMoney(50, baseCurrency)}</option>
        </Select>
      </div>

      <div className="rounded-md bg-surface p-3 text-sm sm:col-span-2" aria-live="polite">
        {cost == null ? (
          <p className="text-muted-foreground">Escribe cuánto pagaste y por cuántas unidades.</p>
        ) : !costRate ? (
          <p className="text-destructive">Falta la tasa de {currency} (pestaña Monedas).</p>
        ) : (
          <>
            <p>
              Costo por unidad: <strong>{formatMoney(cost, currency)}</strong>
              {currency !== baseCurrency && costBase != null && (
                <span className="text-muted-foreground"> ({formatMoney(costBase, baseCurrency)})</span>
              )}
            </p>
            {marginTooHigh ? (
              <p className="text-destructive">Un margen sobre el precio tiene que ser menor que 100 %.</p>
            ) : price == null ? (
              <p className="text-muted-foreground">Escribe el margen para ver el precio de venta.</p>
            ) : (
              <p>
                Precio de venta: <strong>{formatMoney(price, baseCurrency)}</strong>
                {realMargin != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    · margen sobre el precio {realMargin.toLocaleString("es")} %
                  </span>
                )}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={cost == null || price == null}>
          Usar
        </Button>
      </div>
    </form>
  );
}
