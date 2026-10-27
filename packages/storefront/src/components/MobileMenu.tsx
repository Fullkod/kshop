"use client";

import type { NavLink } from "@kshop/data";
import { Flame, Menu } from "@kshop/ui";
import { useEffect, useRef, useState } from "react";
import { Link } from "../navigation";
import { iconButton, SALE_HREF } from "./header-shared";

/**
 * Hamburger below 1180: a <details> panel under the header (opens without JS). It closes when a link is followed
 * (client navigation keeps the header mounted), on Escape and on a tap outside.
 */
export function MobileMenu({ links }: { links: NavLink[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    if (ref.current) ref.current.open = false;
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <details
      ref={ref}
      className="group @min-[1180px]:hidden"
      onToggle={(e) => setOpen(e.currentTarget.open)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) close();
      }}
    >
      <summary
        className={`${iconButton} -ml-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
        aria-label="Menú"
      >
        <Menu size={22} aria-hidden />
      </summary>
      <nav
        aria-label="Menú principal"
        className="absolute inset-x-0 top-full max-h-[75dvh] overflow-y-auto border-b border-border bg-background px-[clamp(16px,4.4cqw,56px)] py-3 shadow-sf-lg"
      >
        <ul className="flex flex-col">
          {links.map((link) => (
            <li key={link.href + link.label}>
              <Link href={link.href} className="block py-2.5 font-medium">
                {link.label}
              </Link>
              {link.children.length > 0 && (
                <ul className="mb-2 border-l border-border pl-4">
                  {link.children.map((child) => (
                    <li key={child.href + child.label}>
                      <Link href={child.href} className="block py-2 text-sm text-muted-foreground">
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          <li>
            <Link href={SALE_HREF} className="flex items-center gap-1.5 py-2.5 font-semibold text-sale">
              <Flame size={16} aria-hidden />
              Ofertas
            </Link>
          </li>
        </ul>
      </nav>
    </details>
  );
}
