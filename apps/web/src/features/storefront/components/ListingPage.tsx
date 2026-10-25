import type { SearchParams } from "@kshop/core";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import type { ProductFilters } from "@/server/storefront/catalog";
import type { PublicStore } from "@/server/stores";
import { Listing } from "./Listing";

export type Crumb = { label: string; href?: string };

/** Header (breadcrumb, title) + the listing, which streams in since it depends on the query string. */
export function ListingPage({
  store,
  title,
  description,
  crumbs = [],
  basePath,
  fixed,
  searchParams,
  hideBrandFacet,
  intro,
}: {
  store: PublicStore;
  title: string;
  description?: string | null;
  crumbs?: Crumb[];
  basePath: string;
  fixed?: Pick<ProductFilters, "categoryId" | "collectionId" | "brandIds">;
  searchParams: Promise<SearchParams>;
  hideBrandFacet?: boolean;
  intro?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Breadcrumbs crumbs={[...crumbs, { label: title }]} />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{title}</h1>
        {description && <p className="max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {intro}
      {/* Min height: a short listing replacing the 8-card skeleton would pull the footer up into view (CLS). */}
      <div className="min-h-[70svh]">
        <Suspense fallback={<ListingSkeleton />}>
          <ResolvedListing
            store={store}
            basePath={basePath}
            fixed={fixed}
            searchParams={searchParams}
            hideBrandFacet={hideBrandFacet}
          />
        </Suspense>
      </div>
    </div>
  );
}

async function ResolvedListing(
  props: Omit<Parameters<typeof Listing>[0], "searchParams"> & {
    searchParams: Promise<SearchParams>;
  },
) {
  return <Listing {...props} searchParams={await props.searchParams} />;
}

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const all: Crumb[] = [{ label: "Inicio", href: "/" }, ...crumbs];
  return (
    <nav aria-label="Ruta de navegación">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {all.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>/</span>}
            {c.href && i < all.length - 1 ? (
              <Link href={c.href} className="hover:text-foreground hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current={i === all.length - 1 ? "page" : undefined} className="text-foreground">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function ListingSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4"
      aria-busy="true"
      aria-label="Cargando"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="aspect-[4/5] animate-pulse rounded-[var(--sf-radius)] bg-surface" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-surface" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-surface" />
        </div>
      ))}
    </div>
  );
}
