import type {
  ProductSort,
  SectionSettings,
  SectionVisibilityInput,
  AttributeInput,
  CustomDomainInput,
  CustomDomainStatus,
  DnsRecord,
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
  StoreDescriptionInput,
  StoreLogoInput,
  ThemeInput,
  ImportPreview,
  ImportProgress,
  ProductInput,
  ProductMediaInput,
  ProductStatus,
  ProductTypeInput,
  StockInput,
  WarehouseInput,
  StockMovementQuery,
  StockMovementType,
  StockTransferInput,
  ExpenseInput,
  FinanceInventoryQuery,
  FinancePeriod,
  MarginGroup,
  AdminOrderInput,
  NotificationAudience,
  NotificationContactInput,
  PlatformWhatsappInput,
  WhatsappMode,
  WhatsappTemplateInput,
  CartVoucherInput,
  PromotionInput,
  VoucherInput,
  VoucherScope,
  DiscountReward,
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
  BillingInterval,
  BillingSettingsInput,
  ChangePlanInput,
  GrantType,
  InvoiceStatus,
  PaymentMethod,
  PlanUpdateInput,
  PlatformPaymentInput,
  SubscriptionGrantInput,
  SubscriptionUpdateInput,
  TeamInviteInput,
  StaffPasswordResetInput,
} from "@kshop/core";
import type {
  Facets,
  HomeSection,
  ProductCardData,
  ProductFilters,
  StorefrontProduct,
  StorefrontShell,
} from "./storefront-reads";
import { createResilientFetch } from "./resilient-fetch";

// Contract of /api/v1, shared by the web and the Capacitor apps.

export type ApiErrorBody = {
  error: { code: string; message: string; fields?: Record<string, string[]> };
};

export type MeResponse = {
  user: { id: string; email: string | null };
  isSuperadmin: boolean;
  stores: { id: string; slug: string; name: string; role: StoreRole }[];
  /** With ?storeId=: everything the admin shell needs for that store, in the same call (R11). */
  admin?: AdminBootstrap;
};

/** public.admin_bootstrap: role, modules, limits, subscription and status of a store, as RLS lets the user see them. */
export type AdminBootstrap = {
  role: StoreRole | null;
  isSuperadmin: boolean;
  modules: {
    code: string;
    source: "plan" | "addon" | "grant";
    limits: Record<string, number>;
    endsAt: string | null;
  }[];
  limits: Record<string, number>;
  subscription: { status: string; trialEndsAt: string | null } | null;
  storeStatus: string | null;
  /** USD/month of the modules sold alone. */
  addonPrices: Record<string, number>;
  /** Orders waiting for confirmation (the bell). */
  toConfirm: number;
  /** R12: admin menu sections that are not visible (no entry = visible). Absent in boots cached before R12. */
  sections?: SectionSettings;
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
  owner: { id: string; email: string | null; lastSignInAt: string | null } | null;
  createdAt: string;
  /** R12: Superadmin › Tiendas reads all of it in one statement (platform_stores_overview). */
  suspendedReason: "billing" | "manual" | null;
  currentPeriodEnd: string | null;
  /** USD still owed on pending platform invoices. */
  amountDue: number;
  nextDueAt: string | null;
  orders30d: number;
  lastOrderAt: string | null;
  products: number;
};

export type CreateStoreResponse = {
  store: PlatformStore;
  /** One-time access link for the owner (sent by the superadmin over WhatsApp). */
  ownerAccessLink: string | null;
  ownerWasCreated: boolean;
};

/** Superadmin › Tienda › «Enviar acceso»: new one-time link for the owner (emailed when Resend is set). */
export type OwnerAccessResponse = { email: string; link: string; emailed: boolean };

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
export type RecoveryCodeResponse = {
  code: string;
  expiresAt: string;
  phone: string;
  /** The platform WhatsApp sent it (live mode); otherwise the staff sends it by wa.me. */
  sentByWhatsapp: boolean;
};

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
  /** Price before the promotion (= unitPrice without one). */
  listPrice: number;
  unitPrice: number;
  compareAtPrice: number | null;
  promotionName: string | null;
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
  /** Sum of the lines with their promotions. */
  subtotal: number;
  /** Saving of the promotions (list prices - subtotal). */
  promotionSavings: number;
  /** Voucher typed in the cart: amount null = shipping voucher priced at checkout; error = why it does not apply. */
  voucher: CartVoucher | null;
  /** Voucher discount that applies now (0 when it does not apply). */
  discountTotal: number;
  /** The store sells with coupons (vouchers module): otherwise there is no coupon field. */
  vouchersEnabled: boolean;
  itemCount: number;
  hasIssues: boolean;
};

