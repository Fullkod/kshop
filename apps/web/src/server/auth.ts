import "server-only";
import { hasMinRole, type ModuleCode, type StoreRole } from "@kshop/core";
import { cacheLife, cacheTag } from "next/cache";
import { forbidden, HttpError, unauthorized } from "./http";
import { getServiceClient } from "./supabase";

export type ApiUser = {
  id: string;
  email: string | null;
  isSuperadmin: boolean;
  accessToken: string;
  /** Customer tokens carry { kind: "customer", store_id } (one account per store). */
  appMetadata: Record<string, unknown>;
};

/** Validates `Authorization: Bearer <Supabase access token>` (web and mobile apps; no cookies). */
export async function getUserFromBearer(request: Request): Promise<ApiUser> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw unauthorized();

  const accessToken = match[1].trim();
  const { data, error } = await getServiceClient().auth.getUser(accessToken);
  if (error || !data.user) throw unauthorized();

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    isSuperadmin: data.user.app_metadata?.role === "superadmin",
    accessToken,
    appMetadata: data.user.app_metadata ?? {},
  };
}

export async function requireSuperadmin(request: Request): Promise<ApiUser> {
  const user = await getUserFromBearer(request);
  if (!user.isSuperadmin) throw forbidden();
  return user;
}

/** Role of the user in the store, or null. */
export async function getStoreRole(userId: string, storeId: string): Promise<StoreRole | null> {
  const { data, error } = await getServiceClient()
    .from("store_members")
    .select("role")
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .maybeSingle<{ role: StoreRole }>();
  if (error) throw error;
  return data?.role ?? null;
}

/** The superadmin can act on every store; anyone else needs at least `minRole` in that store. */
export async function requireStoreRole(
  user: ApiUser,
  storeId: string,
  minRole: StoreRole,
): Promise<StoreRole | null> {
  const role = await getStoreRole(user.id, storeId);
  if (user.isSuperadmin) return role;
  if (!role || !hasMinRole(role, minRole)) throw forbidden();
  return role;
}

export const entitlementsCacheTag = (storeId: string) => `entitlements:${storeId}`;

/**
 * Active modules of a store, cached per store (R10): requireModule ran store_entitlements on every API call
 * (14 modules × store_has_module, ~5 ms). Plan, add-on, grant and status changes expire the tag
 * (expireStoreCaches); the daily suspension from the database shows within about a minute, like the cached store.
 * The database keeps its own check (private.store_has_module) on every critical write.
 */
async function getStoreModules(storeId: string): Promise<string[]> {
  "use cache";
  cacheTag(entitlementsCacheTag(storeId));
  cacheLife("minutes");
  const { data, error } = await getServiceClient().rpc("store_entitlements", { p_store_id: storeId });
  if (error) throw error;
  return ((data ?? []) as { module_code: string }[]).map((m) => m.module_code);
}

/** Whether the store has an active module (service role: no membership needed). */
export async function hasModule(storeId: string, code: ModuleCode): Promise<boolean> {
  return (await getStoreModules(storeId)).includes(code);
}

/** API layer of the module check (UI uses entitlements, the database uses private.store_has_module). */
export async function requireModule(storeId: string, code: ModuleCode): Promise<void> {
  if (!(await hasModule(storeId, code))) {
    throw new HttpError(403, "module_not_enabled", "Esta función no está incluida en el plan de la tienda.");
  }
}
