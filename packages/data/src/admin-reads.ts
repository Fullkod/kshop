import type { ResultOf } from "@graphql-typed-document-node/core";
import type { AdminOrderQuery, AdminOrdersQuery, CheckoutSettingsQuery } from "./order-queries";
import type { NotificationLogQuery } from "./notification-queries";
import { createResilientFetch } from "./resilient-fetch";
import type { SupabaseConfig } from "./supabase";

// The admin's daily reads as plain RPCs (R11 phase 5, migration 20261108100400_admin_reads.sql). The first pg_graphql
// query of every new database connection rebuilds its schema (~250 ms of CPU, seconds on a throttled Nano) and
// PostgREST closes idle connections, so screens that only read through these functions skip that toll. Each function
// returns exactly the result of the GraphQL query it replaces (scripts/compare-admin-reads.mjs checks it), so the
// screens keep the same types. Cursors are opaque offsets.

export type AdminReadsOptions = SupabaseConfig & {
  getAccessToken: () => string | null | undefined | Promise<string | null | undefined>;
  fetch?: typeof fetch;
};

export type AdminOrdersArgs = {
  storeId: string;
  first: number;
  after?: string | null;
  statuses?: readonly string[];
  number?: number;
  /** Customer name ILIKE `name` or phone ILIKE `phone` (both patterns, e.g. "%ana%"). */
  search?: { name: string; phone: string };
};

export function createAdminReads(options: AdminReadsOptions) {
  const rawFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  // Read-only functions: a time limit and one retry, like the GraphQL reads.
  const safeFetch = createResilientFetch(rawFetch, { canRetry: () => true });

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const headers = new Headers({ apikey: options.key, "Content-Type": "application/json" });
    const token = await options.getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await safeFetch(`${options.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`${fn} -> ${response.status}`);
    return (await response.json()) as T;
  }

  return {
    orders: (args: AdminOrdersArgs) =>
      rpc<ResultOf<typeof AdminOrdersQuery>>("admin_orders", {
        p_store_id: args.storeId,
        p_first: args.first,
        p_offset: args.after ? Number(args.after) : 0,
        p_statuses: args.statuses ?? null,
        p_number: args.number ?? null,
        p_name: args.search?.name ?? null,
        p_phone: args.search?.phone ?? null,
      }),
    order: (orderId: string) => rpc<ResultOf<typeof AdminOrderQuery>>("admin_order", { p_order_id: orderId }),
    checkoutSettings: (storeId: string) =>
      rpc<ResultOf<typeof CheckoutSettingsQuery>>("admin_checkout_settings", { p_store_id: storeId }),
    notificationLog: (args: { storeId: string; first: number; orderId?: string; after?: string | null }) =>
      rpc<ResultOf<typeof NotificationLogQuery>>("admin_notification_log", {
        p_store_id: args.storeId,
        p_first: args.first,
        p_order_id: args.orderId ?? null,
        p_offset: args.after ? Number(args.after) : 0,
      }),
  };
}

export type AdminReads = ReturnType<typeof createAdminReads>;
