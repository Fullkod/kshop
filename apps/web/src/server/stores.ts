import "server-only";
import { currencyCodeSchema, resolveTheme } from "@kshop/core";
import { createGraphqlClient, StoreBySlugQuery, StoreSlugsQuery } from "@kshop/data";
import type { PublicStore } from "@kshop/storefront";
import { cacheLife, cacheTag } from "next/cache";
import { supabaseConfig } from "@/env";

export type { PublicStore } from "@kshop/storefront";

export const storeCacheTag = (slug: string) => `store:${slug}`;

// Anonymous pg_graphql read: only the public store card is visible to anon.
const graphql = createGraphqlClient({ ...supabaseConfig, noCache: true });

/** Live custom domain of a store (anon RPC, the domain is public once live), or null. */
export async function fetchStoreCustomDomain(slug: string): Promise<string | null> {
  const res = await fetch(`${supabaseConfig.url}/rest/v1/rpc/resolve_store_custom_domain`, {
    method: "POST",
    headers: {
      apikey: supabaseConfig.key,
      Authorization: `Bearer ${supabaseConfig.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_slug: slug }),
  });
  if (!res.ok) throw new Error(`resolve_store_custom_domain failed (${res.status})`);
  return (await res.json()) as string | null;
}

async function fetchStoreBySlug(slug: string): Promise<PublicStore | null> {
  const [result, customDomain] = await Promise.all([
    graphql.query(StoreBySlugQuery, { slug }).toPromise(),
    fetchStoreCustomDomain(slug),
  ]);
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
    customDomain,
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
