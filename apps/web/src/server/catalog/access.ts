import "server-only";
import type { ModuleCode, StoreRole } from "@kshop/core";
import { revalidateTag } from "next/cache";
import { getUserFromBearer, requireModule, requireStoreRole, type ApiUser } from "../auth";
import { uuidParam } from "../http";

export type CatalogContext = { user: ApiUser; storeId: string };

/** Common guard of every catalog write: valid store id, role in that store and enabled module. */
export async function requireCatalogAccess(
  request: Request,
  rawStoreId: string,
  minRole: StoreRole,
  module: ModuleCode = "catalog",
): Promise<CatalogContext> {
  const storeId = uuidParam.parse(rawStoreId);
  const user = await getUserFromBearer(request);
  await requireStoreRole(user, storeId, minRole);
  await requireModule(storeId, module);
  return { user, storeId };
}

export const catalogCacheTag = (storeId: string) => `store:${storeId}:catalog`;

/** The storefront caches catalog reads per store; any write expires them now (the next visit reads fresh data). */
export function invalidateCatalog(storeId: string): void {
  revalidateTag(catalogCacheTag(storeId), { expire: 0 });
}
