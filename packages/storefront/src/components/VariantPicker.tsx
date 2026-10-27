"use client";

import type { StorefrontProduct } from "@kshop/data";
import { useMemo, useState } from "react";

type Variant = StorefrontProduct["variants"][number];

type Axis = {
  attributeId: string;
  name: string;
  values: { valueId: string; value: string; swatch: string | null; sort: number }[];
};

function variantAxes(variants: Variant[]): Axis[] {
  const axes = new Map<string, Axis & { sort: number }>();
  for (const v of variants) {
    for (const o of v.options) {
      const axis = axes.get(o.attributeId) ?? {
        attributeId: o.attributeId,
        name: o.attribute,
        values: [],
        sort: o.attributeSort,
      };
      if (!axis.values.some((x) => x.valueId === o.valueId)) {
        axis.values.push({ valueId: o.valueId, value: o.value, swatch: o.swatch, sort: o.valueSort });
      }
      axes.set(o.attributeId, axis);
    }
  }
  return [...axes.values()]
    .sort((a, b) => a.sort - b.sort)
    .map((a) => ({ ...a, values: a.values.sort((x, y) => x.sort - y.sort) }));
}

/** Selected value per attribute, starting on the first available variant. */
export function useVariantSelection(variants: Variant[]) {
  const axes = useMemo(() => variantAxes(variants), [variants]);
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const initial = variants.find((v) => v.available) ?? variants[0];
    return Object.fromEntries((initial?.options ?? []).map((o) => [o.attributeId, o.valueId]));
  });
  const variant = variants.find((v) => v.options.every((o) => selected[o.attributeId] === o.valueId));
  const has = (v: Variant, attributeId: string, valueId: string) =>
    v.options.some((o) => o.attributeId === attributeId && o.valueId === valueId);
  // A value is available if some available variant has it together with the other selected values.
  const valueAvailable = (attributeId: string, valueId: string) =>
    variants.some(
      (v) =>
        v.available &&
        has(v, attributeId, valueId) &&
        v.options.every((o) => o.attributeId === attributeId || selected[o.attributeId] === o.valueId),
    );
  // Sold out everywhere: no available variant has it at all (shown struck, not selectable; PRP-R answer 10).
  const valueSoldOut = (attributeId: string, valueId: string) =>
    !variants.some((v) => v.available && has(v, attributeId, valueId));
  // Picking a value that only exists with other options moves to the first available combination that has it.
  const pick = (attributeId: string, valueId: string) =>
    setSelected((s) => {
      const next = { ...s, [attributeId]: valueId };
      const exact = variants.find(
        (v) => v.available && v.options.every((o) => next[o.attributeId] === o.valueId),
      );
      if (exact) return next;
      const other = variants.find((v) => v.available && has(v, attributeId, valueId));
      return other ? Object.fromEntries(other.options.map((o) => [o.attributeId, o.valueId])) : next;
    });
  return { axes, selected, pick, variant, valueAvailable, valueSoldOut };
}

/** Sizes as 52×46 chips, colors as a chip with the real swatch; sold-out values stay visible, dashed, struck and
 *  disabled. */
export function VariantPicker({
  selection,
  onPick,
}: {
  selection: ReturnType<typeof useVariantSelection>;
  onPick?: () => void;
}) {
  const { axes, selected, pick, valueSoldOut } = selection;
  return (
    <>
      {axes.map((axis) => (
        <fieldset key={axis.attributeId} className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-sm font-semibold">
            {axis.name}:{" "}
            <span className="font-normal text-muted-foreground">
              {axis.values.find((v) => v.valueId === selected[axis.attributeId])?.value ?? "elige una opción"}
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {axis.values.map((v) => {
              const on = selected[axis.attributeId] === v.valueId;
              const available = !valueSoldOut(axis.attributeId, v.valueId);
              return (
                <button
                  key={v.valueId}
                  type="button"
                  onClick={() => {
                    pick(axis.attributeId, v.valueId);
                    onPick?.();
                  }}
                  aria-pressed={on}
                  disabled={!available}
                  className={`flex h-[46px] items-center justify-center gap-2 rounded-sf-btn text-sm outline-none focus-visible:shadow-[0_0_0_4px_var(--ring)] ${v.swatch ? "pr-3.5 pl-2.5" : "min-w-[52px] px-3"} ${
                    on
                      ? `border-2 border-primary font-semibold ${v.swatch ? "" : "bg-accent-soft text-primary"}`
                      : available
                        ? "border border-border hover:border-foreground"
                        : "border border-dashed border-border text-muted-foreground line-through"
                  }`}
                >
                  {v.swatch && (
                    <span
                      className="size-5 shrink-0 rounded-full border border-border"
                      style={{ background: v.swatch }}
                      aria-hidden
                    />
                  )}
                  {v.value}
                  {!available && <span className="sr-only">(agotado)</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </>
  );
}
