import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { categoryTrail, ProductView, RelatedProducts } from "@kshop/storefront";
import { getCarousel, getProduct, getProducts } from "@/server/storefront/catalog";
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

  const crumbs = categoryTrail(shell, product.category?.id);
  const related = product.category
    ? (await getCarousel(store.id, { kind: "category", id: product.category.id }, "newest", 9))
        .filter((p) => p.id !== product.id)
        .slice(0, 8)
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
    <div className="flex flex-col gap-[clamp(44px,5.6cqw,72px)] px-[clamp(16px,4.4cqw,56px)] pt-4 pb-0 @min-[720px]:pb-8">
      <script
        type="application/ld+json"
        // JSON.stringify escapes quotes; "<" is escaped so the content cannot close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <ProductView
        product={product}
        crumbs={[...crumbs, { label: product.name }]}
        delivery={{ delivery: shell.delivery, freeShipping: shell.freeShipping }}
      />
      <RelatedProducts products={related} />
    </div>
  );
}