export type CartVoucher = {
  code: string;
  name: string | null;
  scope: VoucherScope | null;
  amount: number | null;
  error: string | null;
};

/** Superadmin: the platform WhatsApp (OpenWA); the API key is never returned. */
export type PlatformWhatsapp = {
  mode: WhatsappMode;
  url: string | null;
  session: string | null;
  ratePerMinute: number;
  storeRatePerMinute: number;
  hasApiKey: boolean;
  queue: { pending: number; failed24h: number; sent24h: number; simulated24h: number };
};

/** Discount of an order as frozen at checkout (promotion, voucher or manual). */
export type OrderDiscount = {
  kind: "promotion" | "voucher" | "manual";
  name: string;
  code: string | null;
  reward: DiscountReward;
  value: number;
  amount: number;
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
    /** Price before the promotion (null in orders before phase 4). */
    listPrice: number | null;
    unitPrice: number;
    lineTotal: number;
  }[];
  discounts: OrderDiscount[];
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
/** Admin home (redesign R6): what to do, and with the sales_today module the week and what is owed (base currency). */
/** Periods of the admin home KPIs: today, the last 7 days and this month (vs yesterday, the 7 before, last month). */
export const HOME_PERIODS = ["day", "week", "month"] as const;
export type HomePeriod = (typeof HOME_PERIODS)[number];
export type HomePeriodFigures = { orders: number; sold: number; received: number };

export type HomeSummary = {
  todo: { toConfirm: number; toDeliver: number; lowStock: number };
  week: { day: string; orders: number; amount: number }[] | null;
  toCollect: number | null;
  /** In the base currency; null without the sales_today module. */
  periods: Record<HomePeriod, HomePeriodFigures & { previous: HomePeriodFigures }> | null;
};

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

// ---- Phase 5: plans, billing and team ----

export type BillingPlan = {
  code: PlanCode;
  name: string;
  price: number;
  yearlyPrice: number | null;
  isPublic: boolean;
  modules: ModuleCode[];
  limits: { maxProducts: number | null; maxStaff: number | null };
};

export type BillingModule = {
  code: ModuleCode;
  name: string;
  description: string | null;
  /** USD/month when sold alone (null = only in a plan). */
  addonPrice: number | null;
  dependsOn: string[];
};

export type InvoiceLine = {
  kind: "plan" | "addon" | "discount" | "adjustment";
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
};

export type PlatformInvoice = {
  id: string;
  storeId: string;
  store: { name: string; slug: string } | null;
  number: string;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  discount: number;
  total: number;
  amountPaid: number;
  status: InvoiceStatus;
  /** Pending and past its due date. */
  overdue: boolean;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  voidReason: string | null;
  lines: InvoiceLine[];
  payments: { id: string; amount: number; method: PaymentMethod; reference: string | null; paidAt: string }[];
};

export type BillingQuote = {
  periodStart: string;
  periodEnd: string;
  interval: BillingInterval;
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  total: number;
};

export type StoreUsage = {
  maxProducts: { limit: number | null; used: number };
  maxStaff: { limit: number | null; used: number };
};

/** A module as the owner sees it: active (and from where) or what it would cost. */
export type BillingModuleState = BillingModule & {
  source: "plan" | "addon" | "grant" | null;
  /** Included in the Pro plan (to sell the upgrade). */
  inPro: boolean;
  endsAt: string | null;
};

/** Admin › Plan y facturación (owner/admin). */
export type StoreBilling = {
  plan: { code: PlanCode; name: string };
  interval: BillingInterval;
  status: string;
  storeStatus: StoreStatus;
  suspendedReason: "billing" | "manual" | null;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  founder: boolean;
  cancelAt: string | null;
  /** Next invoice (null for a courtesy store). */
  quote: BillingQuote | null;
  usage: StoreUsage;
  modules: BillingModuleState[];
  invoices: PlatformInvoice[];
  plans: BillingPlan[];
  instructions: string | null;
  supportWhatsapp: string | null;
};

