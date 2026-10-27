import type { Metadata } from "next";
import { CategoriesView } from "@kshop/storefront";
import { getStorefrontShell } from "@/server/storefront/data";
import { requireStore, storeMetadata } from "@/server/storefront/page-helpers";

export async function generateMetadata({
  params,
}: PageProps<"/s/[storeSlug]/categories">): Promise<Metadata> {
  const store = await requireStore(params);
  return storeMetadata(store, { title: "Categorías", path: "/categories" });
}

export default async function CategoriesPage({ params }: PageProps<"/s/[storeSlug]/categories">) {
  const store = await requireStore(params);
  return <CategoriesView shell={await getStorefrontShell(store.id)} />;
}
