import { storeOrigin, type StoreStatus } from "@kshop/core";
import { platformProtocol, publicEnv } from "@/env";

export const STORE_STATUS_LABELS: Record<StoreStatus, string> = {
  active: "Activa",
  suspended: "Suspendida",
  archived: "Archivada",
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  trialing: "En prueba",
  active: "Al día",
  past_due: "Pago pendiente",
  suspended: "Suspendida",
  cancelled: "Cancelada",
  comped: "Cortesía",
};

/** Store URL in the current environment (local: http://slug.kshop.localhost:3000). */
export function storeUrl(slug: string): string {
  return storeOrigin(slug, publicEnv.platformDomain, platformProtocol);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}