export type SubscriptionGrant = {
  id: string;
  type: GrantType;
  value: number;
  reason: string | null;
  startsAt: string;
  endsAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/** Superadmin › Tienda › Suscripción. */
export type PlatformSubscription = StoreBilling & {
  store: PlatformStore;
  priceOverride: number | null;
  limitOverrides: { maxProducts?: number | null; maxStaff?: number | null };
  notes: string | null;
  grants: SubscriptionGrant[];
  storeModules: {
    code: ModuleCode;
    source: "plan" | "addon" | "grant";
    enabled: boolean;
    price: number | null;
    endsAt: string | null;
    reason: string | null;
  }[];
};

export type BillingSettings = {
  invoiceLeadDays: number;
  invoiceDueDays: number;
  graceDays: number;
  trialReminderDays: number;
  defaultTrialDays: number;
  billingInstructions: string;
  supportWhatsapp: string | null;
};

export type TeamMember = {
  userId: string;
  email: string | null;
  role: StoreRole;
  createdAt: string;
  isMe: boolean;
};

export type TeamResponse = { members: TeamMember[]; usage: StoreUsage["maxStaff"] };

export type TeamInviteResponse = { member: TeamMember; accessLink: string; accountWasCreated: boolean };

// Phase 6: Admin › Almacenes (multi_warehouse) and Admin › Monedas (multi_currency).
export type WarehouseSummary = {
  id: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
  isPickupPoint: boolean;
  variants: number;
  units: number;
  reserved: number;
};

export type ZoneWarehouses = { id: string; name: string; isActive: boolean; warehouseIds: string[] };

export type WarehousesOverview = { warehouses: WarehouseSummary[]; zones: ZoneWarehouses[] };

export type WarehouseStockRow = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  allocated: number;
};

export type StockMovement = {
  id: string;
  createdAt: string;
  type: StockMovementType;
  quantity: number;
  warehouseName: string;
  productName: string;
  variantName: string;
  sku: string;
  note: string | null;
  orderId: string | null;
  orderNumber: number | null;
  transferId: string | null;
  userEmail: string | null;
};

export type StockMovementsPage = {
  movements: StockMovement[];
  total: number;
  page: number;
  pageSize: number;
};

export type CurrencyRateEntry = { rate: number; setAt: string; setBy: string | null };

export type StoreCurrencyRates = {
  currency: CurrencyCode;
  isBase: boolean;
  sells: boolean;
  rateToBase: number;
  rounding: number | null;
  updatedAt: string;
  /** Products with a fixed price in this currency (they do not follow the rate). */
  fixedPrices: number;
  history: CurrencyRateEntry[];
  /** elTOQUE informal rate as rate_to_base, when the token is set and the base currency allows it. */
  suggested: number | null;
};

// Phase 6: Finanzas (module finance). Equivalent amounts are in `currency`.
export type MoneyByCurrency = { currency: CurrencyCode; amount: number };

export type FinanceSummary = {
  currency: CurrencyCode;
  from: string;
  to: string;
  sold: (MoneyByCurrency & { orders: number; pending: number })[];
  collected: MoneyByCurrency[];
  expenses: MoneyByCurrency[];
  totals: {
    orders: number;
    sold: number;
    pending: number;
    shipping: number;
    collected: number;
    expenses: number;
    avgTicket: number;
    margin: number;
    net: number;
    linesWithoutCost: number;
  };
  previous: { from: string; to: string; orders: number; sold: number };
};

export type FinanceDay = {
  day: string;
  orders: number;
  sold: MoneyByCurrency[];
  collected: MoneyByCurrency[];
  expenses: MoneyByCurrency[];
  soldEq: number;
  collectedEq: number;
  expensesEq: number;
};

