import "server-only";
import { currencyCodeSchema, linkHref, type CurrencyCode, type LinkType } from "@kshop/core";
import { createGraphqlClient, ProductSlugsQuery, StorefrontShellQuery } from "@kshop/data";
import { cacheLife, cacheTag } from "next/cache";
import { supabaseConfig } from "@/env";
import { catalogCacheTag } from "../catalog/access";

// Public storefront reads (anon pg_graphql), cached per store. Catalog writes expire catalogCacheTag and
// content writes (Appearance) expire contentCacheTag, so the next visit reads fresh data.

export const contentCacheTag = (storeId: string) => `store:${storeId}:content`;

export const anonGraphql = createGraphqlClient({ ...supabaseConfig, noCache: true });

/** Tags and lifetime of every storefront read of a store. */
export function storefrontCache(storeId: string) {
  cacheTag(catalogCacheTag(storeId), contentCacheTag(storeId));
  // Scheduled banners and sections change without a write: content is re-read at least every few minutes.
  cacheLife("minutes");
}

export type NavLink = { label: string; href: string; children: NavLink[] };
export type StoreCurrency = {
  currency: CurrencyCode;
  isBase: boolean;
  rateToBase: number;
  rounding: number | null;
};
export type StorefrontShell = {
  header: NavLink[];
  footer: NavLink[];
  categories: { id: string; parentId: string | null; name: string; slug: string; imageUrl: string | null }[];
  brands: { id: string; name: string; slug: string; logoUrl: string | null }[];
  currencies: StoreCurrency[];
  /** Slugs by id, to turn typed links (menus, banners) into paths. */
  slugs: Record<string, string>;
};

const nodes = <T>(c: { edges: { node: T }[] } | null | undefined): T[] => (c?.edges ?? []).map((e) => e.node);

export async function getStorefrontShell(storeId: string): Promise<StorefrontShell> {
  "use cache";
  storefrontCache(storeId);
  const result = await anonGraphql.query(StorefrontShellQuery, { storeId }).toPromise();
  if (result.error || !result.data) throw result.error ?? new Error("Storefront shell not available");
  const d = result.data;

  const categories = nodes(d.categoriesCollection).map((c) => ({
    id: c.id,
    parentId: c.parentId ?? null,
    name: c.name,
    slug: c.slug,
    imageUrl: c.imageUrl ?? null,
  }));
  const brands = nodes(d.brandsCollection).map((b) => ({ ...b, logoUrl: b.logoUrl ?? null }));
  const slugs: Record<string, string> = Object.fromEntries([
    ...categories.map((c) => [c.id, c.slug]),
    ...brands.map((b) => [b.id, b.slug]),
    ...nodes(d.collectionsCollection).map((c) => [c.id, c.slug]),
    ...nodes(d.pagesCollection).map((p) => [p.id, p.slug]),
  ]);
  const productIds = nodes(d.menusCollection).flatMap((m) =>
    nodes(m.menuItemsCollection).flatMap((i) =>
      i.linkType === "product" && i.linkTargetId ? [i.linkTargetId] : [],
    ),
  );
  Object.assign(slugs, await getProductSlugs(storeId, productIds));

  const menu = (location: "header" | "footer"): NavLink[] => {
    const items = nodes(nodes(d.menusCollection).find((m) => m.location === location)?.menuItemsCollection);
    const toLink = (i: (typeof items)[number]): NavLink | null => {
      const href = linkHref(i.linkType as LinkType, i.linkTargetId ? slugs[i.linkTargetId] : null, i.linkUrl);
      return href ? { label: i.label, href, children: [] } : null;
    };
    // Items pointing to something unpublished are dropped (and their children with them).
    return items.flatMap((parent) => {
      if (parent.parentId) return [];
      const link = toLink(parent);
      if (!link) return [];
      link.children = items.filter((c) => c.parentId === parent.id).flatMap((c) => toLink(c) ?? []);
      return [link];
    });
  };

  return {
    header: menu("header"),
    footer: menu("footer"),
    categories,
    brands,
    currencies: nodes(d.storeCurrenciesCollection).map((c) => ({
      currency: currencyCodeSchema.parse(c.currency),
      isBase: c.isBase,
      rateToBase: Number(c.rateToBase),
      rounding: c.rounding == null ? null : Number(c.rounding),
    })),
    slugs,
  };
}

/** Slugs of published products by id (links to products from menus and banners). */
export async function getProductSlugs(storeId: string, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const result = await anonGraphql.query(ProductSlugsQuery, { storeId, ids: [...new Set(ids)] }).toPromise();
  return Object.fromEntries(nodes(result.data?.productsCollection).map((p) => [p.id, p.slug]));
}
