"use client";

import { Button, cn, SlidersHorizontal } from "@kshop/ui";
import { useId, useState, type ReactNode } from "react";

/**
 * The filters of a list. On a wide screen they are always in view; on a phone they wait behind a «Filtros» button, so
 * the list itself starts on the first screen. The search field, if any, stays in view everywhere.
 */
export function FilterBar({
  search,
  children,
  label = "Filtros",
  active = 0,
  layout = "md:flex md:flex-wrap md:items-end",
  className,
  testId,
}: {
  /** Always visible, next to the button. */
  search?: ReactNode;
  children: ReactNode;
  /** What the button says on a phone; the number of active filters goes after it. */
  label?: string;
  active?: number;
  /** How the filters lay out from `md` up; on a phone they stack. */
  layout?: string;
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid={testId}>
      <div className="flex items-center gap-2 md:hidden">
        {search && <div className="min-w-0 flex-1">{search}</div>}
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          data-testid="filters-toggle"
        >
          <SlidersHorizontal size={16} aria-hidden />
          {label}
          {active > 0 && ` · ${active}`}
        </Button>
      </div>
      {search && <div className="hidden md:block">{search}</div>}
      <div id={id} className={cn(open ? "grid" : "hidden md:grid", "gap-3", layout)}>
        {children}
      </div>
    </div>
  );
}
