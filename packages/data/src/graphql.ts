import { cacheExchange, Client, fetchExchange } from "@urql/core";
import { createBatchingFetch } from "./graphql-batch";
import { createResilientFetch } from "./resilient-fetch";
import type { SupabaseConfig } from "./supabase";

export type GraphqlClientOptions = SupabaseConfig & {
  /** Returns the signed-in user's access token; reads are anonymous without it. */
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Custom fetch (e.g. Next.js fetch with cache tags on the server). */
  fetch?: typeof fetch;
  /** Skip urql's in-memory cache (server side, where caching is done by the framework). */
  noCache?: boolean;
  /** Merge the queries a screen starts at the same moment into one request (admin; see graphql-batch.ts). */
  batch?: boolean;
};

/** Queries may be retried; anything else (a mutation) is sent once. */
function isQueryRequest(init: RequestInit | undefined): boolean {
  if (typeof init?.body !== "string") return false;
  try {
    return !/^\s*mutation\b/.test((JSON.parse(init.body) as { query?: string }).query ?? "mutation");
  } catch {
    return false;
  }
}

/** urql client for pg_graphql. Works in the browser, the server and the Capacitor apps. */
export function createGraphqlClient(options: GraphqlClientOptions): Client {
  const rawFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  // Time limit and one retry under the batching: a failed batch is sent again whole, never split in N (R11).
  const safeFetch = createResilientFetch(rawFetch, { canRetry: isQueryRequest });
  const baseFetch = options.batch ? createBatchingFetch(safeFetch) : safeFetch;
  return new Client({
    url: `${options.url}/graphql/v1`,
    exchanges: options.noCache ? [fetchExchange] : [cacheExchange, fetchExchange],
    requestPolicy: options.noCache ? "network-only" : "cache-first",
    // Supabase's /graphql/v1 only accepts POST (urql would use GET for short queries).
    preferGetMethod: false,
    // The token is read per request so session refreshes are picked up.
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("apikey", options.key);
      const token = await options.getAccessToken?.();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return baseFetch(input, { ...init, headers });
    },
  });
}
