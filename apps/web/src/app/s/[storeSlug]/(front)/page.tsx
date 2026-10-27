import type { Metadata } from "next";
import { defaultHome, HomeSections } from "@kshop/storefront";
import { getCarousel, getHome, type HomeSection } from "@/server/storefront/catalog";
import { getStorefrontShell } from "@/server/storefront/data";
import { requireStore, storeMetadata } from "@/server/storefront/page-helpers";

export async function generateMetadata({ params }: PageProps<"/s/[storeSlug]">): Promise<Metadata> {
  const store = await requireStore(params);
  return storeMetadata(store, { path: "/" });
}

export default async function StoreHomePage({ params }: PageProps<"/s/[storeSlug]">) {
  const store = await requireStore(params);
  const [sections, shell] = await Promise.all([getHome(store.id), getStorefrontShell(store.id)]);
  return (
    <>
      <h1 className="sr-only">{store.name}</h1>
      <HomeSections sections={sections.length ? sections : await fallbackHome(store.id)} delivery={shell} />
    </>
  );
}

async function fallbackHome(storeId: string): Promise<HomeSection[]> {
  const [products, shell] = await Promise.all([
    getCarousel(storeId, { kind: "all" }, "newest", 8),
    getStorefrontShell(storeId),
  ]);
  return defaultHome(products, shell);
}
