import "server-only";
import { getStoreGuard, getUserFromBearer } from "./auth";
import { HttpError } from "./http";
import { getServiceClient } from "./supabase";

// PRP-5 D16: a suspended store keeps its admin in read-only mode (see, export, pay); every write of its staff gets
// 403 store_suspended. The superadmin can still write (to fix things). The public endpoints (cart, checkout,
// customer account) are closed by the database already (store_is_public).

const STORE_WRITE =
  /^\/api\/v1\/stores\/([0-9a-f-]{36})\/(?!(?:cart|checkout|customer|customer-auth)(?:\/|$))/;

export async function assertStoreWritable(request: Request): Promise<void> {
  if (request.method === "GET" || request.method === "HEAD") return;
  const storeId = STORE_WRITE.exec(new URL(request.url).pathname)?.[1];
  if (!storeId) return;
  // With a signed-in user, the same query (and request memo) as requireStoreRole: one read for both (R11).
  const user = await getUserFromBearer(request).catch(() => null);
  const store = user
    ? await getStoreGuard(user, storeId).then((g) => ({ status: g.storeStatus, reason: g.suspendedReason }))
    : await getServiceClient()
        .from("stores")
        .select("status, suspended_reason")
        .eq("id", storeId)
        .maybeSingle<{ status: string; suspended_reason: string | null }>()
        .then(({ data }) => ({ status: data?.status ?? null, reason: data?.suspended_reason ?? null }));
  if (store.status !== "suspended") return;
  if (user?.isSuperadmin) return;
  throw new HttpError(
    403,
    "store_suspended",
    store.reason === "billing"
      ? "La tienda está suspendida por falta de pago: puedes consultar y exportar, pero no hacer cambios hasta pagar."
      : "La tienda está suspendida: puedes consultar y exportar, pero no hacer cambios. Escribe a soporte de Kshop.",
  );
}
