import Link from "next/link";
import type { ProductCardData } from "@/server/storefront/catalog";
import { Price } from "./Currency";

/** srcset for an image stored in the two Phase 1 sizes (…-480.webp / …-1600.webp). */
export function imageSrcSet(url: string): string | undefined {
  if (url.endsWith("-1600.webp")) return `${url.replace(/-1600\.webp$/, "-480.webp")} 480w, ${url} 1600w`;
  if (url.endsWith("-480.webp")) return `${url} 480w, ${url.replace(/-480\.webp$/, "-1600.webp")} 1600w`;
  return undefined;
}

export function ProductCard({ product, priority = false }: { product: ProductCardData; priority?: boolean }) {
  return (
    <Link href={`/product/${product.slug}`} className="group flex flex-col gap-2">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--sf-radius)] bg-surface">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- D12: our own WebP sizes, no image optimizer
          <img
            src={product.imageUrl}
            srcSet={imageSrcSet(product.imageUrl)}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            alt=""
            width={480}
            height={600}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sin imagen
          </div>
        )}
        {product.compareAtPrice != null && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            Oferta
          </span>
        )}
        {!product.inStock && (
          <span className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium">
            Agotado
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {product.brand && <span className="text-xs text-muted-foreground">{product.brand}</span>}
        <h3 className="line-clamp-2 text-sm font-medium group-hover:underline">{product.name}</h3>
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          {product.maxPrice > product.minPrice && <span className="text-muted-foreground">Desde</span>}
          <Price amount={product.minPrice} overrides={product.overrides} className="font-semibold" />
          {product.compareAtPrice != null && (
            <Price amount={product.compareAtPrice} className="text-xs text-muted-foreground line-through" />
          )}
        </p>
      </div>
    </Link>
  );
}

export function ProductGrid({
  products,
  priorityCount = 0,
}: {
  products: ProductCardData[];
  priorityCount?: number;
}) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