export type FinanceMargin = {
  currency: CurrencyCode;
  totals: {
    units: number;
    revenue: number;
    revenueWithCost: number;
    cost: number;
    margin: number;
    lines: number;
    linesWithoutCost: number;
  };
  rows: {
    key: string | null;
    name: string;
    units: number;
    revenue: number;
    cost: number;
    margin: number;
    marginPct: number | null;
    linesWithoutCost: number;
  }[];
};

export type FinanceBreakdownRow = { name: string; orders: number; amount: number; original?: number };

export type FinanceBreakdown = {
  currency: CurrencyCode;
  paymentMethods: FinanceBreakdownRow[];
  zones: FinanceBreakdownRow[];
  channels: FinanceBreakdownRow[];
  currencies: FinanceBreakdownRow[];
};

export type FinanceInventory = {
  currency: CurrencyCode;
  totals: {
    variants: number;
    units: number;
    reserved: number;
    costValue: number;
    saleValue: number;
    withoutCost: number;
    outOfStock: number;
    lowStock: number;
  };
  total: number;
  page: number;
  pageSize: number;
  rows: {
    variantId: string;
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    allocated: number;
    available: number;
    threshold: number;
    costValue: number | null;
    saleValue: number;
    lastMovement: string | null;
  }[];
};

export type Expense = {
  id: string;
  spentOn: string;
  category: string;
  amount: number;
  currency: CurrencyCode;
  note: string | null;
  createdBy: string | null;
};

export type CurrencyRatesResponse = {
  baseCurrency: CurrencyCode;
  currencies: StoreCurrencyRates[];
  reference: { source: "eltoque"; date: string } | null;
};

export type CustomDomain = {
  id: string;
  domain: string;
  status: CustomDomainStatus;
  dnsRecords: DnsRecord[];
  verifiedAt: string | null;
  checkedAt: string | null;
  lastError: string | null;
  createdAt: string;
  /** Served right now (verified, module on, store active). */
  live: boolean;
};

/** dry_run: no Vercel token, domains are simulated (local dev). */
export type CustomDomainResponse = { domain: CustomDomain | null; mode: "dry_run" | "live" };

export type PlatformDomain = CustomDomain & { storeId: string; storeName: string; storeSlug: string };

/** An Android build (PRP-7 D13): the APK in the public store-apps bucket. */
export type AppBuild = {
  id: string;
  appId: string;
  versionCode: number;
  versionName: string;
  url: string;
  sizeBytes: number | null;
  published: boolean;
  notes: string | null;
  createdAt: string;
};

/** Admin › App móvil: the owner's pending request, the latest published store app and the admin app. */
export type MobileAppResponse = {
  requestedAt: string | null;
  latest: AppBuild | null;
  adminApp: AppBuild | null;
};

export type PlatformAppStore = {
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeStatus: string;
  moduleEnabled: boolean;
  requestedAt: string | null;
  builds: AppBuild[];
};

export type PlatformAppsResponse = { stores: PlatformAppStore[]; adminBuilds: AppBuild[] };

export type ApiClientOptions = {
  /** Origin of the web app ("" for same-origin calls in the browser). */
  baseUrl: string;
  getAccessToken: () => string | null | undefined | Promise<string | null | undefined>;
  fetch?: typeof fetch;
  /** Sent with every call, e.g. { "X-Kshop-Channel": "app" } from the store app. */
  headers?: Record<string, string>;
};

