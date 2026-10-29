import "server-only";
import { hasMinRole, type ModuleCode, type SectionSettings, type StoreRole } from "@kshop/core";
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

// One verification per request: the store-writable guard and the route handler share it (R11).
const requestUsers = new WeakMap<Request, Promise<ApiUser>>();

/**
 * Validates `Authorization: Bearer <Supabase access token>` (web and mobile apps; no cookies). The JWT is verified
 * locally (getClaims: ES256 signature against the project's JWKS, cached in the instance) instead of a GoTrue call
 * per request (R11, decision D3 of Roberto): a user banned or deleted in Auth keeps access until the token expires
 * (≤ 1 h). Store membership is still checked on every call (requireStoreRole), and a superadmin token is always
 * confirmed with GoTrue.
 */
export function getUserFromBearer(request: Request): Promise<ApiUser> {
  let user = requestUsers.get(request);
  if (!user) {
    user = verifyBearer(request);
    requestUsers.set(request, user);
  }
  return user;
}

async function verifyBearer(request: Request): Promise<ApiUser> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw unauthorized();

  const accessToken = match[1].trim();
  const { data: verified, error: claimsError } = await getServiceClient().auth.getClaims(accessToken);
  const claims = verified?.claims;
  if (claimsError || !claims?.sub) throw unauthorized();
  const appMetadata = (claims.app_metadata ?? {}) as Record<string, unknown>;
  if (appMetadata.role !== "superadmin") {
    return {
      id: claims.sub,
      email: typeof claims.email === "string" && claims.email ? claims.email : null,
      isSuperadmin: false,
      accessToken,
      appMetadata,
    };
  }

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

export type StoreGuard = {
  role: StoreRole | null;
  storeStatus: string | null;
  suspendedReason: string | null;
  /** R12: sections of the admin menu that are not visible (no entry = visible). */
  sections?: SectionSettings;
};

const requestGuards = new WeakMap<ApiUser, Map<string, Promise<StoreGuard>>>();

/**
 * Role of the user in the store and the store's status, in one query (public.api_guard), once per request: the
 * store-writable check and requireStoreRole used to read store_members and stores one after the other (R11).
 */
export function getStoreGuard(user: ApiUser, storeId: string): Promise<StoreGuard> {
  let byStore = requestGuards.get(user);
  if (!byStore) requestGuards.set(user, (byStore = new Map()));
  let guard = byStore.get(storeId);
  if (!guard) {
    guard = (async () => {
      const { data, error } = await getServiceClient().rpc("api_guard", {
        p_user_id: user.id,
        p_store_id: storeId,
      });
      if (error) throw error;
      return (data ?? { role: null, storeStatus: null, suspendedReason: null }) as StoreGuard;
    })();
    byStore.set(storeId, guard);
  }
  return guard;
}

/** The superadmin can act on every store; anyone else needs at least `minRole` in that store. */
export async function requireStoreRole(
  user: ApiUser,
  storeId: string,
  minRole: StoreRole,
): Promise<StoreRole | null> {
  const { role } = await getStoreGuard(user, storeId);
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
