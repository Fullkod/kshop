"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Horizontal scroll-snap slider (works without JS); autoplay advances it unless the visitor interacts
 * or prefers reduced motion. */
export function HeroSlider({
  autoplaySeconds,
  count,
  children,
}: {
  autoplaySeconds: number;
  count: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || count < 2 || autoplaySeconds <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let paused = false;
    const pause = () => (paused = true);
    el.addEventListener("pointerdown", pause);
    el.addEventListener("focusin", pause);
    const timer = window.setInterval(() => {
      if (paused || document.hidden) return;
      const next = Math.round(el.scrollLeft / el.clientWidth) + 1;
      el.scrollTo({ left: next >= count ? 0 : next * el.clientWidth, behavior: "smooth" });
    }, autoplaySeconds * 1000);
    return () => {
      window.clearInterval(timer);
      el.removeEventListener("pointerdown", pause);
      el.removeEventListener("focusin", pause);
    };
  }, [autoplaySeconds, count]);

  return (
    <div
      ref={ref}
      className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="region"
      aria-roledescription="carrusel"
      aria-label="Destacados"
    >
      {children}
    </div>
  );
}
