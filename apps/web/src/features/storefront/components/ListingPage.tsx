import type { SearchParams } from "@kshop/core";
import { Suspense, type ReactNode } from "react";
import type { ProductFilters } from "@/server/storefront/catalog";
import type { PublicStore } from "@/server/stores";
import { Breadcrumbs, ListingSkeleton, type Crumb } from "@kshop/storefront";
import { Listing } from "./Listing";

export type { Crumb };
export { Breadcrumbs, ListingSkeleton };

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
