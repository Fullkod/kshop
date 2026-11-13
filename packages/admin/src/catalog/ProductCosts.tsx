"use client";

import {
  convertToBase,
  CURRENCY_CODES,
  formatMoney,
  marginPercent,
  type CurrencyCode,
  type VariantCostsInput,
} from "@kshop/core";
import { Alert, Button, Dialog, Input } from "@kshop/ui";
import { useState } from "react";
import { useApiAction, useCatalogApi } from "./use-catalog";

// KSH0022 (Leo): the costs in Catálogo › Productos, to check and fix them every day without opening each product.
// One variant: the cost is edited in its cell and saved on leaving it (or Enter). Several: «Editar» opens a dialog with
// every variant. Only the costs are saved (PUT catalog/costs), owner and admins.

export type CostVariant = {
  id: string;
  sku: string;
  name: string | null;
  price: string | null;
  sortOrder?: number | null;
  variantCosts: { costPrice: string | null; costCurrency: unknown } | null;
};
export type Cost = { price: number; currency: CurrencyCode } | null;
/** The rate of a currency to the base; undefined: the store has none; null: the currencies are still loading. */
type Rate = (currency: CurrencyCode) => number | undefined | null;

const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));
const costOf = (v: CostVariant): Cost =>
  v.variantCosts?.costPrice != null
    ? { price: Number(v.variantCosts.costPrice), currency: v.variantCosts.costCurrency as CurrencyCode }
    : null;

function marginText(price: string | null, cost: Cost, rate: Rate): string | null {
  if (!cost || price == null) return null;
  const r = rate(cost.currency);
  if (r === null) return null;
  if (!r) return `Falta la tasa de ${cost.currency}`;
  const m = marginPercent(Number(price), convertToBase(cost.price, r));
  return m == null ? null : `Margen ${m}%`;
}

