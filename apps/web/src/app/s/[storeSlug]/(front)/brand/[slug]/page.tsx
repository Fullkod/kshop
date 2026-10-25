import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListingPage, ListingSkeleton } from "@/features/storefront/components/ListingPage";
import { getStorefrontShell } from "@/server/storefront/data";
import { requireStore, storeMetadata } from "@/server/storefront/page-helpers";

type Props = PageProps<"/s/[storeSlug]/brand/[slug]">;

async function load({ params }: Pick<Props, "params">) {
  const store = await requireStore(params);
  const { slug } = await params;
  const brand = (await getStorefrontShell(store.id)).brands.find((b) => b.slug === slug);
  if (!brand) notFound();
  return { store, brand };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, brand } = await load({ params });
  return storeMetadata(store, { title: brand.name, path: `/brand/${brand.slug}` });
}

export default function BrandPage(props: Props) {
  return (
    <Suspense fallback={<ListingSkeleton />}>
      <BrandContent {...props} />
    </Suspense>
  );
}

async function BrandContent({ params, searchParams }: Props) {
  const { store, brand } = await load({ params });
  return (
    <ListingPage
      store={store}
      title={brand.name}
      crumbs={[{ label: "Productos", href: "/products" }]}
      basePath={`/brand/${brand.slug}`}
      fixed={{ brandIds: brand.id }}
      searchParams={searchParams}
      hideBrandFacet
    />
  );
}
