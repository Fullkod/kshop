"use client";

import { ChevronLeft, ChevronRight, MessageCircle } from "@kshop/ui";
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useStore } from "../store-context";
import { whatsappUrl } from "./whatsapp";

const SliderContext = createContext<{ go: (delta: number) => void } | null>(null);

/** Horizontal scroll-snap slider (works without JS); autoplay advances it unless the visitor interacts
 * or prefers reduced motion. Each slide draws its own controls (`HeroControls`). */
export function HeroSlider({
  autoplaySeconds,
  count,
  label,
  children,
}: {
  autoplaySeconds: number;
  count: number;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  const go = useCallback(
    (delta: number) => {
      const el = ref.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + delta + count) % count;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    },
    [count],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || count < 2 || autoplaySeconds <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const pause = () => (paused.current = true);
    el.addEventListener("pointerdown", pause);
    el.addEventListener("focusin", pause);
    const timer = window.setInterval(() => {
      if (!paused.current && !document.hidden) go(1);
    }, autoplaySeconds * 1000);
    return () => {
      window.clearInterval(timer);
      el.removeEventListener("pointerdown", pause);
      el.removeEventListener("focusin", pause);
    };
  }, [autoplaySeconds, count, go]);

  return (
    <SliderContext.Provider
      value={{
        go: (delta) => {
          paused.current = true;
          go(delta);
        },
      }}
    >
      <div
        ref={ref}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="region"
        aria-roledescription="carrusel"
        aria-label={label}
      >
        {children}
      </div>
    </SliderContext.Provider>
  );
}

/** «01 / 03», progress bars (this slide full, the rest faded) and, from 720 px, previous/next. */
export function HeroControls({ index, count }: { index: number; count: number }) {
  const slider = useContext(SliderContext);
  if (count < 2) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="relative flex items-center gap-3.5">
      <span className="font-mono text-xs whitespace-nowrap">
        {pad(index + 1)} / {pad(count)}
      </span>
      <div className="flex max-w-[140px] flex-1 gap-1.5" aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className={`h-[3px] flex-1 rounded-sm bg-primary-foreground ${i === index ? "" : "opacity-30"}`}
          />
        ))}
      </div>
      {slider && (
        <div className="ml-auto hidden gap-2 @min-[720px]:flex">
          <button
            type="button"
            onClick={() => slider.go(-1)}
            aria-label="Anterior"
            className="flex size-[42px] items-center justify-center rounded-full border-[1.5px] border-[color-mix(in_srgb,var(--accent-fg)_40%,transparent)] focus-visible:shadow-[0_0_0_4px_var(--ring)] focus-visible:outline-none"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => slider.go(1)}
            aria-label="Siguiente"
            className="flex size-[42px] items-center justify-center rounded-full bg-primary-foreground text-primary focus-visible:shadow-[0_0_0_4px_var(--ring)] focus-visible:outline-none"
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

/** «Pedir por WhatsApp» outlined on the hero's accent color (hidden when the store has no WhatsApp). */
export function HeroWhatsapp() {
  const store = useStore();
  if (!store.whatsappPhone) return null;
  return (
    <a
      href={whatsappUrl(store.whatsappPhone)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-[50px] items-center gap-2 rounded-sf-btn border-[1.5px] border-[color-mix(in_srgb,var(--accent-fg)_40%,transparent)] px-5 text-[15px] font-semibold hover:bg-[color-mix(in_srgb,var(--accent-fg)_10%,transparent)] focus-visible:shadow-[0_0_0_4px_var(--ring)] focus-visible:outline-none"
    >
      <MessageCircle size={18} aria-hidden />
      Pedir por WhatsApp
    </a>
  );
}