export function createApiClient(options: ApiClientOptions) {
  const rawFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  // Reads get a time limit and one retry (R11); writes go once and without a limit (Excel imports, photos).
  const readFetch = createResilientFetch(rawFetch, { canRetry: () => true });

  async function send(method: string, path: string, body?: unknown): Promise<Response> {
    const token = await options.getAccessToken();
    const doFetch = method === "GET" ? readFetch : rawFetch;
    const res = await doFetch(`${options.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        ...options.headers,
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
    me: (storeId?: string) =>
      request<MeResponse>("GET", storeId ? `/me?storeId=${encodeURIComponent(storeId)}` : "/me"),
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
        saveDescription: (input: StoreDescriptionInput) =>
          request<{ description: string | null }>("PUT", `${base}/description`, input),
        saveLogo: (input: StoreLogoInput) =>
          request<{ logoUrl: string | null }>("PUT", `${base}/logo`, input),
        saveMenu: (location: MenuLocation, input: MenuInput) =>
          request<null>("PUT", `${base}/menus/${location}`, input),
      };
    },
    /** Storefront customer: sign-up, sign-in and password reset (no token needed). */
    customerAuth: (storeId: string) => {
      const base = `/stores/${storeId}/customer-auth`;
      return {
        register: (input: CustomerRegisterInput) =>
          request<CustomerAuthResponse>("POST", `${base}/register`, input),
        login: (input: CustomerLoginInput) => request<CustomerAuthResponse>("POST", `${base}/login`, input),
        reset: (input: CustomerResetInput) => request<CustomerAuthResponse>("POST", `${base}/reset`, input),
      };
    },
    /** Store admin «¿Olvidaste tu contraseña?» (no token needed). */
    staffAuth: (storeId: string) => ({
      passwordReset: (input: StaffPasswordResetInput) =>
        request<null>("POST", `/stores/${storeId}/staff-auth/password-reset`, input),
    }),
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
        get: (token?: string | null, currency?: string) =>
          request<Cart>("GET", `${base}${query(token, currency)}`),
        update: (input: CartUpdateInput) => request<Cart>("PUT", base, input),
        setVoucher: (input: CartVoucherInput) => request<Cart>("PUT", `${base}/voucher`, input),
      };
    },
    /** Cached storefront reads of a store (the store app), PRP-7 D3. */
    storefront: (storeId: string) => {
      const get = <T>(params: Record<string, string>) =>
        request<T>("GET", `/stores/${storeId}/storefront?${new URLSearchParams(params)}`);
      return {
        shell: () => get<StorefrontShell>({ view: "shell" }),
        home: () => get<HomeSection[]>({ view: "home" }),
        products: (filters: ProductFilters, sort: ProductSort, page: number, perPage?: number) =>
          get<{ total: number; products: ProductCardData[] }>({
            view: "products",
            filters: JSON.stringify(filters),
            sort,
            page: String(page),
            ...(perPage && { perPage: String(perPage) }),
          }),
        facets: (filters: ProductFilters) =>
          get<Facets>({ view: "facets", filters: JSON.stringify(filters) }),
        product: (slug: string) => get<StorefrontProduct | null>({ view: "product", slug }),
        page: (slug: string) =>
          get<{
            title: string;
            content: string;
            seoTitle: string | null;
            seoDescription: string | null;
          } | null>({
            view: "page",
            slug,
          }),
      };
    },
    checkout: (storeId: string) => ({
      options: () => request<CheckoutOptions>("GET", `/stores/${storeId}/checkout`),
      place: (input: CheckoutInput) =>
        request<CheckoutResponse>("POST", `/stores/${storeId}/checkout`, input),
      order: (token: string) =>
        request<{ order: PublicOrder }>("GET", `/stores/${storeId}/checkout/orders/${token}`),
    }),
    /** Admin: shipping zones and methods, payment methods (admin+). */
    checkoutSettings: (storeId: string) => {
      const base = `/stores/${storeId}/checkout-settings`;
      return {
        create: <R extends CheckoutSettingName>(resource: R, input: CheckoutSettingInputs[R]) =>
          request<{ id: string }>("POST", `${base}/${resource}`, input),
        update: <R extends CheckoutSettingName>(resource: R, id: string, input: CheckoutSettingInputs[R]) =>
          request<{ id: string }>("PATCH", `${base}/${resource}/${id}`, input),
        remove: (resource: CheckoutSettingName, id: string) =>
          request<null>("DELETE", `${base}/${resource}/${id}`),
      };
    },
    /** Admin: orders (staff+). Reads go through pg_graphql (AdminOrdersQuery, AdminOrderQuery). */
    orders: (storeId: string) => {
      const base = `/stores/${storeId}/orders`;
      const act = (orderId: string, action: string, body: unknown) =>
        request<{ id: string }>("POST", `${base}/${orderId}/${action}`, body);
      return {
        create: (input: AdminOrderInput) => request<CheckoutResponse>("POST", base, input),
        transition: (orderId: string, to: Exclude<OrderStatus, "cancelled">) =>
          act(orderId, "transition", { to }),
        setShipping: (orderId: string, amount: number) => act(orderId, "shipping", { amount }),
        recordPayment: (orderId: string, input: OrderPaymentInput) => act(orderId, "payments", input),
        cancel: (orderId: string, reason?: string) => act(orderId, "cancel", { reason }),
        addNote: (orderId: string, text: string) => act(orderId, "notes", { text }),
        salesToday: () => request<SalesToday>("GET", `${base}/sales-today`),
        summary: () => request<HomeSummary>("GET", `${base}/summary`),
      };
    },
    /** Admin: promotions and vouchers (module discounts, admin+). */
    discounts: (storeId: string) => {
      const base = `/stores/${storeId}`;
      return {
        createPromotion: (input: PromotionInput) =>
          request<{ id: string }>("POST", `${base}/promotions`, input),
        updatePromotion: (id: string, input: PromotionInput) =>
          request<{ id: string }>("PUT", `${base}/promotions/${id}`, input),
        deletePromotion: (id: string) => request<null>("DELETE", `${base}/promotions/${id}`),
        createVoucher: (input: VoucherInput) => request<{ id: string }>("POST", `${base}/vouchers`, input),
        updateVoucher: (id: string, input: VoucherInput) =>
          request<{ id: string }>("PUT", `${base}/vouchers/${id}`, input),
        deleteVoucher: (id: string) => request<null>("DELETE", `${base}/vouchers/${id}`),
      };
    },
    /** Admin: WhatsApp notices of the store (module whatsapp_notifications). */
    notifications: (storeId: string) => {
      const base = `/stores/${storeId}`;
      return {
        createContact: (input: NotificationContactInput) =>
          request<{ id: string }>("POST", `${base}/notification-contacts`, input),
        updateContact: (id: string, input: NotificationContactInput) =>
          request<{ id: string }>("PATCH", `${base}/notification-contacts/${id}`, input),
        deleteContact: (id: string) => request<null>("DELETE", `${base}/notification-contacts/${id}`),
        saveTemplate: (input: WhatsappTemplateInput) =>
          request<{ event: string; audience: NotificationAudience }>(
            "PUT",
            `${base}/whatsapp-templates`,
            input,
          ),
        restoreTemplate: (event: string, audience: NotificationAudience) =>
          request<null>("DELETE", `${base}/whatsapp-templates?event=${event}&audience=${audience}`),
        preview: (body: string, audience: NotificationAudience, orderId?: string) =>
          request<{ text: string }>("POST", `${base}/whatsapp-templates/preview`, {
            body,
            audience,
            orderId,
          }),
        retry: (logId: string) => request<{ id: string }>("POST", `${base}/notifications/${logId}/retry`),
      };
    },
    /** Admin: customers of the store. */
    billing: (storeId: string) => ({
      get: () => request<StoreBilling>("GET", `/stores/${storeId}/billing`),
    }),
    team: (storeId: string) => {
      const base = `/stores/${storeId}/team`;
      return {
        list: () => request<TeamResponse>("GET", base),
        invite: (input: TeamInviteInput) => request<TeamInviteResponse>("POST", base, input),
        update: (userId: string, role: StoreRole) =>
          request<{ member: TeamMember }>("PATCH", `${base}/${userId}`, { role }),
        remove: (userId: string) => request<null>("DELETE", `${base}/${userId}`),
      };
    },
    warehouses: (storeId: string) => {
      const base = `/stores/${storeId}/warehouses`;
      return {
        overview: () => request<WarehousesOverview>("GET", base),
        setZone: (zoneId: string, warehouseIds: string[]) =>
          request<{ zoneId: string; warehouseIds: string[] }>("PUT", `${base}/zones/${zoneId}`, {
            warehouseIds,
          }),
        stock: (warehouseId: string, query = "") =>
          request<{ rows: WarehouseStockRow[] }>(
            "GET",
            `${base}/${warehouseId}/stock?${new URLSearchParams({ q: query })}`,
          ),
        transfer: (input: StockTransferInput) =>
          request<{ transferId: string; variants: number; units: number }>(
            "POST",
            `${base}/transfers`,
            input,
          ),
        movements: (query: Partial<StockMovementQuery> = {}) =>
          request<StockMovementsPage>(
            "GET",
            `${base}/movements?${new URLSearchParams(
              Object.entries(query).flatMap(([k, v]) =>
                v === undefined || v === "" ? [] : [[k, String(v)]],
              ),
            )}`,
          ),
      };
    },
    finance: (storeId: string) => {
      const base = `/stores/${storeId}/finance`;
      const qs = (query: Record<string, string | number | undefined>) =>
        new URLSearchParams(
          Object.entries(query).flatMap(([k, v]) => (v === undefined || v === "" ? [] : [[k, String(v)]])),
        ).toString();
      return {
        summary: (period: FinancePeriod) => request<FinanceSummary>("GET", `${base}/summary?${qs(period)}`),
        daily: (period: FinancePeriod) =>
          request<{ days: FinanceDay[] }>("GET", `${base}/daily?${qs(period)}`),
        margin: (period: FinancePeriod, group: MarginGroup) =>
          request<FinanceMargin>("GET", `${base}/margin?${qs({ ...period, group })}`),
        breakdown: (period: FinancePeriod) =>
          request<FinanceBreakdown>("GET", `${base}/breakdown?${qs(period)}`),
        inventory: (query: Partial<FinanceInventoryQuery> & Pick<FinanceInventoryQuery, "currency">) =>
          request<FinanceInventory>("GET", `${base}/inventory?${qs(query)}`),
        expenses: (period: Pick<FinancePeriod, "from" | "to">) =>
          request<{ expenses: Expense[] }>("GET", `${base}/expenses?${qs(period)}`),
        createExpense: (input: ExpenseInput) => request<Expense>("POST", `${base}/expenses`, input),
        updateExpense: (id: string, input: ExpenseInput) =>
          request<Expense>("PUT", `${base}/expenses/${id}`, input),
        deleteExpense: (id: string) => request<null>("DELETE", `${base}/expenses/${id}`),
        export: (period: FinancePeriod) => download(`${base}/export?${qs(period)}`, "finanzas.xlsx"),
      };
    },
    currencyRates: (storeId: string) => ({
      get: () => request<CurrencyRatesResponse>("GET", `/stores/${storeId}/currencies/rates`),
    }),
    customDomain: (storeId: string) => ({
      get: () => request<CustomDomainResponse>("GET", `/stores/${storeId}/custom-domain`),
      request: (input: CustomDomainInput) =>
        request<{ domain: CustomDomain }>("POST", `/stores/${storeId}/custom-domain`, input),
      check: () => request<{ domain: CustomDomain }>("POST", `/stores/${storeId}/custom-domain/check`),
      remove: () => request<null>("DELETE", `/stores/${storeId}/custom-domain`),
    }),
    mobileApp: (storeId: string) => ({
      get: () => request<MobileAppResponse>("GET", `/stores/${storeId}/mobile-app`),
      request: () => request<MobileAppResponse>("POST", `/stores/${storeId}/mobile-app`),
    }),
    customers: (storeId: string) => ({
      setBlocked: (customerId: string, isBlocked: boolean) =>
        request<{ id: string; isBlocked: boolean }>("PATCH", `/stores/${storeId}/customers/${customerId}`, {
          isBlocked,
        }),
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
        favorites: () =>
          request<{ productIds: string[]; products: ProductCardData[] }>("GET", `${base}/favorites`),
        addFavorite: (productId: string) => request<null>("PUT", `${base}/favorites/${productId}`),
        removeFavorite: (productId: string) => request<null>("DELETE", `${base}/favorites/${productId}`),
        orders: () => request<{ orders: CustomerOrderSummary[] }>("GET", `${base}/orders`),
        order: (orderId: string) => request<{ publicToken: string }>("GET", `${base}/orders/${orderId}`),
      };
    },
    platform: {
      listStores: () => request<{ stores: PlatformStore[] }>("GET", "/platform/stores"),
      createStore: (input: CreateStoreInput) =>
        request<CreateStoreResponse>("POST", "/platform/stores", input),
      updateStoreStatus: (storeId: string, status: StoreStatus) =>
        request<{ store: PlatformStore }>("PATCH", `/platform/stores/${storeId}`, { status }),
      ownerAccess: (storeId: string) =>
        request<OwnerAccessResponse>("POST", `/platform/stores/${storeId}/owner-access`),
      sections: (storeId: string) =>
        request<{ sections: SectionSettings }>("GET", `/platform/stores/${storeId}/sections`),
      setSection: (storeId: string, input: SectionVisibilityInput) =>
        request<{ sections: SectionSettings }>("PUT", `/platform/stores/${storeId}/sections`, input),
      domains: () =>
        request<{ domains: PlatformDomain[]; mode: "dry_run" | "live" }>("GET", "/platform/domains"),
      checkDomain: (id: string) => request<null>("POST", `/platform/domains/${id}/check`),
      removeDomain: (id: string) => request<null>("DELETE", `/platform/domains/${id}`),
      apps: () => request<PlatformAppsResponse>("GET", "/platform/apps"),
      setAppBuildPublished: (id: string, published: boolean) =>
        request<null>("PATCH", `/platform/apps/builds/${id}`, { published }),
      whatsapp: () => request<PlatformWhatsapp>("GET", "/platform/whatsapp"),
      setWhatsapp: (input: PlatformWhatsappInput) =>
        request<PlatformWhatsapp>("PUT", "/platform/whatsapp", input),
      testWhatsapp: (phone: string, text: string) =>
        request<{ status: string }>("POST", "/platform/whatsapp/test", { phone, text }),
      plans: () => request<{ plans: BillingPlan[]; modules: BillingModule[] }>("GET", "/platform/plans"),
      updatePlan: (code: PlanCode, input: PlanUpdateInput) =>
        request<{ plans: BillingPlan[]; modules: BillingModule[] }>("PUT", `/platform/plans/${code}`, input),
      setAddonPrice: (code: ModuleCode, addonPrice: number | null) =>
        request<{ plans: BillingPlan[]; modules: BillingModule[] }>("PUT", `/platform/modules/${code}`, {
          addonPrice,
        }),
      billingSettings: () => request<BillingSettings>("GET", "/platform/billing/settings"),
      setBillingSettings: (input: BillingSettingsInput) =>
        request<BillingSettings>("PUT", "/platform/billing/settings", input),
      invoices: (status: "open" | "overdue" | "paid" | "all" = "open") =>
        request<{ invoices: PlatformInvoice[] }>("GET", `/platform/invoices?status=${status}`),
      recordPayment: (invoiceId: string, input: PlatformPaymentInput) =>
        request<{ invoice: PlatformInvoice }>("POST", `/platform/invoices/${invoiceId}/payments`, input),
      adjustInvoice: (invoiceId: string, description: string, amount: number) =>
        request<{ invoice: PlatformInvoice }>("POST", `/platform/invoices/${invoiceId}/adjustments`, {
          description,
          amount,
        }),
      voidInvoice: (invoiceId: string, reason?: string) =>
        request<{ invoice: PlatformInvoice }>("POST", `/platform/invoices/${invoiceId}/void`, { reason }),
      subscription: (storeId: string) => {
        const base = `/platform/stores/${storeId}/subscription`;
        return {
          get: () => request<PlatformSubscription>("GET", base),
          update: (input: SubscriptionUpdateInput) => request<PlatformSubscription>("PATCH", base, input),
          changePlan: (input: ChangePlanInput) => request<PlatformSubscription>("PUT", `${base}/plan`, input),
          setAddon: (moduleCode: ModuleCode, enabled: boolean) =>
            request<PlatformSubscription>("PUT", `${base}/addons`, { moduleCode, enabled }),
          setModuleGrant: (
            moduleCode: ModuleCode,
            enabled: boolean,
            endsAt?: string | null,
            reason?: string,
          ) =>
            request<PlatformSubscription>("PUT", `${base}/module-grants`, {
              moduleCode,
              enabled,
              endsAt,
              reason,
            }),
          addGrant: (input: SubscriptionGrantInput) =>
            request<PlatformSubscription>("POST", `${base}/grants`, input),
          revokeGrant: (grantId: string) =>
            request<PlatformSubscription>("DELETE", `${base}/grants/${grantId}`),
          issueInvoice: () => request<PlatformSubscription>("POST", `${base}/invoices`),
        };
      },
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
