import "server-only";
import {
  currencyCodeSchema,
  resolveTheme,
  type CurrencyCode,
  type StoreStatus,
  type Theme,
} from "@kshop/core";
import { createGraphqlClient, StoreBySlugQuery, StoreSlugsQuery } from "@kshop/data";
import { cacheLife, cacheTag } from "next/cache";
import { supabaseConfig } from "@/env";

export type PublicStore = {
  id: string;
  slug: string;
  name: string;
  status: StoreStatus;
  baseCurrency: CurrencyCode;
  whatsappPhone: string | null;
  logoUrl: string | null;
  theme: Theme;
};

export const storeCacheTag = (slug: string) => `store:${slug}`;

// Anonymous pg_graphql read: only the public store card is visible to anon.
const graphql = createGraphqlClient({ ...supabaseConfig, noCache: true });

async function fetchStoreBySlug(slug: string): Promise<PublicStore | null> {
  const result = await graphql.query(StoreBySlugQuery, { slug }).toPromise();
  if (result.error) throw result.error;
  const node = result.data?.storesCollection?.edges[0]?.node;
  if (!node) return null;
  return {
    id: node.id,
    slug: node.slug,
    name: node.name,
    status: node.status,
    baseCurrency: currencyCodeSchema.parse(node.baseCurrency),
    whatsappPhone: node.whatsappPhone ?? null,
    logoUrl: node.logoUrl ?? null,
    // pg_graphql returns jsonb as a JSON string.
    theme: resolveTheme(node.theme ? JSON.parse(node.theme) : null),
  };
}

/** Store lookup by slug, cached per store (invalidated with revalidateTag(storeCacheTag(slug))). */
export async function getStoreBySlug(slug: string): Promise<PublicStore | null> {
  "use cache";
  cacheTag(storeCacheTag(slug));
  // Minutes, not hours: the daily billing job suspends stores in the database, where Next cannot expire this tag
  // (phase 5); a suspended store must show its notice within about a minute, not an empty storefront for an hour.
  cacheLife("minutes");
  return fetchStoreBySlug(slug);
}

/** Slugs prerendered at build time (generateStaticParams of the store routes); the rest render on first visit. */
export async function listStoreSlugs(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  const result = await graphql.query(StoreSlugsQuery, {}).toPromise();
  return (result.data?.storesCollection?.edges ?? []).map((e) => e.node.slug);
}
