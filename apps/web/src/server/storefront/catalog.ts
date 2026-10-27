import "server-only";
import type { ProductSort } from "@kshop/core";
import {
  fetchFacets,
  fetchHome,
  fetchPage,
  fetchProduct,
  fetchProductCards,
  fetchProducts,
  type Facets,
  type HomeSection,
  type ProductCardData,
  type ProductFilters,
} from "@kshop/data";
import { anonGraphql, storefrontCache } from "./data";

// Cached public reads of the catalog and content of one store (keys = arguments, tags = the store). The queries and
// their mapping live in @kshop/data, shared with the store app.

export type {
  BannerData,
  Facets,
  HomeSection,
  ProductCardData,
  ProductFilters,
  StorefrontProduct,
} from "@kshop/data";

export async function getProducts(
  storeId: string,
  filters: ProductFilters,
  sort: ProductSort,
  page: number,
  perPage?: number,
): Promise<{ total: number; products: ProductCardData[] }> {
  "use cache";
  storefrontCache(storeId);
  return fetchProducts(anonGraphql, storeId, filters, sort, page, perPage);
}

/** Product cards by id (favorites): cached per set of ids, like the listings. */
export async function getProductCards(storeId: string, ids: string[]): Promise<ProductCardData[]> {
  "use cache";
  storefrontCache(storeId);
  return fetchProductCards(anonGraphql, storeId, ids);
}

export async function getFacets(storeId: string, filters: ProductFilters): Promise<Facets> {
  "use cache";
  storefrontCache(storeId);
  return fetchFacets(anonGraphql, storeId, filters);
}

/** Filterable attributes of a store with every value (to read attribute filters from the URL). */
export async function getFilterableAttributes(storeId: string): Promise<Facets["attributes"]> {
  return (await getFacets(storeId, {})).attributes;
}

export async function getProduct(storeId: string, slug: string) {
  "use cache";
  storefrontCache(storeId);
  return fetchProduct(anonGraphql, storeId, slug);
}

export async function getPage(storeId: string, slug: string) {
  "use cache";
  storefrontCache(storeId);
  return fetchPage(anonGraphql, storeId, slug);
}

export async function getHome(storeId: string): Promise<HomeSection[]> {
  "use cache";
  storefrontCache(storeId);
  return fetchHome(anonGraphql, storeId);
}
