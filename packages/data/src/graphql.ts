import { cacheExchange, Client, fetchExchange } from "@urql/core";
import type { SupabaseConfig } from "./supabase";

export type GraphqlClientOptions = SupabaseConfig & {
  /** Returns the signed-in user's access token; reads are anonymous without it. */
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Custom fetch (e.g. Next.js fetch with cache tags on the server). */
  fetch?: typeof fetch;
  /** Skip urql's in-memory cache (server side, where caching is done by the framework). */
  noCache?: boolean;
};

/** urql client for pg_graphql. Works in the browser, the server and the Capacitor apps. */
export function createGraphqlClient(options: GraphqlClientOptions): Client {
  const baseFetch = options.fetch ?? fetch;
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
