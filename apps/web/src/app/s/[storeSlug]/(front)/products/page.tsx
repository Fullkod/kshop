import type { Metadata } from "next";
import { ListingPage } from "@/features/storefront/components/ListingPage";
import { requireStore, storeMetadata } from "@/server/storefront/page-helpers";

export async function generateMetadata({ params }: PageProps<"/s/[storeSlug]/products">): Promise<Metadata> {
  const store = await requireStore(params);
  return storeMetadata(store, { title: "Todos los productos", path: "/products" });
}

export default async function ProductsPage({ params, searchParams }: PageProps<"/s/[storeSlug]/products">) {
  const store = await requireStore(params);
  return (
    <ListingPage store={store} title="Todos los productos" basePath="/products" searchParams={searchParams} />
  );
}
