import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySlug, type PublicStore } from "../stores";

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
  return {
    title: { absolute: title },
    description: page.description ?? undefined,
    alternates: { canonical: page.path },
    openGraph: {
      title,
      description: page.description ?? undefined,
      siteName: store.name,
      type: "website",
      ...(page.image && { images: [{ url: page.image }] }),
    },
  };
}