/** The «Costo» cell of a product row. */
export function CostCell({
  productName,
  variants,
  baseCurrency,
  rate,
  onSaved,
}: {
  productName: string;
  variants: CostVariant[];
  baseCurrency: CurrencyCode;
  rate: Rate;
  onSaved: (costs: { variantId: string; cost: Cost }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  variants = [...variants].sort(
    (a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
  );
  if (variants.length === 1) {
    return (
      <InlineCost
        productName={productName}
        variant={variants[0]!}
        baseCurrency={baseCurrency}
        rate={rate}
        onSaved={onSaved}
      />
    );
  }
  const costs = variants.map(costOf);
  const missing = costs.filter((c) => c == null).length;
  const known = costs.filter((c): c is NonNullable<Cost> => c != null);
  const currencies = new Set(known.map((c) => c.currency));
  let summary = "Sin costo";
  if (known.length > 0 && currencies.size === 1) {
    const cur = known[0]!.currency;
    const min = Math.min(...known.map((c) => c.price));
    const max = Math.max(...known.map((c) => c.price));
    summary =
      min === max
        ? formatMoney(min, cur)
        : `${formatMoney(min, cur).replace(` ${cur}`, "")}–${formatMoney(max, cur)}`;
  } else if (known.length > 0) {
    summary = "Varias monedas";
  }
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span>
        <span className={known.length === 0 ? "text-destructive" : ""}>{summary}</span>
        {missing > 0 && known.length > 0 && (
          <span className="block text-xs text-destructive">{missing} sin costo</span>
        )}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label={`Editar costos de ${productName}`}
      >
        Editar
      </Button>
      <CostsDialog
        open={open}
        onClose={() => setOpen(false)}
        productName={productName}
        variants={variants}
        baseCurrency={baseCurrency}
        rate={rate}
        onSaved={(saved) => {
          onSaved(saved);
          setOpen(false);
        }}
      />
    </div>
  );
}

function InlineCost({
  productName,
  variant,
  baseCurrency,
  rate,
  onSaved,
}: {
  productName: string;
  variant: CostVariant;
  baseCurrency: CurrencyCode;
  rate: Rate;
  onSaved: (costs: { variantId: string; cost: Cost }[]) => void;
}) {
  const { catalog } = useCatalogApi();
  const action = useApiAction();
  const saved = costOf(variant);
  const [text, setText] = useState(saved ? String(saved.price).replace(".", ",") : "");
  const [currency, setCurrency] = useState<CurrencyCode>(saved?.currency ?? baseCurrency);
  const [done, setDone] = useState(false);

  async function save(nextCurrency = currency) {
    const n = num(text);
    if (n !== undefined && !(Number.isFinite(n) && n >= 0)) {
      action.setError("Escribe un número.");
      return;
    }
    const cost: Cost = n === undefined ? null : { price: n, currency: nextCurrency };
    if (cost?.price === saved?.price && cost?.currency === saved?.currency) return;
    if (cost === null && saved === null) return;
    const input: VariantCostsInput = { costs: [{ variantId: variant.id, cost }] };
    const ok = await action.run(() => catalog.setVariantCosts(input));
    if (ok) {
      onSaved([{ variantId: variant.id, cost }]);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }
  }

  const margin = marginText(variant.price, saved, rate);
  return (
    <div className="min-w-[11rem]">
      <div className="flex gap-1">
        <Input
          aria-label={`Costo de ${productName}`}
          inputMode="decimal"
          placeholder="Sin costo"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => save()}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="w-24 min-w-0"
          data-testid="product-cost"
        />
        <select
          aria-label={`Moneda del costo de ${productName}`}
          value={currency}
          onChange={(e) => {
            const next = e.target.value as CurrencyCode;
            setCurrency(next);
            if (num(text) !== undefined) void save(next);
          }}
          className="rounded-md border bg-background px-1 text-sm"
        >
          {CURRENCY_CODES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <p className={`mt-1 text-xs ${action.error ? "text-destructive" : "text-muted-foreground"}`}>
        {action.error ?? (action.pending ? "Guardando…" : done ? "Guardado" : margin)}
      </p>
    </div>
  );
}

function CostsDialog({
  open,
  onClose,
  productName,
  variants,
  baseCurrency,
  rate,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  productName: string;
  variants: CostVariant[];
  baseCurrency: CurrencyCode;
  rate: Rate;
  onSaved: (costs: { variantId: string; cost: Cost }[]) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Costos" description={productName} size="lg">
      {open && (
        <CostsForm
          variants={variants}
          baseCurrency={baseCurrency}
          rate={rate}
          onSaved={onSaved}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function CostsForm({
  variants,
  baseCurrency,
  rate,
  onSaved,
  onClose,
}: {
  variants: CostVariant[];
  baseCurrency: CurrencyCode;
  rate: Rate;
  onSaved: (costs: { variantId: string; cost: Cost }[]) => void;
  onClose: () => void;
}) {
  const { catalog } = useCatalogApi();
  const action = useApiAction();
  const [rows, setRows] = useState(() =>
    variants.map((v) => {
      const c = costOf(v);
      return { text: c ? String(c.price).replace(".", ",") : "", currency: c?.currency ?? baseCurrency };
    }),
  );
  const set = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((current) => current.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save() {
    const changes: { variantId: string; cost: Cost }[] = [];
    for (const [i, v] of variants.entries()) {
      const n = num(rows[i]!.text);
      if (n !== undefined && !(Number.isFinite(n) && n >= 0)) {
        action.setError(`Revisa el costo de ${v.name || v.sku}.`);
        return;
      }
      const cost: Cost = n === undefined ? null : { price: n, currency: rows[i]!.currency };
      const before = costOf(v);
      if (cost?.price !== before?.price || cost?.currency !== before?.currency)
        changes.push({ variantId: v.id, cost });
    }
    if (changes.length === 0) return onClose();
    const ok = await action.run(() => catalog.setVariantCosts({ costs: changes }));
    if (ok) onSaved(changes);
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <ul className="flex flex-col divide-y" data-testid="costs-dialog">
          {variants.map((v, i) => {
            const n = num(rows[i]!.text);
            const preview: Cost =
              n === undefined || !Number.isFinite(n) ? null : { price: n, currency: rows[i]!.currency };
            const margin = marginText(v.price, preview, rate);
            return (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{v.name || v.sku}</span>
                  <span className="block text-xs text-muted-foreground">
                    {v.sku}
                    {v.price != null && ` · ${formatMoney(Number(v.price), baseCurrency)}`}
                  </span>
                </span>
                <span>
                  <span className="flex gap-1">
                    <Input
                      aria-label={`Costo de ${v.name || v.sku}`}
                      inputMode="decimal"
                      placeholder="Sin costo"
                      value={rows[i]!.text}
                      onChange={(e) => set(i, { text: e.target.value })}
                      className="w-24"
                    />
                    <select
                      aria-label={`Moneda del costo de ${v.name || v.sku}`}
                      value={rows[i]!.currency}
                      onChange={(e) => set(i, { currency: e.target.value as CurrencyCode })}
                      className="rounded-md border bg-background px-1 text-sm"
                    >
                      {CURRENCY_CODES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </span>
                  {margin && (
                    <span className="mt-1 block text-right text-xs text-muted-foreground">{margin}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {action.error && (
          <Alert variant="destructive" className="mt-3">
            {action.error}
          </Alert>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={action.pending}>
          {action.pending ? "Guardando…" : "Guardar costos"}
        </Button>
      </div>
    </form>
  );
}
