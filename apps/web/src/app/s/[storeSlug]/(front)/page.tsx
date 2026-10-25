import type { Metadata } from "next";
import { HomeSections } from "@/features/storefront/components/HomeSections";
import { getHome, getProducts, type HomeSection } from "@/server/storefront/catalog";
import { getStorefrontShell } from "@/server/storefront/data";
import { requireStore, storeMetadata } from "@/server/storefront/page-helpers";

export async function generateMetadata({ params }: PageProps<"/s/[storeSlug]">): Promise<Metadata> {
  const store = await requireStore(params);
  return storeMetadata(store, { path: "/" });
}

export default async function StoreHomePage({ params }: PageProps<"/s/[storeSlug]">) {
  const store = await requireStore(params);
  const sections = await getHome(store.id);
  return (
    <>
      <h1 className="sr-only">{store.name}</h1>
      <HomeSections sections={sections.length ? sections : await defaultHome(store.id)} />
    </>
  );
}

/** Home of a store that has not set up its sections: newest products and the categories. */
async function defaultHome(storeId: string): Promise<HomeSection[]> {
  const [{ products }, shell] = await Promise.all([
    getProducts(storeId, {}, "newest", 1, 8),
    getStorefrontShell(storeId),
  ]);
  const categories = shell.categories.filter((c) => !c.parentId);
  const sections: HomeSection[] = [];
  if (products.length) {
    sections.push({
      id: "default-new",
      type: "product_carousel",
      title: "Novedades",
      href: "/products",
      products,
    });
  }
  if (categories.length)
    sections.push({ id: "default-categories", type: "category_grid", title: "Categorías", categories });
  return sections;
}
