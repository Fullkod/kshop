import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingPage } from "@/features/storefront/components/ListingPage";
import { getStorefrontShell } from "@/server/storefront/data";
import { requireStore, staticSlugs, storeMetadata } from "@/server/storefront/page-helpers";

type Props = PageProps<"/s/[storeSlug]/collection/[slug]">;

// ISR: known slugs are prerendered, the rest are cached after their first visit.
export async function generateStaticParams({ params }: { params: { storeSlug: string } }) {
  return staticSlugs(params.storeSlug, (id) =>
    getStorefrontShell(id).then((s) => s.collections.map((c) => c.slug)),
  );
}

async function load({ params }: Pick<Props, "params">) {
  const store = await requireStore(params);
  const { slug } = await params;
  const collection = (await getStorefrontShell(store.id)).collections.find((c) => c.slug === slug);
  if (!collection) notFound();
  return { store, collection };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, collection } = await load({ params });
  return storeMetadata(store, { title: collection.name, path: `/collection/${collection.slug}` });
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { store, collection } = await load({ params });
  return (
    <ListingPage
      store={store}
      title={collection.name}
      basePath={`/collection/${collection.slug}`}
      fixed={{ collectionId: collection.id }}
      searchParams={searchParams}
    />
  );
}
