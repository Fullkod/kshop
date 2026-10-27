"use client";

import type { Theme } from "@kshop/core";
import type { HomeSection, StorefrontShell } from "@kshop/data";
import { Segmented } from "@kshop/ui";
import {
  HomeSections,
  headerChips,
  headerLinks,
  StoreAnnouncement,
  StoreFooter,
  StoreHeader,
  StorefrontPreviewProviders,
  themeStyle,
  useStore,
} from "@kshop/storefront";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session";

const WIDTH = { web: 1180, mobile: 360 } as const;
type Device = keyof typeof WIDTH;

/**
 * Live preview of the theme with the real storefront (redesign R6): the store's own shell and home read from the
 * public API, drawn by the @kshop/storefront components inside a `.sf-root` with the edited theme. Web is drawn at
 * 1180 px and scaled to fit; phones at 360 px. Inert: nothing in it can be clicked.
 */
export function ThemePreview({ theme }: { theme: Theme }) {
  const store = useStore();
  const { api } = useSession();
  const [device, setDevice] = useState<Device>("web");
  const [data, setData] = useState<{ shell: StorefrontShell; home: HomeSection[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number>(WIDTH.web);

  useEffect(() => {
    let cancelled = false;
    const storefront = api.storefront(store.id);
    Promise.all([storefront.shell(), storefront.home()]).then(
      ([shell, home]) => !cancelled && setData({ shell, home }),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [api, store.id]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const width = WIDTH[device];
  const zoom = Math.min(1, (available - 32) / width);
  // The hero and the first product carousel are enough to judge the look.
  const sections: HomeSection[] = data
    ? [
        data.home.find((s) => s.type === "hero_slider" || s.type === "banner"),
        data.home.find((s) => s.type === "product_carousel"),
      ].flatMap((s) => (s ? [s] : []))
    : [];

  return (
    <div className="flex flex-col gap-3 xl:sticky xl:top-20 xl:self-start">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">Vista previa</span>
        <Segmented
          label="Dispositivo"
          value={device}
          onSelect={setDevice}
          options={[
            { value: "web", label: "Web" },
            { value: "mobile", label: "Móvil" },
          ]}
        />
      </div>
      <div
        ref={frame}
        className="flex h-[640px] items-start justify-center overflow-y-auto rounded-[14px] border bg-[repeating-linear-gradient(135deg,var(--surface)_0_12px,var(--bg)_12px_24px)] p-4"
      >
        {failed ? (
          <p className="self-center text-sm text-muted-foreground">
            No se pudo cargar la tienda para la vista previa.
          </p>
        ) : !data ? (
          <p className="self-center text-sm text-muted-foreground">Cargando la tienda…</p>
        ) : (
          <div
            className="h-fit overflow-hidden rounded-[10px] shadow-lg"
            style={{ zoom, width }}
            inert
            aria-label="Tienda con el tema elegido"
          >
            <div
              className="sf-root flex flex-col bg-background text-foreground"
              style={themeStyle(theme)}
              data-testid="theme-preview"
            >
              <StorefrontPreviewProviders storeId={store.id} currencies={data.shell.currencies} api={api}>
                <StoreAnnouncement announcement={data.shell.announcement ?? null} />
                <StoreHeader store={store} links={headerLinks(data.shell)} chips={headerChips(data.shell)} />
                <HomeSections sections={sections} delivery={data.shell} />
                <StoreFooter store={store} links={data.shell.footer} currencies={data.shell.currencies} />
              </StorefrontPreviewProviders>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
