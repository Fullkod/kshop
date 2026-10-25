import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingPage } from "@/features/storefront/components/ListingPage";
import { getStorefrontShell } from "@/server/storefront/data";
import { requireStore, staticSlugs, storeMetadata } from "@/server/storefront/page-helpers";

type Props = PageProps<"/s/[storeSlug]/brand/[slug]">;

// ISR: known slugs are prerendered, the rest are cached after their first visit.
export async function generateStaticParams({ params }: { params: { storeSlug: string } }) {
  return staticSlugs(params.storeSlug, (id) =>
    getStorefrontShell(id).then((s) => s.brands.map((b) => b.slug)),
  );
}

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

export default async function BrandPage({ params, searchParams }: Props) {
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
