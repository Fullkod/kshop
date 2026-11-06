"use client";

import { formatMoney, parseDecimal, type CurrencyCode } from "@kshop/core";
import { Alert, Button, Dialog, Input, Label } from "@kshop/ui";
import { useState } from "react";

/**
 * Changing the price of a line (KSH0011), at the counter and in «Nuevo pedido»: anyone can; «Al costo» and the
 * below-cost warning only with the cost, which only owner and admin receive.
 */
export function LinePriceDialog({
  title,
  listPrice,
  price: current,
  note: currentNote,
  changed,
  currency,
  cost,
  onClose,
  onApply,
}: {
  title: string;
  /** The store's price of the product. */
  listPrice: number;
  price: number;
  note?: string;
  changed: boolean;
  currency: CurrencyCode;
  /** In the same currency; null when this user does not see costs or the product has none. */
  cost: number | null;
  onClose: () => void;
  onApply: (unitPrice: number, note: string) => void;
}) {
  const [price, setPrice] = useState(String(current));
  const [note, setNote] = useState(currentNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const typed = parseDecimal(price);
  const valid = price.trim() !== "" && Number.isFinite(typed) && typed >= 0;
  const below = cost !== null && valid && typed < cost;

  function apply() {
    if (!valid) {
      setError("Escribe el precio de venta.");
      return;
    }
    onApply(Math.round(typed * 100) / 100, note);
  }

  return (
    <Dialog open onClose={onClose} title={title} compact>
      <form
        className="flex flex-col gap-3"
        data-testid="line-price-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          apply();
        }}
      >
        <p className="text-sm text-muted-foreground">
          Precio de la tienda:{" "}
          <span className="font-medium text-foreground">{formatMoney(listPrice, currency)}</span>
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="line-price">Precio de venta</Label>
          <Input
            id="line-price"
            inputMode="decimal"
            value={price}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              setPrice(e.target.value);
              setError(null);
            }}
            data-testid="line-price-input"
          />
        </div>
        {cost !== null && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setPrice(String(cost))}
            data-testid="line-price-cost"
          >
            Al costo ({formatMoney(cost, currency)})
          </Button>
        )}
        {below && (
          <Alert variant="warning" data-testid="line-price-below-cost">
            Por debajo del costo ({formatMoney(cost, currency)}): esta venta pierde dinero.
          </Alert>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="line-price-note">Motivo (opcional)</Label>
          <Input
            id="line-price-note"
            value={note}
            maxLength={200}
            placeholder="Cliente fijo, liquidación…"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" data-testid="line-price-apply">
            Aplicar
          </Button>
          {changed && (
            <Button type="button" variant="ghost" onClick={() => onApply(listPrice, "")}>
              Volver al precio de la tienda
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
