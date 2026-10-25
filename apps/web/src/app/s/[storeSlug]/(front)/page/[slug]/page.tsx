import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/features/storefront/components/ListingPage";
import { Markdown } from "@/features/storefront/components/Markdown";
import { getPage } from "@/server/storefront/catalog";
import { requireStore, storeMetadata } from "@/server/storefront/page-helpers";

type Props = PageProps<"/s/[storeSlug]/page/[slug]">;

async function load({ params }: Pick<Props, "params">) {
  const store = await requireStore(params);
  const { slug } = await params;
  const page = await getPage(store.id, slug);
  if (!page) notFound();
  return { store, page, slug };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, page, slug } = await load({ params });
  return storeMetadata(store, {
    title: page.seoTitle ?? page.title,
    description: page.seoDescription,
    path: `/page/${slug}`,
  });
}

export default function StaticPage(props: Props) {
  return (
    <Suspense>
      <PageContent {...props} />
    </Suspense>
  );
}

async function PageContent({ params }: Props) {
  const { page } = await load({ params });
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Breadcrumbs crumbs={[{ label: page.title }]} />
      <h1 className="text-3xl font-semibold">{page.title}</h1>
      <Markdown>{page.content}</Markdown>
    </article>
  );
}
