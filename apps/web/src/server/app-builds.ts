import "server-only";
import type { AppBuild, MobileAppResponse, PlatformAppsResponse } from "@kshop/data";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { supabaseConfig } from "@/env";
import { hasModule } from "./auth";
import { notFound } from "./http";
import { storeCacheTag } from "./stores";
import { getServiceClient } from "./supabase";

// Phase 7.4 (PRP-7 D13, D14): `pnpm app:publish` uploads an APK to the store-apps bucket and registers it
// unpublished; the superadmin publishes it in Superadmin › Apps. The owner asks for their app in Admin › App móvil
// and the store's /app page offers the latest published build while the store has mobile_app (D15).

const COLUMNS =
  "id, store_id, app_id, version_code, version_name, apk_path, size_bytes, published, notes, created_at";

type BuildRow = {
  id: string;
  store_id: string | null;
  app_id: string;
  version_code: number;
  version_name: string;
  apk_path: string;
  size_bytes: number | null;
  published: boolean;
  notes: string | null;
  created_at: string;
};

/** Only the /app page and the Android banner: publishing a build does not expire the whole store card. */
const storeAppCacheTag = (slug: string) => `${storeCacheTag(slug)}:app`;

export const apkUrl = (path: string) => `${supabaseConfig.url}/storage/v1/object/public/store-apps/${path}`;

const toBuild = (row: BuildRow): AppBuild => ({
  id: row.id,
  appId: row.app_id,
  versionCode: row.version_code,
  versionName: row.version_name,
  url: apkUrl(row.apk_path),
  sizeBytes: row.size_bytes,
  published: row.published,
  notes: row.notes,
  createdAt: row.created_at,
});

async function latestPublished(storeId: string | null): Promise<AppBuild | null> {
  let query = getServiceClient().from("store_app_builds").select(COLUMNS).eq("published", true);
  query = storeId ? query.eq("store_id", storeId) : query.is("store_id", null);
  const { data, error } = await query
    .order("version_code", { ascending: false })
    .limit(1)
    .maybeSingle<BuildRow>();
  if (error) throw error;
  return data ? toBuild(data) : null;
}

/** Admin › App móvil: the owner's request, the latest published store app and the admin app. */
export async function getMobileApp(storeId: string): Promise<MobileAppResponse> {
  const [request, latest, adminApp] = await Promise.all([
    getServiceClient()
      .from("store_app_requests")
      .select("requested_at")
      .eq("store_id", storeId)
      .maybeSingle<{ requested_at: string }>(),
    latestPublished(storeId),
    latestPublished(null),
  ]);
  if (request.error) throw request.error;
  return { requestedAt: request.data?.requested_at ?? null, latest, adminApp };
}

export async function requestMobileApp(storeId: string, userId: string): Promise<void> {
  const { error } = await getServiceClient()
    .from("store_app_requests")
    .upsert({ store_id: storeId, requested_by: userId }, { onConflict: "store_id", ignoreDuplicates: true });
  if (error) throw error;
}

/** The store's /app page (public): the latest published build while the app is available (D15). */
export async function getPublicStoreApp(storeId: string, slug: string): Promise<AppBuild | null> {
  "use cache";
  cacheTag(storeAppCacheTag(slug));
  cacheLife("minutes");
  const { data, error } = await getServiceClient().rpc("app_info", { p_store_id: storeId });
  if (error) throw error;
  const info = data as { available: boolean; latest: { version_code: number } | null };
  return info.available && info.latest ? latestPublished(storeId) : null;
}

/** Superadmin › Apps: stores with the app available, asked for or built, and the admin app's builds. */
export async function listPlatformApps(): Promise<PlatformAppsResponse> {
  const db = getServiceClient();
  const [stores, requests, builds] = await Promise.all([
    db.from("stores").select("id, name, slug, status").neq("status", "archived").order("name"),
    db.from("store_app_requests").select("store_id, requested_at"),
    db.from("store_app_builds").select(COLUMNS).order("version_code", { ascending: false }),
  ]);
  if (stores.error) throw stores.error;
  if (requests.error) throw requests.error;
  if (builds.error) throw builds.error;
  const rows = builds.data as BuildRow[];
  const requested = new Map(requests.data.map((r) => [r.store_id as string, r.requested_at as string]));

  const list = await Promise.all(
    (stores.data as { id: string; name: string; slug: string; status: string }[]).map(async (s) => ({
      storeId: s.id,
      storeName: s.name,
      storeSlug: s.slug,
      storeStatus: s.status,
      moduleEnabled: await hasModule(s.id, "mobile_app"),
      requestedAt: requested.get(s.id) ?? null,
      builds: rows.filter((b) => b.store_id === s.id).map(toBuild),
    })),
  );
  return {
    stores: list.filter((s) => s.moduleEnabled || s.requestedAt || s.builds.length),
    adminBuilds: rows.filter((b) => b.store_id === null).map(toBuild),
  };
}

/** Publish or hide a build; publishing a store build answers that store's request. */
export async function setAppBuildPublished(id: string, published: boolean): Promise<void> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("store_app_builds")
    .update({ published })
    .eq("id", id)
    .select("store_id, stores (slug)")
    .maybeSingle<{ store_id: string | null; stores: { slug: string } | null }>();
  if (error) throw error;
  if (!data) throw notFound("Versión");
  if (data.store_id && data.stores) {
    if (published) {
      const { error: requestError } = await db
        .from("store_app_requests")
        .delete()
        .eq("store_id", data.store_id);
      if (requestError) throw requestError;
    }
    // Stale-while-revalidate: the next visit refreshes it; publishing an app does not need to be instant, and an
    // expired entry would block the storefront render.
    revalidateTag(storeAppCacheTag(data.stores.slug), "max");
  }
}
