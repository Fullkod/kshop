import type {
  AttributeInput,
  BrandInput,
  CategoryInput,
  CollectionInput,
  CreateStoreInput,
  CurrencyInput,
  ProductInput,
  ProductMediaInput,
  ProductStatus,
  ProductTypeInput,
  StockInput,
  WarehouseInput,
  CurrencyCode,
  ModuleCode,
  PlanCode,
  StoreRole,
  StoreStatus,
} from "@kshop/core";

// Contract of /api/v1, shared by the web and the Capacitor apps.

export type ApiErrorBody = {
  error: { code: string; message: string; fields?: Record<string, string[]> };
};

export type MeResponse = {
  user: { id: string; email: string | null };
  isSuperadmin: boolean;
  stores: { id: string; slug: string; name: string; role: StoreRole }[];
};

export type EntitlementsResponse = {
  storeId: string;
  role: StoreRole | null;
  modules: { code: ModuleCode; source: "plan" | "addon" | "grant"; limits: Record<string, number> }[];
  limits: Record<string, number>;
};

export type PlatformStore = {
  id: string;
  slug: string;
  name: string;
  status: StoreStatus;
  baseCurrency: CurrencyCode;
  primaryDomain: string | null;
  plan: { code: PlanCode; name: string } | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  owner: { id: string; email: string | null } | null;
  createdAt: string;
};

export type CreateStoreResponse = {
  store: PlatformStore;
  /** One-time access link for the owner (sent by the superadmin over WhatsApp). */
  ownerAccessLink: string | null;
  ownerWasCreated: boolean;
};

/** Simple catalog entities and their inputs (/api/v1/stores/{storeId}/catalog/{resource}). */
export type CatalogResourceInputs = {
  attributes: AttributeInput;
  "product-types": ProductTypeInput;
  categories: CategoryInput;
  brands: BrandInput;
  collections: CollectionInput;
  warehouses: WarehouseInput;
};
export type CatalogResourceName = keyof CatalogResourceInputs;
export type ReorderableTable =
  "categories" | "collections" | "attributes" | "attribute_values" | "product_media";

export type ProductMedia = {
  id: string;
  url: string;
  thumbUrl: string | null;
  alt: string | null;
  sortOrder: number;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export type ApiClientOptions = {
  /** Origin of the web app ("" for same-origin calls in the browser). */
  baseUrl: string;
  getAccessToken: () => string | null | undefined | Promise<string | null | undefined>;
  fetch?: typeof fetch;
};

export function createApiClient(options: ApiClientOptions) {
  const doFetch = options.fetch ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await options.getAccessToken();
    const res = await doFetch(`${options.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const err = (data as ApiErrorBody | null)?.error;
      throw new ApiError(
        res.status,
        err?.code ?? "unknown",
        err?.message ?? "Error inesperado.",
        err?.fields,
      );
    }
    return data as T;
  }

  return {
    me: () => request<MeResponse>("GET", "/me"),
    entitlements: (storeId: string) =>
      request<EntitlementsResponse>("GET", `/stores/${storeId}/entitlements`),
    catalog: (storeId: string) => {
      const base = `/stores/${storeId}/catalog`;
      return {
        create: <R extends CatalogResourceName>(resource: R, input: CatalogResourceInputs[R]) =>
          request<{ id: string }>("POST", `${base}/${resource}`, input),
        update: <R extends CatalogResourceName>(resource: R, id: string, input: CatalogResourceInputs[R]) =>
          request<{ id: string }>("PATCH", `${base}/${resource}/${id}`, input),
        remove: (resource: CatalogResourceName, id: string) =>
          request<null>("DELETE", `${base}/${resource}/${id}`),
        reorder: (table: ReorderableTable, ids: string[]) =>
          request<null>("POST", `${base}/reorder`, { table, ids }),
        createProduct: (input: ProductInput) => request<{ id: string }>("POST", `${base}/products`, input),
        updateProduct: (id: string, input: ProductInput) =>
          request<{ id: string }>("PUT", `${base}/products/${id}`, input),
        deleteProduct: (id: string) => request<null>("DELETE", `${base}/products/${id}`),
        setProductsStatus: (productIds: string[], status: ProductStatus) =>
          request<{ updated: number }>("POST", `${base}/products/status`, { productIds, status }),
        addMedia: (productId: string, input: ProductMediaInput) =>
          request<ProductMedia>("POST", `${base}/products/${productId}/media`, input),
        deleteMedia: (productId: string, mediaId: string) =>
          request<null>("DELETE", `${base}/products/${productId}/media/${mediaId}`),
        setStock: (input: StockInput) =>
          request<{ quantity: number; quantityAllocated: number }>("PUT", `${base}/stock`, input),
        setCurrency: (input: CurrencyInput) =>
          request<{
            currency: string;
            isBase: boolean;
            sells: boolean;
            rateToBase: number;
            rounding: number | null;
          }>("PUT", `${base}/currencies`, input),
      };
    },
    platform: {
      listStores: () => request<{ stores: PlatformStore[] }>("GET", "/platform/stores"),
      createStore: (input: CreateStoreInput) =>
        request<CreateStoreResponse>("POST", "/platform/stores", input),
      updateStoreStatus: (storeId: string, status: StoreStatus) =>
        request<{ store: PlatformStore }>("PATCH", `/platform/stores/${storeId}`, { status }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
