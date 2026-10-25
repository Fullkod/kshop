import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoreProvider } from "@/lib/store-context";
import { getStoreBySlug } from "@/server/stores";

export async function generateMetadata({ params }: LayoutProps<"/s/[storeSlug]">): Promise<Metadata> {
  const store = await getStoreBySlug((await params).storeSlug);
  return store ? { title: { default: store.name, template: `%s · ${store.name}` } } : {};
}

export default async function StoreLayout({ children, params }: LayoutProps<"/s/[storeSlug]">) {
  const store = await getStoreBySlug((await params).storeSlug);
  if (!store || store.status === "archived") notFound();
  return <StoreProvider store={store}>{children}</StoreProvider>;
}
