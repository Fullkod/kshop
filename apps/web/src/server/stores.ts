import "server-only";
import { currencyCodeSchema, resolveTheme } from "@kshop/core";
import { createGraphqlClient, StoreBySlugQuery, StoreSlugByIdQuery, StoreSlugsQuery } from "@kshop/data";
import type { PublicStore } from "@kshop/storefront";
import { cacheLife, cacheTag } from "next/cache";
import { supabaseConfig } from "@/env";

export type { PublicStore } from "@kshop/storefront";

export const storeCacheTag = (slug: string) => `store:${slug}`;

// Anonymous pg_graphql read: only the public store card is visible to anon.
const graphql = createGraphqlClient({ ...supabaseConfig, noCache: true });

/**
 * Live custom domain of a store (anon RPC, the domain is public once live), or null. A failed or slow lookup counts
 * as «no custom domain» (R11: without a limit a busy database turned the whole store page into a 500); the proxy
 * makes the same lookup with the same 3 s limit.
 */
export async function fetchStoreCustomDomain(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`${supabaseConfig.url}/rest/v1/rpc/resolve_store_custom_domain`, {
      method: "POST",
      headers: {
        apikey: supabaseConfig.key,
        Authorization: `Bearer ${supabaseConfig.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_slug: slug }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) throw new Error(`resolve_store_custom_domain failed (${res.status})`);
    return (await res.json()) as string | null;
  } catch (error) {
    console.error("Custom domain lookup failed.", {
      slug,
      message: error instanceof Error ? error.message : error,
    });
    return null;
  }
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
    description: node.description ?? null,
    // pg_graphql returns jsonb as a JSON string.
    theme: resolveTheme(node.theme ? JSON.parse(node.theme) : null),
    customDomain,
  };
}

/**
 * Placeholder store slug of generateStaticParams (Cache Components needs a non-empty list). It is not a valid slug,
 * so it is answered without touching the database.
 */
export const PLACEHOLDER_STORE_SLUG = "_";

/**
 * `next build` does not prerender the store pages: on the Nano instance hundreds of build-time reads (every store ×
 * every route × up to 20 slugs) queued on its CPU, one of them passed the 8 s anon timeout (57014) and the whole
 * deploy failed. Each store page is rendered on its first visit and then served from the cache, like a new store.
 */
const isBuild = () => process.env.NEXT_PHASE === "phase-production-build";

/** Store lookup by slug, cached per store (invalidated with revalidateTag(storeCacheTag(slug))). */
export async function getStoreBySlug(slug: string): Promise<PublicStore | null> {
  "use cache";
  if (slug === PLACEHOLDER_STORE_SLUG) return null;
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
  if (isBuild()) return [];
  const result = await graphql.query(StoreSlugsQuery, {}).toPromise();
  return (result.data?.storesCollection?.edges ?? []).map((e) => e.node.slug);
}

/** Store card by id (store app reads), cached like the one by slug: the slug of an id never changes. */
export async function getStoreById(id: string): Promise<PublicStore | null> {
  const slug = await getStoreSlug(id);
  return slug ? getStoreBySlug(slug) : null;
}

async function getStoreSlug(id: string): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  const result = await graphql.query(StoreSlugByIdQuery, { id }).toPromise();
  if (result.error) throw result.error;
  return result.data?.storesCollection?.edges[0]?.node.slug ?? null;
}
