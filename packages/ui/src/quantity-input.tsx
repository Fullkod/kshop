"use client";

import { useState, type ComponentProps } from "react";
import { cn } from "./cn";
import { Input } from "./components";

// KSH0015: a quantity field for products sold by unit or by weight or measure. Text with `inputMode`, never
// type="number": iOS hides the comma there, and the Spanish keyboards type «1,5».

const format = (n: number, decimals: boolean) =>
  decimals ? String(Math.round(n * 100) / 100).replace(".", ",") : String(Math.round(n));

function parse(text: string, decimals: boolean): number | null {
  const clean = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  const n = Number(clean);
  if (!Number.isFinite(n)) return null;
  return decimals ? Math.round(n * 100) / 100 : Number.isInteger(n) ? n : null;
}

export type QuantityInputProps = Omit<ComponentProps<"input">, "value" | "onChange" | "type" | "min" | "max"> & {
  value: number;
  onValueChange: (value: number) => void;
  /** Decimals (2) for weight and measure; whole numbers for units. */
  decimals?: boolean;
  /** «lb», «kg»… shown inside the field. */
  suffix?: string;
  min?: number;
  max?: number;
};

export function QuantityInput({
  value,
  onValueChange,
  decimals = false,
  suffix,
  min = 0,
  max = 99_999,
  className,
  onBlur,
  ...props
}: QuantityInputProps) {
  // What is being typed; otherwise the value as it is (so «+» or «Por importe» from outside show at once).
  const [text, setText] = useState<string | null>(null);

  return (
    <div className="relative">
      <Input
        {...props}
        type="text"
        inputMode={decimals ? "decimal" : "numeric"}
        autoComplete="off"
        value={text ?? format(value, decimals)}
        onChange={(e) => {
          setText(e.target.value);
          const n = parse(e.target.value, decimals);
          if (n !== null && n >= min && n <= max) onValueChange(n);
        }}
        onBlur={(e) => {
          setText(null);
          onBlur?.(e);
        }}
        className={cn("text-base", suffix && "pr-10", className)}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}
