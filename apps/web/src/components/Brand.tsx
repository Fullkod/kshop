import { cn } from "@kshop/ui";

/** Kshop horizontal logo (brand kit). The reversed version is used on dark backgrounds. */
export function Brand({ className, reversed = false }: { className?: string; reversed?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG from the brand kit
    <img
      src={reversed ? "/brand/kshop-horizontal-reversed.svg" : "/brand/kshop-horizontal.svg"}
      alt="Kshop"
      className={cn("h-9 w-auto", className)}
    />
  );
}
