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
import { Button, CircleHelp, Dialog, Input, Label, Segmented, Select } from "@kshop/ui";
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
  const [help, setHelp] = useState(false);

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
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${id}-margin`}>Margen comercial (%)</Label>
          <button
            type="button"
            aria-label="Qué es el margen comercial"
            aria-expanded={help}
            aria-controls={`${id}-help`}
            onClick={() => setHelp(!help)}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground touch:size-10"
          >
            <CircleHelp size={18} aria-hidden />
          </button>
        </div>
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
      {help && (
        <div
          id={`${id}-help`}
          className="rounded-md border border-dashed p-3 text-sm sm:col-span-2"
          data-testid="margin-help"
        >
          <p>
            <strong>El margen comercial</strong> es lo que ganas en cada venta: la diferencia entre lo que te
            costó una unidad y el precio al que la vendes. Se puede contar de dos maneras:
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            <li>
              <strong>Sobre el costo</strong>: el porcentaje se suma a lo que pagaste. Costó 100 y pones 30 %
              → se vende a 130: ganas 30 por cada 100 que invertiste.
            </li>
            <li>
              <strong>Sobre el precio</strong>: el porcentaje es la parte del precio que te queda. Costó 100 y
              pones 30 % → se vende a 142,86: de cada 100 que cobras, 30 son ganancia. Es el «Margen» que
              enseña cada variante.
            </li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            El mismo número da precios distintos: 30 % sobre el costo equivale a 23,1 % sobre el precio.
          </p>
        </div>
      )}

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
