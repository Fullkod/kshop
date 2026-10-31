import type { ResultOf } from "@graphql-typed-document-node/core";
import type { CurrencyCode, PosFlag } from "@kshop/core";
import type { AdminProductsQuery, CatalogStructureQuery, ProductDetailQuery } from "./catalog-queries";
import type { AdminContentQuery } from "./content-queries";
import type { AdminPromotionsQuery, AdminVouchersQuery, DiscountTargetsQuery } from "./discount-queries";
import type { NotificationLogQuery, NotificationSettingsQuery } from "./notification-queries";
import type {
  AdminCustomersQuery,
  AdminOrderQuery,
  AdminOrdersQuery,
  CheckoutSettingsQuery,
  OrderVariantSearchQuery,
} from "./order-queries";
import { createResilientFetch } from "./resilient-fetch";
import type { SupabaseConfig } from "./supabase";

// Every read of the store admin as a plain RPC (R11; migrations 20261108100400_admin_reads.sql and
// 20261108100500_admin_reads_all.sql: the admin reads through RPC, pg_graphql stays for the storefront). The first pg_graphql
// query of every new database connection rebuilds its schema (~250 ms of CPU, seconds on a throttled Nano) and
// PostgREST closes idle connections, so screens that only read through these functions skip that toll. Each function
// returns exactly the result of the GraphQL query it replaces (scripts/compare-admin-reads.mjs checks it), so the
// screens keep the same types. Cursors are opaque offsets.

export type PosSaleInfo = { localNumber: string; soldAt: string; uploadedAt: string; flags: PosFlag[] };

export type PosOverview = {
  count: number;
  cancelled: number;
  cash: { currency: CurrencyCode; amount: number }[];
  rates: { currency: CurrencyCode; orderCurrency: CurrencyCode; rateToOrder: number; payments: number }[];
  flaggedCount: number;
  /** The latest 50. */
  flagged: {
    orderId: string;
    number: number;
    localNumber: string;
    soldAt: string;
    currency: CurrencyCode;
    flags: PosFlag[];
  }[];
};

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
  channel?: string;
  /** Customer name ILIKE `name` OR phone ILIKE `phone` OR number = `number` (patterns like "%ana%"; each optional). */
  search?: { name?: string; phone?: string; number?: number };
};

export type AdminCustomersArgs = {
  storeId: string;
  first: number;
  after?: string | null;
  /** First or last name ILIKE `name` OR phone ILIKE `phone` (patterns; each optional). */
  search?: { name?: string; phone?: string };
  /** Exact phone (normalized). */
  phone?: string;
};

export type AdminProductsArgs = {
  storeId: string;
  first: number;
  after?: string | null;
  query?: string | null;
  status?: string | null;
  categoryId?: string | null;
  lowStock?: boolean | null;
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
        p_search_number: args.search?.number ?? null,
        p_channel: args.channel ?? null,
      }),
    order: (orderId: string) => rpc<ResultOf<typeof AdminOrderQuery>>("admin_order", { p_order_id: orderId }),
    /** Null when the order is not a counter sale. */
    posSale: (orderId: string) => rpc<PosSaleInfo | null>("admin_pos_sale", { p_order_id: orderId }),
    posOverview: (storeId: string, days: number) =>
      rpc<PosOverview>("admin_pos_overview", { p_store_id: storeId, p_days: days }),
    checkoutSettings: (storeId: string) =>
      rpc<ResultOf<typeof CheckoutSettingsQuery>>("admin_checkout_settings", { p_store_id: storeId }),
    notificationLog: (args: { storeId: string; first: number; orderId?: string; after?: string | null }) =>
      rpc<ResultOf<typeof NotificationLogQuery>>("admin_notification_log", {
        p_store_id: args.storeId,
        p_first: args.first,
        p_order_id: args.orderId ?? null,
        p_offset: args.after ? Number(args.after) : 0,
      }),
    notificationSettings: (storeId: string) =>
      rpc<ResultOf<typeof NotificationSettingsQuery>>("admin_notification_settings", { p_store_id: storeId }),
    customers: (args: AdminCustomersArgs) =>
      rpc<ResultOf<typeof AdminCustomersQuery>>("admin_customers", {
        p_store_id: args.storeId,
        p_first: args.first,
        p_offset: args.after ? Number(args.after) : 0,
        p_name: args.search?.name ?? null,
        p_phone_like: args.search?.phone ?? null,
        p_phone: args.phone ?? null,
      }),
    catalogStructure: (storeId: string) =>
      rpc<ResultOf<typeof CatalogStructureQuery>>("admin_catalog_structure", { p_store_id: storeId }),
    products: (args: AdminProductsArgs) =>
      rpc<ResultOf<typeof AdminProductsQuery>>("admin_products", {
        p_store_id: args.storeId,
        p_first: args.first,
        p_offset: args.after ? Number(args.after) : 0,
        p_query: args.query ?? null,
        p_status: args.status ?? null,
        p_category_id: args.categoryId ?? null,
        p_low_stock: args.lowStock ?? null,
      }),
    product: (productId: string) =>
      rpc<ResultOf<typeof ProductDetailQuery>>("admin_product", { p_product_id: productId }),
    /** «Nuevo pedido» and the discounts' product picker: up to 10 products with their variants. */
    variantSearch: (storeId: string, query?: string | null) =>
      rpc<ResultOf<typeof OrderVariantSearchQuery>>("admin_variant_search", {
        p_store_id: storeId,
        p_query: query ?? null,
      }),
    promotions: (storeId: string) =>
      rpc<ResultOf<typeof AdminPromotionsQuery>>("admin_promotions", { p_store_id: storeId }),
    vouchers: (storeId: string) =>
      rpc<ResultOf<typeof AdminVouchersQuery>>("admin_vouchers", { p_store_id: storeId }),
    discountTargets: (storeId: string, productIds: readonly string[]) =>
      rpc<ResultOf<typeof DiscountTargetsQuery>>("admin_discount_targets", {
        p_store_id: storeId,
        p_product_ids: productIds,
      }),
    content: (storeId: string) =>
      rpc<ResultOf<typeof AdminContentQuery>>("admin_content", { p_store_id: storeId }),
  };
}

export type AdminReads = ReturnType<typeof createAdminReads>;

/** The read as `{ data, error }`, like urql's result, so a screen keeps its error handling. */
export async function asResult<T>(read: Promise<T>): Promise<{ data?: T; error?: unknown }> {
  try {
    return { data: await read };
  } catch (error) {
    return { error };
  }
}
