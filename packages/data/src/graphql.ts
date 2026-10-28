import { Client, fetchExchange } from "@urql/core";
import { createResilientFetch } from "./resilient-fetch";
import type { SupabaseConfig } from "./supabase";

// The storefront reads keep their GraphQL documents (storefront-queries.ts, queries.ts) as the shape and the types of
// what they read, but no longer run on pg_graphql (R11, decision of Roberto: its first query on every database
// connection rebuilt its schema, ~250 ms of CPU, seconds on the Nano). Each operation goes to the SQL function
// sf_<operation in snake_case>(p_vars jsonb) over PostgREST, which returns exactly what the query returned
// (supabase/migrations/20261108100700_storefront_reads.sql, checked by scripts/compare-storefront-reads.mjs).
// Cursors are offsets. The admin reads through createAdminReads.

export type GraphqlClientOptions = SupabaseConfig & {
  /** Custom fetch (e.g. Next.js fetch on the server). */
  fetch?: typeof fetch;
};

const snake = (name: string) => name.replace(/[A-Z]/g, (c, i: number) => (i ? "_" : "") + c.toLowerCase());

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

/** urql client whose operations run as sf_* RPCs (anonymous: the storefront is public). */
export function createGraphqlClient(options: GraphqlClientOptions): Client {
  const rawFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  // Read-only functions: a time limit and one retry.
  const safeFetch = createResilientFetch(rawFetch, { canRetry: () => true });
  return new Client({
    url: `${options.url}/rest/v1/rpc`,
    exchanges: [fetchExchange],
    requestPolicy: "network-only",
    preferGetMethod: false,
    fetch: async (_input, init) => {
      const { query, variables, operationName } = JSON.parse(String(init?.body)) as {
        query: string;
        variables?: Record<string, unknown>;
        operationName?: string;
      };
      const operation = operationName ?? /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
      if (!operation) return json({ errors: [{ message: "Anonymous operation" }] });
      const fn = `sf_${snake(operation)}`;
      const response = await safeFetch(`${options.url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        signal: init?.signal,
        headers: {
          apikey: options.key,
          Authorization: `Bearer ${options.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_vars: variables ?? {} }),
      });
      if (!response.ok) return json({ errors: [{ message: `${fn} -> ${response.status}` }] });
      return json({ data: await response.json() });
    },
  });
}
