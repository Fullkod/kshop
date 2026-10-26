import "server-only";
import { storePublicOrigin } from "@kshop/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { platformProtocol, publicEnv } from "@/env";
import { getStoreBySlug, type PublicStore } from "../stores";

/** Public origin of a store: its live custom domain or its subdomain (sitemap, robots, canonical, order links). */
export const storeUrl = (store: Pick<PublicStore, "slug"> & { customDomain?: string | null }) =>
  storePublicOrigin(store, publicEnv.platformDomain, platformProtocol);

/** Active store of a storefront route, or the 404 page. */
export async function requireStore(params: Promise<{ storeSlug: string }>): Promise<PublicStore> {
  const store = await getStoreBySlug((await params).storeSlug);
  if (!store || store.status !== "active") notFound();
  return store;
}

/** Metadata of a storefront page: the store name goes in the title, not "Kshop". */
export function storeMetadata(
  store: PublicStore,
  page: { title?: string; description?: string | null; path: string; image?: string | null },
): Metadata {
  const title = page.title ? `${page.title} · ${store.name}` : store.name;
  const description =
    page.description?.trim() || `Compra en ${store.name}: catálogo online y pedidos por WhatsApp.`;
  return {
    metadataBase: new URL(storeUrl(store)),
    title: { absolute: title },
    description,
    alternates: { canonical: page.path },
    openGraph: {
      title,
      description,
      siteName: store.name,
      type: "website",
      ...(page.image && { images: [{ url: page.image }] }),
    },
  };
}

/**
 * generateStaticParams of the store pages with a slug (ISR): a few real slugs are prerendered at build time and
 * any other one is rendered on its first visit and then served from the cache. Never empty (Cache Components).
 */
export async function staticSlugs(
  storeSlug: string,
  pick: (storeId: string) => Promise<string[]>,
): Promise<{ slug: string }[]> {
  const store = await getStoreBySlug(storeSlug);
  const slugs = store?.status === "active" ? (await pick(store.id)).slice(0, 20) : [];
  return (slugs.length ? slugs : ["_"]).map((slug) => ({ slug }));
}
