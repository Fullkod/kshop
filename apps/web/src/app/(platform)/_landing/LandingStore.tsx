"use client";

import type { Theme } from "@kshop/core";
import type { HomeSection } from "@kshop/data";
import type { PublicStore } from "@kshop/storefront";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

export type LandingDemo = { store: PublicStore; origin: string };

const DemoFrame = dynamic(() => import("./DemoStore"), { ssr: false });

/**
 * True once the element nears the screen: the demo store is decoration drawn twice, so it is loaded and drawn only
 * then. The frames have a fixed size, so nothing moves when it appears.
 */
function useNearScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && setNear(true), {
      rootMargin: "200px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);
  return [ref, near] as const;
}

const firstThree = (home: HomeSection[]) => home.slice(0, 3);
const heroAndCarousel = (home: HomeSection[]) =>
  [
    home.find((s) => s.type === "hero_slider" || s.type === "banner"),
    home.find((s) => s.type === "product_carousel"),
  ].flatMap((s) => (s ? [s] : []));

/** Hero phone: the demo store at 390 px with its own theme, scaled into a 320 px screen cut at the bottom. */
export function LandingPhone({ demo }: { demo: LandingDemo }) {
  const [ref, near] = useNearScreen<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="isolate mx-auto h-[560px] w-[340px] overflow-hidden rounded-t-[40px] border-[10px] border-b-0 border-[#0E0820] bg-white shadow-[0_40px_100px_-30px_rgb(0_0_0/.6)]"
    >
      <div className="w-[390px] [zoom:0.82]" inert aria-label="Tienda de ejemplo">
        {near && <DemoFrame demo={demo} theme={demo.store.theme} pick={firstThree} />}
      </div>
    </div>
  );
}

export type LandingPreset = { key: string; label: string; accent: string; secondary: string; theme: Theme };

/** Theme block: the six presets and the demo store's hero and first carousel redrawn with the one picked. */
export function LandingThemes({ demo, presets }: { demo: LandingDemo; presets: LandingPreset[] }) {
  const [preset, setPreset] = useState(presets[0]!.key);
  const [ref, near] = useNearScreen<HTMLDivElement>();
  const current = presets.find((p) => p.key === preset) ?? presets[0]!;

  return (
    <div className="flex flex-wrap items-center gap-[clamp(28px,4cqw,48px)] rounded-[28px] bg-surface p-[clamp(24px,4cqw,48px)]">
      <div className="flex flex-[1_1_320px] flex-col gap-4">
        <span className="text-[13px] leading-none font-bold tracking-[.1em] text-primary uppercase">
          Temas
        </span>
        <h2 className="font-display text-[clamp(28px,3.2cqw,42px)] leading-[1.08] font-extrabold tracking-[-0.02em] text-balance">
          Elige un estilo y hazlo tuyo
        </h2>
        <p className="max-w-[420px] text-muted-foreground">
          Seis estilos de partida. Cambia colores, letra y esquinas: tu tienda, tu app y tus banners se
          actualizan a la vez.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Estilos">
          {presets.map((p) => {
            const selected = p.key === preset;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                aria-pressed={selected}
                className={`flex h-11 items-center gap-2 rounded-xl bg-background pr-3.5 pl-2 text-sm font-semibold ${selected ? "ring-2 ring-primary" : "ring-1 ring-border"}`}
              >
                <span className="flex" aria-hidden>
                  {[p.accent, p.secondary].map((c, i) => (
                    <span
                      key={i}
                      className={`size-[22px] rounded-full ring-2 ring-background ${i ? "-ml-1.5" : ""}`}
                      style={{ background: c }}
                    />
                  ))}
                </span>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
      <div
        ref={ref}
        className="relative isolate h-[440px] min-w-0 flex-[1.4_1_420px] overflow-hidden rounded-[18px] bg-background shadow-[0_30px_70px_-30px_rgb(23_19_42/.35)] max-sm:h-[360px]"
      >
        <div
          className="w-[1280px] [zoom:0.5]"
          inert
          aria-label={`Tienda de ejemplo con el estilo ${current.label}`}
        >
          {near && <DemoFrame demo={demo} theme={current.theme} pick={heroAndCarousel} />}
        </div>
      </div>
    </div>
  );
}
