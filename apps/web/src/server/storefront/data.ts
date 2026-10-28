import "server-only";
import {
  createGraphqlClient,
  fetchSitemapPaths,
  fetchStorefrontShell,
  type StorefrontShell,
} from "@kshop/data";
import { cacheLife, cacheTag } from "next/cache";
import { supabaseConfig } from "@/env";
import { catalogCacheTag } from "../catalog/access";

// Public storefront reads (anon sf_* RPCs, shared with the store app in @kshop/data), cached per store. Catalog
// writes expire catalogCacheTag and content writes (Appearance) expire contentCacheTag, so the next visit reads
// fresh data.

export type { NavLink, StoreCurrency, StorefrontShell } from "@kshop/data";

export const contentCacheTag = (storeId: string) => `store:${storeId}:content`;

export const anonGraphql = createGraphqlClient(supabaseConfig);

/** Tags and lifetime of every storefront read of a store. */
export function storefrontCache(storeId: string) {
  cacheTag(catalogCacheTag(storeId), contentCacheTag(storeId));
  // Scheduled banners and sections change without a write: content is re-read at least every few minutes.
  cacheLife("minutes");
}

export async function getStorefrontShell(storeId: string): Promise<StorefrontShell> {
  "use cache";
  storefrontCache(storeId);
  return fetchStorefrontShell(anonGraphql, storeId);
}

/** Paths of every public page of a store (sitemap), with the last change of products. */
export async function getSitemapPaths(storeId: string): Promise<{ path: string; lastModified?: string }[]> {
  "use cache";
  storefrontCache(storeId);
  return fetchSitemapPaths(anonGraphql, storeId);
}
