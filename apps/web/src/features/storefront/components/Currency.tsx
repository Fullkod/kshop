"use client";

import { convertFromBase, formatMoney, type CurrencyCode } from "@kshop/core";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { StoreCurrency } from "@/server/storefront/data";

// Decision D11: pages are rendered (and cached) in the base currency; with more than one sale currency the
// visitor's choice is applied here, in the browser, with the store rates and per-currency overrides.

type CurrencyState = {
  currencies: StoreCurrency[];
  selected: StoreCurrency;
  select: (c: CurrencyCode) => void;
};

const CurrencyContext = createContext<CurrencyState | null>(null);
const storageKey = (storeId: string) => `kshop:currency:${storeId}`;
const CHANGE_EVENT = "kshop:currency";
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
};

export function CurrencyProvider({
  storeId,
  currencies,
  children,
}: {
  storeId: string;
  currencies: StoreCurrency[];
  children: ReactNode;
}) {
  const base = currencies.find((c) => c.isBase) ?? currencies[0]!;
  // The saved choice lives in localStorage; the server (and the first render) use the base currency.
  const code = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(storageKey(storeId)),
    () => null,
  );

  const select = (next: CurrencyCode) => {
    window.localStorage.setItem(storageKey(storeId), next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  const selected = currencies.find((c) => c.currency === code) ?? base;
  return (
    <CurrencyContext.Provider value={{ currencies, selected, select }}>{children}</CurrencyContext.Provider>
  );
}

export type PriceOverride = { currency: string; price: number };

/** Formats a base-currency amount in the visitor's currency (override for that currency if any). */
export function useFormatPrice(): (amount: number, overrides?: PriceOverride[]) => string {
  const state = useContext(CurrencyContext);
  return (amount, overrides) => {
    if (!state || state.selected.isBase) return formatMoney(amount, state?.selected.currency ?? "CUP");
    const { currency, rateToBase, rounding } = state.selected;
    const value =
      overrides?.find((o) => o.currency === currency)?.price ?? convertFromBase(amount, rateToBase, rounding);
    return formatMoney(value, currency);
  };
}

/** Price in the visitor's currency: the override for that currency if any, else converted from the base. */
export function Price({
  amount,
  overrides,
  className,
}: {
  amount: number;
  overrides?: PriceOverride[];
  className?: string;
}) {
  return <span className={className}>{useFormatPrice()(amount, overrides)}</span>;
}

export function CurrencySelect() {
  const state = useContext(CurrencyContext);
  if (!state || state.currencies.length < 2) return null;
  return (
    <label className="flex items-center gap-1 text-sm">
      <span className="sr-only">Moneda</span>
      <select
        value={state.selected.currency}
        onChange={(e) => state.select(e.target.value as CurrencyCode)}
        className="h-9 rounded-[var(--sf-radius)] border bg-background px-2 text-sm"
        aria-label="Moneda"
      >
        {state.currencies.map((c) => (
          <option key={c.currency} value={c.currency}>
            {c.currency}
          </option>
        ))}
      </select>
    </label>
  );
}
