import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingPage, type Crumb } from "@/features/storefront/components/ListingPage";
import { getStorefrontShell } from "@/server/storefront/data";
import { requireStore, staticSlugs, storeMetadata } from "@/server/storefront/page-helpers";

type Props = PageProps<"/s/[storeSlug]/category/[slug]">;

// ISR: known slugs are prerendered, the rest are cached after their first visit.
export async function generateStaticParams({ params }: { params: { storeSlug: string } }) {
  return staticSlugs(params.storeSlug, (id) =>
    getStorefrontShell(id).then((s) => s.categories.map((c) => c.slug)),
  );
}

async function load({ params }: Pick<Props, "params">) {
  const store = await requireStore(params);
  const { slug } = await params;
  const shell = await getStorefrontShell(store.id);
  const category = shell.categories.find((c) => c.slug === slug);
  if (!category) notFound();
  return { store, shell, category };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, category } = await load({ params });
  return storeMetadata(store, { title: category.name, path: `/category/${category.slug}` });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { store, shell, category } = await load({ params });
  const crumbs: Crumb[] = [];
  for (let parent = shell.categories.find((c) => c.id === category.parentId); parent;) {
    crumbs.unshift({ label: parent.name, href: `/category/${parent.slug}` });
    const next = parent.parentId;
    parent = shell.categories.find((c) => c.id === next);
  }
  const children = shell.categories.filter((c) => c.parentId === category.id);
  return (
    <ListingPage
      store={store}
      title={category.name}
      crumbs={crumbs}
      basePath={`/category/${category.slug}`}
      fixed={{ categoryId: category.id }}
      searchParams={searchParams}
      intro={
        children.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Subcategorías">
            {children.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/category/${c.slug}`}
                  className="inline-flex rounded-full border px-4 py-1.5 text-sm hover:bg-surface"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        )
      }
    />
  );
}
