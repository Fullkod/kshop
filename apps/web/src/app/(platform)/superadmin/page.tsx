"use client";

import type { StoreStatus } from "@kshop/core";
import { ApiError, type PlatformStore } from "@kshop/data";
import { Alert, Badge, Button, buttonVariants, Card } from "@kshop/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate, STORE_STATUS_LABELS, storeUrl, SUBSCRIPTION_STATUS_LABELS } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function SuperadminStoresPage() {
  const { api } = useSession();
  const [stores, setStores] = useState<PlatformStore[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.platform
      .listStores()
      .then(({ stores: list }) => !cancelled && setStores(list))
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "No se pudieron cargar las tiendas.");
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function setStatus(store: PlatformStore, status: StoreStatus) {
    setBusyId(store.id);
    setError(null);
    try {
      const { store: updated } = await api.platform.updateStoreStatus(store.id, status);
      setStores((current) => current?.map((s) => (s.id === updated.id ? updated : s)) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cambiar el estado.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tiendas</h1>
          <p className="text-sm text-muted-foreground">
            Alta, plan y estado de cada tienda de la plataforma.
          </p>
        </div>
        <Link href="/superadmin/stores/new" className={buttonVariants()}>
          Nueva tienda
        </Link>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {stores === null && !error && <p className="text-muted-foreground">Cargando…</p>}

      {stores?.length === 0 && (
        <Card className="text-center text-muted-foreground">Todavía no hay tiendas. Crea la primera.</Card>
      )}

      {stores && stores.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-surface text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Tienda</th>
                <th className="px-4 py-3 font-medium">Dueño</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Alta</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr key={store.id} className="border-b last:border-0" data-testid={`store-row-${store.slug}`}>
                  <td className="px-4 py-3">
                    <Link href={`/superadmin/stores/${store.id}`} className="font-medium hover:underline">
                      {store.name}
                    </Link>
                    <a
                      href={storeUrl(store.slug)}
                      className="text-xs text-primary hover:underline"
                      target="_blank"
                    >
                      {store.primaryDomain ?? store.slug}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{store.owner?.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div>{store.plan?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {store.subscriptionStatus ? SUBSCRIPTION_STATUS_LABELS[store.subscriptionStatus] : ""}
                      {store.subscriptionStatus === "trialing" && ` hasta ${formatDate(store.trialEndsAt)}`}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={store.status === "active" ? "success" : "destructive"}>
                      {STORE_STATUS_LABELS[store.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(store.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {store.status === "active" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === store.id}
                        onClick={() => setStatus(store, "suspended")}
                      >
                        Suspender
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === store.id}
                        onClick={() => setStatus(store, "active")}
                      >
                        Activar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
