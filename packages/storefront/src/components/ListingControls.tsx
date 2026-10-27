"use client";

import { listingQuery, SORT_LABELS, type ListingState, type ProductSort } from "@kshop/core";
import { useRouter } from "../navigation";
import { useState } from "react";

/** Sort select and price range: they change the URL (the listing is rendered on the server from it). */
export function SortSelect({ basePath, state }: { basePath: string; state: ListingState }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Ordenar</span>
      <select
        value={state.sort}
        onChange={(e) =>
          router.push(
            `${basePath}${listingQuery({ ...state, sort: e.target.value as ProductSort, page: 1 })}`,
          )
        }
        className="h-9 rounded-sf-btn border bg-background px-2 text-sm"
      >
        {Object.entries(SORT_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PriceFilter({
  basePath,
  state,
  currency,
}: {
  basePath: string;
  state: ListingState;
  currency: string;
}) {
  const router = useRouter();
  const [min, setMin] = useState(state.minPrice != null ? String(state.minPrice) : "");
  const [max, setMax] = useState(state.maxPrice != null ? String(state.maxPrice) : "");
  const toNumber = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(
          `${basePath}${listingQuery({ ...state, minPrice: toNumber(min), maxPrice: toNumber(max), page: 1 })}`,
        );
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Mín. ({currency})
        <input
          inputMode="numeric"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          className="h-9 w-24 rounded-sf-btn border bg-background px-2 text-sm text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Máx. ({currency})
        <input
          inputMode="numeric"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          className="h-9 w-24 rounded-sf-btn border bg-background px-2 text-sm text-foreground"
        />
      </label>
      <button type="submit" className="h-9 rounded-sf-btn border px-3 text-sm hover:bg-surface">
        Aplicar
      </button>
    </form>
  );
}
