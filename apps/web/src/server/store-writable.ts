import "server-only";
import { MANAGED_SECTION_MESSAGE } from "@kshop/core";
import { getStoreGuard, getUserFromBearer, type StoreGuard } from "./auth";
import { HttpError } from "./http";
import { sectionOfWrite } from "./section-guard";
import { getServiceClient } from "./supabase";

// PRP-5 D16: a suspended store keeps its admin in read-only mode (see, export, pay); every write of its staff gets
// 403 store_suspended. The superadmin can still write (to fix things). The public endpoints (cart, checkout,
// customer account) are closed by the database already (store_is_public). The staff password reset stays open: the
// owner of a suspended store must be able to sign in to pay.
//
// R12: a section the superadmin set to managed or hidden is read-only for the staff too (403 section_managed /
// section_hidden); its data comes in the same api_guard call, so the check adds no query.

const STORE_WRITE =
  /^\/api\/v1\/stores\/([0-9a-f-]{36})\/(?!(?:cart|checkout|customer|customer-auth|staff-auth)(?:\/|$))(.*)$/;

export async function assertStoreWritable(request: Request): Promise<void> {
  if (request.method === "GET" || request.method === "HEAD") return;
  const match = STORE_WRITE.exec(new URL(request.url).pathname);
  if (!match) return;
  const storeId = match[1]!;
  const path = match[2] ?? "";
  // With a signed-in user, the same query (and request memo) as requireStoreRole: one read for both (R11).
  const user = await getUserFromBearer(request).catch(() => null);
  if (user?.isSuperadmin) return;
  const guard: StoreGuard = user
    ? await getStoreGuard(user, storeId)
    : await getServiceClient()
        .from("stores")
        .select("status, suspended_reason")
        .eq("id", storeId)
        .maybeSingle<{ status: string; suspended_reason: string | null }>()
        .then(({ data }) => ({
          role: null,
          storeStatus: data?.status ?? null,
          suspendedReason: data?.suspended_reason ?? null,
        }));

  if (guard.storeStatus === "suspended") {
    throw new HttpError(
      403,
      "store_suspended",
      guard.suspendedReason === "billing"
        ? "La tienda está suspendida por falta de pago: puedes consultar y exportar, pero no hacer cambios hasta pagar."
        : "La tienda está suspendida: puedes consultar y exportar, pero no hacer cambios. Escribe a soporte de Kshop.",
    );
  }

  const section = sectionOfWrite(path);
  const visibility = section ? guard.sections?.[section] : undefined;
  if (visibility === "managed") throw new HttpError(403, "section_managed", MANAGED_SECTION_MESSAGE);
  if (visibility === "hidden") {
    throw new HttpError(403, "section_hidden", "Esta sección no está disponible para tu tienda.");
  }
}
