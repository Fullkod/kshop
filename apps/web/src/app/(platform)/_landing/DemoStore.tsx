"use client";

import type { Theme } from "@kshop/core";
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
} from "@kshop/storefront";
import { useEffect, useMemo, useState } from "react";
import { supabaseConfig } from "@/env";
import type { LandingDemo } from "./LandingStore";

// The demo store of the landing (redesign R7), loaded with next/dynamic once its frame nears the screen: the
// storefront components and the API reads stay out of the page's first load (Lighthouse on a phone).

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

/** Reads the demo store and draws the sections `pick` chooses from its home with `theme`. */
export default function DemoFrame({
  demo,
  theme,
  pick,
}: {
  demo: LandingDemo;
  theme: Theme;
  pick: (home: HomeSection[]) => HomeSection[];
}) {
  const [content, setContent] = useState<DemoContent | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadDemo(demo.store.id).then(
      (c) => !cancelled && setContent(c),
      () => {}, // the frame stays empty
    );
    return () => {
      cancelled = true;
    };
  }, [demo.store.id]);
  const sections = useMemo(() => (content ? pick(content.home) : []), [content, pick]);
  return content ? <DemoStore demo={demo} content={content} theme={theme} sections={sections} /> : null;
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
