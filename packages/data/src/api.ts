import type {
  CreateStoreInput,
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
    const data: unknown = await res.json().catch(() => null);
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
