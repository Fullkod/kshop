import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/features/storefront/components/ListingPage";
import { Markdown } from "@kshop/storefront";
import { getPage } from "@/server/storefront/catalog";
import { getStorefrontShell } from "@/server/storefront/data";
import { requireStore, staticSlugs, storeMetadata } from "@/server/storefront/page-helpers";

type Props = PageProps<"/s/[storeSlug]/page/[slug]">;

// ISR: known slugs are prerendered, the rest are cached after their first visit.
export async function generateStaticParams({ params }: { params: { storeSlug: string } }) {
  return staticSlugs(params.storeSlug, (id) =>
    getStorefrontShell(id).then((s) => s.pages.map((p) => p.slug)),
  );
}

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

export default async function StaticPage({ params }: Props) {
  const { page } = await load({ params });
  // KSH0006: a header band across the page (title and its Google description as the subtitle), then the text in a
  // comfortable reading width.
  return (
    <article>
      <header className="bg-surface px-[clamp(16px,4.4cqw,56px)] pt-6 pb-[clamp(32px,4.4cqw,56px)]">
        <div className="mx-auto flex max-w-[820px] flex-col gap-4">
          <Breadcrumbs crumbs={[{ label: page.title }]} />
          <h1 className="sf-heading text-[clamp(30px,4cqw,46px)] leading-[1.1] font-bold text-balance">
            {page.title}
          </h1>
          {page.seoDescription && (
            <p className="max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
              {page.seoDescription}
            </p>
          )}
        </div>
      </header>
      <div className="px-[clamp(16px,4.4cqw,56px)] py-[clamp(32px,4.4cqw,56px)]">
        <div className="mx-auto max-w-[820px]">
          <Markdown>{page.content}</Markdown>
        </div>
      </div>
    </article>
  );
}
