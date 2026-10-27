"use client";

import { resolveTheme, THEME_PRESETS, type Theme, type ThemePresetKey } from "@kshop/core";
import { createApiClient, type HomeSection, type StorefrontShell } from "@kshop/data";
import {
  headerChips,
  headerLinks,
  HomeSections,
  NavigationProvider,
  StoreAnnouncement,
  StoreHeader,
  StoreProvider,
  StorefrontPreviewProviders,
  themeStyle,
  type LinkProps,
  type PublicStore,
} from "@kshop/storefront";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseConfig } from "@/env";

export type LandingDemo = { store: PublicStore; origin: string };
type DemoContent = { shell: StorefrontShell; home: HomeSection[] };

const api = createApiClient({ baseUrl: "", getAccessToken: () => null });
let demoContent: Promise<DemoContent> | null = null;

/** The demo store's shell and home from the public API, read once for the phone and the theme block. */
function loadDemo(storeId: string): Promise<DemoContent> {
  demoContent ??= Promise.all([api.storefront(storeId).shell(), api.storefront(storeId).home()]).then(
    ([shell, home]) => ({ shell, home }),
  );
  return demoContent;
}

/**
 * The demo store drawn on the landing (redesign R7) once its frame nears the screen. It is decoration drawn twice:
 * read and drawn in the browser it stays out of the page's first load (Lighthouse on a phone). The frames have a
 * fixed size, so nothing moves when it appears.
 */
function useDemoNearScreen<T extends Element>(storeId: string) {
  const ref = useRef<T>(null);
  const [content, setContent] = useState<DemoContent | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        loadDemo(storeId).then(
          (c) => !cancelled && setContent(c),
          () => {}, // the frame stays empty
        );
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [storeId]);
  return [ref, content] as const;
}

/**
 * The real storefront components, inert, with the providers in preview mode (no cart, session or favorites) and
 * plain links to the demo store (no prefetch on the platform host).
 */
function DemoStore({
  demo,
  content,
  theme,
  sections,
}: {
  demo: LandingDemo;
  content: DemoContent;
  theme: Theme;
  sections: HomeSection[];
}) {
  const navigation = useMemo(
    () => ({
      Link: ({ href, prefetch: _prefetch, scroll: _scroll, replace: _replace, ...props }: LinkProps) => (
        <a href={`${demo.origin}${href}`} {...props} />
      ),
      usePathname: () => "/",
      push: () => {},
      replace: () => {},
    }),
    [demo.origin],
  );
  const { shell } = content;
  return (
    <StoreProvider store={demo.store} config={{ supabase: supabaseConfig, apiBaseUrl: "", channel: "web" }}>
      <NavigationProvider value={navigation}>
        <StorefrontPreviewProviders storeId={demo.store.id} currencies={shell.currencies} api={api}>
          <div className="sf-root flex flex-col bg-background text-foreground" style={themeStyle(theme)}>
            <StoreAnnouncement announcement={shell.announcement} />
            <StoreHeader store={demo.store} links={headerLinks(shell)} chips={headerChips(shell)} />
            <HomeSections sections={sections} delivery={shell} />
          </div>
        </StorefrontPreviewProviders>
      </NavigationProvider>
    </StoreProvider>
  );
}

/** Hero phone: the demo store at 390 px with its own theme, scaled into a 320 px screen cut at the bottom. */
export function LandingPhone({ demo }: { demo: LandingDemo }) {
  const [ref, content] = useDemoNearScreen<HTMLDivElement>(demo.store.id);
  return (
    <div
      ref={ref}
      className="isolate mx-auto h-[560px] w-[340px] overflow-hidden rounded-t-[40px] border-[10px] border-b-0 border-[#0E0820] bg-white shadow-[0_40px_100px_-30px_rgb(0_0_0/.6)]"
    >
      <div className="w-[390px] [zoom:0.82]" inert aria-label="Tienda de ejemplo">
        {content && (
          <DemoStore
            demo={demo}
            content={content}
            theme={demo.store.theme}
            sections={content.home.slice(0, 3)}
          />
        )}
      </div>
    </div>
  );
}

const PRESET_KEYS = Object.keys(THEME_PRESETS) as ThemePresetKey[];

/** Theme block: the six presets and the demo store's hero and first carousel redrawn with the one picked. */
export function LandingThemes({ demo }: { demo: LandingDemo }) {
  const [preset, setPreset] = useState<ThemePresetKey>("kshop");
  const [ref, content] = useDemoNearScreen<HTMLDivElement>(demo.store.id);
  const theme = useMemo(() => resolveTheme({ preset }), [preset]);
  const sections = useMemo(
    () =>
      content
        ? [
            content.home.find((s) => s.type === "hero_slider" || s.type === "banner"),
            content.home.find((s) => s.type === "product_carousel"),
          ].flatMap((s) => (s ? [s] : []))
        : [],
    [content],
  );
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
          {PRESET_KEYS.map((key) => {
            const p = THEME_PRESETS[key];
            const selected = key === preset;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPreset(key)}
                aria-pressed={selected}
                className={`flex h-11 items-center gap-2 rounded-xl bg-background pr-3.5 pl-2 text-sm font-semibold ${selected ? "ring-2 ring-primary" : "ring-1 ring-border"}`}
              >
                <span className="flex" aria-hidden>
                  {[p.colors.accent, p.colors.secondary].map((c, i) => (
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
          aria-label={`Tienda de ejemplo con el estilo ${THEME_PRESETS[preset].label}`}
        >
          {content && <DemoStore demo={demo} content={content} theme={theme} sections={sections} />}
        </div>
      </div>
    </div>
  );
}
