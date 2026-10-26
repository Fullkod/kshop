import { ApiError, createApiClient } from "@kshop/data";
import type { ListingReader, PublicStore } from "@kshop/storefront";
import { appConfig } from "./config";

// Storefront reads through the platform API (GET /api/v1/stores/{id}/storefront): the same cached functions as the
// web pages, so the phones never hit the database directly (anon pg_graphql has a 3 s statement timeout and no
// cache), PRP-7 D3. Only app_info goes straight to Supabase: tiny and always fresh.

const api = createApiClient({
  baseUrl: appConfig.apiBaseUrl,
  headers: { "X-Kshop-Channel": "app" },
  getAccessToken: () => null,
});
const storefront = api.storefront(appConfig.storeId);

export async function loadStore(): Promise<PublicStore> {
  const res = await fetch(
    `${appConfig.apiBaseUrl}/api/v1/stores/${appConfig.storeId}/storefront?view=store`,
    {
      headers: { "X-Kshop-Channel": "app" },
    },
  );
  if (!res.ok) throw new ApiError(res.status, "store", "Tienda no disponible.");
  return (await res.json()) as PublicStore;
}

export type AppInfo = {
  available: boolean;
  store_status: string | null;
  latest: { version_code: number; version_name: string; apk_path: string; size_bytes: number | null } | null;
};

/** Whether this app may be used and the latest published version (PRP-7 D10, D15). */
export async function loadAppInfo(): Promise<AppInfo> {
  const res = await fetch(`${appConfig.supabaseUrl}/rest/v1/rpc/app_info`, {
    method: "POST",
    headers: {
      apikey: appConfig.supabaseKey,
      Authorization: `Bearer ${appConfig.supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_store_id: appConfig.storeId }),
  });
  if (!res.ok) throw new Error(`app_info ${res.status}`);
  return (await res.json()) as AppInfo;
}

export const apkUrl = (path: string) =>
  `${appConfig.supabaseUrl}/storage/v1/object/public/store-media/${path}`;

export const loadShell = () => storefront.shell();
export const loadHome = () => storefront.home();
export const loadProduct = (slug: string) => storefront.product(slug);
export const loadPage = (slug: string) => storefront.page(slug);
export const listingReader: ListingReader = {
  products: (filters, sort, page) => storefront.products(filters, sort, page),
  facets: (filters) => storefront.facets(filters),
};
export const loadNewest = (limit: number) => storefront.products({}, "newest", 1, limit);
export const loadRelated = (categoryId: string) => storefront.products({ categoryId }, "newest", 1, 5);
