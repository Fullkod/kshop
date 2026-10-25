import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs, type Crumb } from "@/features/storefront/components/ListingPage";
import { ProductGrid } from "@/features/storefront/components/ProductCard";
import { ProductView } from "@/features/storefront/components/ProductView";
import { getProduct, getProducts } from "@/server/storefront/catalog";
import { getStorefrontShell } from "@/server/storefront/data";
import { requireStore, staticSlugs, storeMetadata } from "@/server/storefront/page-helpers";

type Props = PageProps<"/s/[storeSlug]/product/[slug]">;

// ISR: known slugs are prerendered, the rest are cached after their first visit.
export async function generateStaticParams({ params }: { params: { storeSlug: string } }) {
  return staticSlugs(params.storeSlug, (id) =>
    getProducts(id, {}, "newest", 1, 20).then((r) => r.products.map((p) => p.slug)),
  );
}

async function load({ params }: Pick<Props, "params">) {
  const store = await requireStore(params);
  const product = await getProduct(store.id, (await params).slug);
  if (!product) notFound();
  return { store, product };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, product } = await load({ params });
  return storeMetadata(store, {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription || product.description.slice(0, 160),
    path: `/product/${product.slug}`,
    image: product.media[0]?.url ?? null,
  });
}

export default async function ProductPage({ params }: Props) {
  const { store, product } = await load({ params });
  const shell = await getStorefrontShell(store.id);

  const crumbs: Crumb[] = [];
  for (let c = shell.categories.find((x) => x.id === product.category?.id); c;) {
    crumbs.unshift({ label: c.name, href: `/category/${c.slug}` });
    const parentId = c.parentId;
    c = shell.categories.find((x) => x.id === parentId);
  }
  const related = product.category
    ? (await getProducts(store.id, { categoryId: product.category.id }, "newest", 1, 5)).products
        .filter((p) => p.id !== product.id)
        .slice(0, 4)
    : [];

  const available = product.variants.some((v) => v.available);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || undefined,
    image: product.media.map((m) => m.url),
    sku: product.variants[0]?.sku,
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: store.baseCurrency,
      lowPrice: Math.min(...product.variants.map((v) => v.price)),
      highPrice: Math.max(...product.variants.map((v) => v.price)),
      offerCount: product.variants.length,
      availability: available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <script
        type="application/ld+json"
        // JSON.stringify escapes quotes; "<" is escaped so the content cannot close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Breadcrumbs crumbs={[...crumbs, { label: product.name }]} />
      <ProductView product={product} />

      {(product.description || product.attributes.length > 0) && (
        <section className="grid gap-8 border-t pt-8 md:grid-cols-2 md:gap-12">
          {product.description && (
            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">Descripción</h2>
              <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
                {product.description}
              </p>
            </div>
          )}
          {product.attributes.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">Características</h2>
              <dl className="divide-y rounded-[var(--sf-radius)] border">
                {product.attributes.map((a) => (
                  <div key={a.name} className="grid grid-cols-2 gap-4 px-4 py-2 text-sm">
                    <dt className="text-muted-foreground">{a.name}</dt>
                    <dd>{a.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>
      )}

      {related.length > 0 && (
        <section className="flex flex-col gap-4 border-t pt-8">
          <h2 className="text-xl font-semibold">También te puede gustar</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
