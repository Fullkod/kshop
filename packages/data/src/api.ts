import type {
  AttributeInput,
  BrandInput,
  CategoryInput,
  CollectionInput,
  CreateStoreInput,
  CurrencyInput,
  BannerInput,
  HomeSectionInput,
  MenuInput,
  MenuLocation,
  PageInput,
  ThemeInput,
  ImportPreview,
  ImportProgress,
  ProductInput,
  ProductMediaInput,
  ProductStatus,
  ProductTypeInput,
  StockInput,
  WarehouseInput,
  AdminOrderInput,
  CartUpdateInput,
  CheckoutInput,
  OrderPaymentInput,
  PaymentMethodInput,
  ShippingMethodInput,
  ShippingZoneInput,
  CurrencyCode,
  CustomerAddressInput,
  CustomerLoginInput,
  CustomerProfileInput,
  CustomerRegisterInput,
  CustomerResetInput,
  ModuleCode,
  OrderStatus,
  PaymentStatus,
  PlanCode,
  ShippingType,
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

export type ImportJobInput = {
  /** Path in the private bucket store-imports: stores/{storeId}/imports/... */
  fileKey: string;
  fileName?: string;
  productTypeId: string;
  mode?: "create_only" | "upsert";
  createMissing?: boolean;
};

/** Storefront content (/api/v1/stores/{storeId}/content/{resource}). */
export type ContentResourceInputs = { banners: BannerInput; sections: HomeSectionInput; pages: PageInput };
export type ContentResourceName = keyof ContentResourceInputs;

/** Customer accounts (one per store, phone + password; D1–D6). */
export type CustomerSession = { accessToken: string; refreshToken: string; expiresAt: number | null };
export type CustomerProfile = {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  email: string | null;
  acceptsMarketing: boolean;
};
export type CustomerAuthResponse = { session: CustomerSession; customer: CustomerProfile };
export type CustomerAddress = {
  id: string;
  label: string | null;
  recipient: string;
  phone: string | null;
  shippingZoneId: string | null;
  address: string;
  reference: string | null;
  isDefault: boolean;
};
export type RecoveryCodeResponse = { code: string; expiresAt: string; phone: string };

/** Server-side cart (D8): prices in the cart currency, recomputed on every read. */
export type CartLine = {
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  compareAtPrice: number | null;
  lineTotal: number;
  /** Units that can be bought now (0 = unavailable). */
  available: number;
  issue: "unavailable" | "insufficient" | null;
};
export type Cart = {
  /** Guest handle to keep in the browser (null for customer carts). */
  token: string | null;
  currency: CurrencyCode;
  lines: CartLine[];
  subtotal: number;
  itemCount: number;
  hasIssues: boolean;
};

/** Active checkout options of a store; prices in the base currency. */
export type CheckoutOptions = {
  shippingEnabled: boolean;
  zones: { id: string; name: string; description: string | null }[];
  methods: {
    id: string;
    zoneId: string | null;
    type: ShippingType;
    name: string;
    price: number;
    freeOverSubtotal: number | null;
    minDays: number | null;
    maxDays: number | null;
    pickupPoint: { name: string; address: string | null } | null;
  }[];
  paymentMethods: { id: string; name: string; currencies: string[]; instructions: string | null }[];
};

/** Order as the customer sees it (/order/{token}): no costs, no internal notes. */
export type PublicOrder = {
  code: string;
  publicToken: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  currency: string;
  subtotal: number;
  shippingTotal: number | null;
  discountTotal: number;
  total: number | null;
  paidTotal: number;
  customerName: string;
  note: string | null;
  shippingType: ShippingType;
  shipping: {
    type?: ShippingType;
    method?: string;
    zone?: string;
    recipient?: string;
    address?: string;
    reference?: string;
    pickup_point?: { name: string; address: string | null };
    min_days?: number;
    max_days?: number;
  };
  paymentMethod: { name: string; instructions: string | null } | null;
  lines: {
    productName: string;
    variantName: string;
    sku: string;
    attributes: { name: string; value: string }[];
    imageUrl: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  events: { type: string; to: OrderStatus | null; createdAt: string }[];
  storeName: string;
  /** wa.me link to the store with the order text (D17). */
  whatsappUrl: string | null;
};

export type CheckoutResponse = {
  orderId: string;
  order: PublicOrder;
  /** false when the idempotency key matched an existing order (retry). */
  created: boolean;
  /** Set when the customer created an account in the same step. */
  account?: CustomerAuthResponse;
};

/** Admin: «Ventas de hoy» (day in America/Havana). */
export type SalesToday = {
  dayStart: string;
  orders: { currency: string; orders: number; amount: number }[];
  received: { currency: string; amount: number }[];
  pending: number;
};

/** Admin: checkout settings resources (/api/v1/stores/{storeId}/checkout-settings/{resource}). */
export type CheckoutSettingInputs = {
  zones: ShippingZoneInput;
  methods: ShippingMethodInput;
  "payment-methods": PaymentMethodInput;
};
export type CheckoutSettingName = keyof CheckoutSettingInputs;

export type CustomerOrderSummary = {
  code: string;
  publicToken: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  currency: string;
  total: number | null;
  itemCount: number;
  createdAt: string;
};

/** A file returned by the API (Excel template/export). */
export type DownloadedFile = { blob: Blob; fileName: string };

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

  async function send(method: string, path: string, body?: unknown): Promise<Response> {
    const token = await options.getAccessToken();
    const res = await doFetch(`${options.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const err = ((await res.json().catch(() => null)) as ApiErrorBody | null)?.error;
      throw new ApiError(
        res.status,
        err?.code ?? "unknown",
        err?.message ?? "Error inesperado.",
        err?.fields,
      );
    }
    return res;
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await send(method, path, body);
    return (res.status === 204 ? null : await res.json().catch(() => null)) as T;
  }

  async function download(path: string, fallbackName: string): Promise<DownloadedFile> {
    const res = await send("GET", path);
    const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
    return { blob: await res.blob(), fileName: match?.[1] ?? fallbackName };
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
        excelTemplate: (productTypeId: string) =>
          download(`${base}/excel/template?productTypeId=${productTypeId}`, "plantilla.xlsx"),
        excelExport: (productTypeId: string) =>
          download(`${base}/excel/export?productTypeId=${productTypeId}`, "productos.xlsx"),
        createImport: (input: ImportJobInput) => request<ImportPreview>("POST", `${base}/imports`, input),
        runImport: (jobId: string) => request<ImportProgress>("POST", `${base}/imports/${jobId}/run`),
      };
    },
    content: (storeId: string) => {
      const base = `/stores/${storeId}/content`;
      return {
        create: <R extends ContentResourceName>(resource: R, input: ContentResourceInputs[R]) =>
          request<{ id: string }>("POST", `${base}/${resource}`, input),
        update: <R extends ContentResourceName>(resource: R, id: string, input: ContentResourceInputs[R]) =>
          request<{ id: string }>("PATCH", `${base}/${resource}/${id}`, input),
        remove: (resource: ContentResourceName, id: string) =>
          request<null>("DELETE", `${base}/${resource}/${id}`),
        reorder: (table: "banners" | "sections", ids: string[]) =>
          request<null>("POST", `${base}/reorder`, { table, ids }),
        saveTheme: (input: ThemeInput) => request<{ theme: ThemeInput }>("PUT", `${base}/theme`, input),
        saveMenu: (location: MenuLocation, input: MenuInput) =>
          request<null>("PUT", `${base}/menus/${location}`, input),
      };
    },
    /** Storefront customer: sign-up, sign-in and password reset (no token needed). */
    customerAuth: (storeId: string) => {
      const base = `/stores/${storeId}/customer-auth`;
      return {
        register: (input: CustomerRegisterInput) => request<CustomerAuthResponse>("POST", `${base}/register`, input),
        login: (input: CustomerLoginInput) => request<CustomerAuthResponse>("POST", `${base}/login`, input),
        reset: (input: CustomerResetInput) => request<CustomerAuthResponse>("POST", `${base}/reset`, input),
      };
    },
    /** Cart of a guest (token) or of the signed-in customer. */
    cart: (storeId: string) => {
      const base = `/stores/${storeId}/cart`;
      const query = (token?: string | null, currency?: string) => {
        const params = new URLSearchParams();
        if (token) params.set("token", token);
        if (currency) params.set("currency", currency);
        return params.size ? `?${params}` : "";
      };
      return {
        get: (token?: string | null, currency?: string) => request<Cart>("GET", `${base}${query(token, currency)}`),
        update: (input: CartUpdateInput) => request<Cart>("PUT", base, input),
      };
    },
    checkout: (storeId: string) => ({
      options: () => request<CheckoutOptions>("GET", `/stores/${storeId}/checkout`),
      place: (input: CheckoutInput) => request<CheckoutResponse>("POST", `/stores/${storeId}/checkout`, input),
      order: (token: string) => request<{ order: PublicOrder }>("GET", `/stores/${storeId}/checkout/orders/${token}`),
    }),
    /** Admin: shipping zones and methods, payment methods (admin+). */
    checkoutSettings: (storeId: string) => {
      const base = `/stores/${storeId}/checkout-settings`;
      return {
        create: <R extends CheckoutSettingName>(resource: R, input: CheckoutSettingInputs[R]) =>
          request<{ id: string }>("POST", `${base}/${resource}`, input),
        update: <R extends CheckoutSettingName>(resource: R, id: string, input: CheckoutSettingInputs[R]) =>
          request<{ id: string }>("PATCH", `${base}/${resource}/${id}`, input),
        remove: (resource: CheckoutSettingName, id: string) => request<null>("DELETE", `${base}/${resource}/${id}`),
      };
    },
    /** Admin: orders (staff+). Reads go through pg_graphql (AdminOrdersQuery, AdminOrderQuery). */
    orders: (storeId: string) => {
      const base = `/stores/${storeId}/orders`;
      const act = (orderId: string, action: string, body: unknown) =>
        request<{ id: string }>("POST", `${base}/${orderId}/${action}`, body);
      return {
        create: (input: AdminOrderInput) => request<CheckoutResponse>("POST", base, input),
        transition: (orderId: string, to: Exclude<OrderStatus, "cancelled">) => act(orderId, "transition", { to }),
        setShipping: (orderId: string, amount: number) => act(orderId, "shipping", { amount }),
        recordPayment: (orderId: string, input: OrderPaymentInput) => act(orderId, "payments", input),
        cancel: (orderId: string, reason?: string) => act(orderId, "cancel", { reason }),
        addNote: (orderId: string, text: string) => act(orderId, "notes", { text }),
        salesToday: () => request<SalesToday>("GET", `${base}/sales-today`),
      };
    },
    /** Admin: customers of the store. */
    customers: (storeId: string) => ({
      setBlocked: (customerId: string, isBlocked: boolean) =>
        request<{ id: string; isBlocked: boolean }>("PATCH", `/stores/${storeId}/customers/${customerId}`, { isBlocked }),
      recoveryCode: (customerId: string) =>
        request<RecoveryCodeResponse>("POST", `/stores/${storeId}/customers/${customerId}/recovery-code`),
    }),
    /** Signed-in customer of the store (customer token). */
    customer: (storeId: string) => {
      const base = `/stores/${storeId}/customer`;
      return {
        me: () => request<{ customer: CustomerProfile }>("GET", base),
        updateProfile: (input: CustomerProfileInput) =>
          request<{ customer: CustomerProfile }>("PATCH", base, input),
        addresses: () => request<{ addresses: CustomerAddress[] }>("GET", `${base}/addresses`),
        createAddress: (input: CustomerAddressInput) =>
          request<{ address: CustomerAddress }>("POST", `${base}/addresses`, input),
        updateAddress: (id: string, input: CustomerAddressInput) =>
          request<{ address: CustomerAddress }>("PATCH", `${base}/addresses/${id}`, input),
        deleteAddress: (id: string) => request<null>("DELETE", `${base}/addresses/${id}`),
        orders: () => request<{ orders: CustomerOrderSummary[] }>("GET", `${base}/orders`),
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
