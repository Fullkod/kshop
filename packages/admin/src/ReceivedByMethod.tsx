import { formatMoney } from "@kshop/core";
import type { SalesToday } from "@kshop/data";
import { cn } from "@kshop/ui";

/** «Por método: Transferencia 500 CUP · Efectivo 300 CUP» of Ventas de hoy (KSH0010); nothing without methods. */
export function ReceivedByMethod({
  byMethod,
  className,
}: {
  byMethod: SalesToday["byMethod"] | undefined;
  className?: string;
}) {
  if (!byMethod?.length) return null;
  const methods = new Map<string, string[]>();
  for (const m of byMethod) {
    methods.set(m.method, [...(methods.get(m.method) ?? []), formatMoney(m.amount, m.currency)]);
  }
  return (
    <p className={cn("text-sm text-muted-foreground", className)} data-testid="received-by-method">
      Por método:{" "}
      {[...methods].map(([name, amounts], i) => (
        <span key={name}>
          {i > 0 && " · "}
          <span className="font-medium text-foreground">{name}</span> {amounts.join(" + ")}
        </span>
      ))}
    </p>
  );
}
