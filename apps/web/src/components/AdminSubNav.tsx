"use client";

import { cn } from "@kshop/ui";
import Link from "next/link";
import { useEffect, useRef } from "react";

export type SubNavItem = { href: string; label: string; active: boolean };

/**
 * The tabs under a module title (Pedidos · Nuevo pedido · Clientes…). On a phone they run to the screen edges, the
 * active one scrolls into view and each is tall enough to tap; on a wide screen they look as before.
 */
export function AdminSubNav({
  label,
  items,
  className,
}: {
  label: string;
  items: readonly SubNavItem[];
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const activeHref = items.find((i) => i.active)?.href;

  useEffect(() => {
    const nav = ref.current;
    const tab = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !tab || nav.scrollWidth <= nav.clientWidth) return;
    const left = tab.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
    nav.scrollLeft = Math.max(0, left - (nav.clientWidth - tab.offsetWidth) / 2);
  }, [activeHref]);

  return (
    <nav
      ref={ref}
      aria-label={label}
      className={cn(
        "-mx-4 mb-6 flex gap-5 overflow-x-auto px-4 shadow-[inset_0_-1px_0_var(--line)] [scrollbar-width:none] md:mx-0 md:px-0",
        className,
      )}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "flex min-h-11 shrink-0 items-center border-b-2 border-transparent pt-1 pb-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground md:min-h-0",
            item.active && "border-primary font-bold text-primary",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
