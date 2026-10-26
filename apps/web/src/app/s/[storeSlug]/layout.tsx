import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoreProvider } from "@kshop/storefront";
import { supabaseConfig } from "@/env";
import { NextNavigationProvider } from "@/lib/navigation";
import { getStoreBySlug, listStoreSlugs } from "@/server/stores";

// Known stores are prerendered; a new store is rendered on its first visit and then served from the cache.
// With Cache Components the list cannot be empty.
export async function generateStaticParams() {
  const slugs = await listStoreSlugs();
  return (slugs.length ? slugs : ["_"]).map((storeSlug) => ({ storeSlug }));
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
