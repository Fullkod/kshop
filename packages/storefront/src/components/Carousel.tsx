"use client";

import { ChevronLeft, ChevronRight } from "@kshop/ui";
import { useRef, type ReactNode } from "react";
import { SectionHeader } from "./SectionHeader";

const arrow =
  "flex size-10 items-center justify-center rounded-full border border-border bg-background focus-visible:shadow-[0_0_0_4px_var(--ring)] focus-visible:outline-none";

/**
 * Home carousel (products, collections): the section header with «Ver todo» and, from 720 px, previous/next arrows,
 * over a snapping row that bleeds to the edges of the storefront. `columns` is the width of each item.
 */
export function Carousel({
  eyebrow,
  title,
  href,
  hrefLabel,
  columns,
  children,
}: {
  eyebrow?: string | null;
  title: string;
  href?: string;
  hrefLabel?: string;
  columns: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const scroll = (direction: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader eyebrow={eyebrow} title={title} href={href} hrefLabel={hrefLabel}>
        <button type="button" onClick={() => scroll(-1)} aria-label="Anterior" className={arrow}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <button type="button" onClick={() => scroll(1)} aria-label="Siguiente" className={arrow}>
          <ChevronRight size={18} aria-hidden />
        </button>
      </SectionHeader>
      <ul
        ref={ref}
        className={`sf-scroller grid scroll-px-[clamp(16px,4.4cqw,56px)] grid-flow-col gap-[clamp(12px,1.6cqw,20px)] overflow-x-auto px-[clamp(16px,4.4cqw,56px)] pt-4 pb-1 ${columns}`}
      >
        {children}
      </ul>
    </div>
  );
}
