import type { SearchParams } from "@kshop/core";
import { ListingView, loadListing } from "@kshop/storefront";
import { getFacets, getProducts, type ProductFilters } from "@/server/storefront/catalog";
import type { PublicStore } from "@/server/stores";

type Props = {
  store: PublicStore;
  basePath: string;
  /** Filters fixed by the page (category, collection, brand). */
  fixed?: Pick<ProductFilters, "categoryId" | "collectionId" | "brandIds">;
  searchParams: SearchParams;
  hideBrandFacet?: boolean;
};

/** Products of a listing page with its filter panel, read with the cached storefront functions. */
export async function Listing({ store, basePath, fixed = {}, searchParams, hideBrandFacet }: Props) {
  const data = await loadListing(
    {
      products: (filters, sort, page) => getProducts(store.id, filters, sort, page),
      facets: (filters) => getFacets(store.id, filters),
    },
    fixed,
    searchParams,
  );
  return (
    <ListingView
      data={data}
      basePath={basePath}
      currency={store.baseCurrency}
      hideBrandFacet={hideBrandFacet}
    />
  );
}
