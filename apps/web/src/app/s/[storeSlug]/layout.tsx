import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoreProvider } from "@kshop/storefront";
import { supabaseConfig } from "@/env";
import { NextNavigationProvider } from "@/lib/navigation";
import { getStoreBySlug, listStoreSlugs, PLACEHOLDER_STORE_SLUG } from "@/server/stores";

// Store pages render on their first visit and are then served from the cache (nothing is prerendered at build time,
// see listStoreSlugs). With Cache Components the list cannot be empty.
export async function generateStaticParams() {
  const slugs = await listStoreSlugs();
  return (slugs.length ? slugs : [PLACEHOLDER_STORE_SLUG]).map((storeSlug) => ({ storeSlug }));
}

export async function generateMetadata({ params }: LayoutProps<"/s/[storeSlug]">): Promise<Metadata> {
  const store = await getStoreBySlug((await params).storeSlug);
  return store ? { title: { default: store.name, template: `%s · ${store.name}` } } : {};
}

export default async function StoreLayout({ children, params }: LayoutProps<"/s/[storeSlug]">) {
  const store = await getStoreBySlug((await params).storeSlug);
  if (!store || store.status === "archived") notFound();
  return (
    <StoreProvider store={store} config={{ supabase: supabaseConfig, apiBaseUrl: "", channel: "web" }}>
      <NextNavigationProvider>{children}</NextNavigationProvider>
    </StoreProvider>
  );
}
