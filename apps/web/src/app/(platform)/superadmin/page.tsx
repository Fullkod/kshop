"use client";

import { formatUsd, type StoreStatus } from "@kshop/core";
import { useRealtimeVersion } from "@kshop/admin";
import { ApiError, type PlatformInvoice, type PlatformStore } from "@kshop/data";
import {
  Alert,
  Badge,
  Button,
  Card,
  CircleCheck,
  Clock,
  type LucideIcon,
  CirclePause,
  Receipt,
} from "@kshop/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate, STORE_STATUS_LABELS, storeUrl, SUBSCRIPTION_STATUS_LABELS } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function SuperadminStoresPage() {
  const { api } = useSession();
  const [stores, setStores] = useState<PlatformStore[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [owed, setOwed] = useState<PlatformInvoice[] | null>(null);
  // New stores, status changes and payments show on their own (Realtime).
  const live = useRealtimeVersion("platform");

  useEffect(() => {
    let cancelled = false;
    api.platform
      .listStores()
      .then(({ stores: list }) => !cancelled && setStores(list))
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "No se pudieron cargar las tiendas.");
      });
    api.platform.invoices("open").then(
      (r) => !cancelled && setOwed(r.invoices),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [api, live]);

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
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {stores && stores.length > 0 && (
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4" data-testid="superadmin-kpis">
          <Kpi
            icon={CircleCheck}
            label="Activas"
            value={stores.filter((s) => s.status === "active").length}
            filled
          />
          <Kpi
            icon={Clock}
            label="En prueba"
            value={stores.filter((s) => s.subscriptionStatus === "trialing").length}
          />
          <Kpi
            icon={CirclePause}
            label="Suspendidas"
            value={stores.filter((s) => s.status === "suspended").length}
          />
          <Kpi
            icon={Receipt}
            label="Por cobrar"
            value={
              owed === null ? "…" : formatUsd(owed.reduce((sum, i) => sum + (i.total - i.amountPaid), 0))
            }
            hint={owed?.length ? `${owed.length} ${owed.length === 1 ? "factura" : "facturas"}` : undefined}
          />
        </div>
      )}

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
                    <div className="flex items-center gap-3">
                      <span className="font-display flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft font-extrabold text-primary">
                        {store.name[0]?.toUpperCase()}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <Link
                          href={`/superadmin/stores/${store.id}`}
                          className="font-semibold hover:underline"
                        >
                          {store.name}
                        </Link>
                        <a
                          href={storeUrl(store.slug)}
                          className="text-xs text-primary hover:underline"
                          target="_blank"
                        >
                          {store.primaryDomain ?? store.slug}
                        </a>
                      </span>
                    </div>
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

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  filled = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  hint?: string;
  filled?: boolean;
}) {
  return (
    <Card
      className={`flex flex-col gap-2.5 rounded-[14px] p-[18px] ${filled ? "border-primary bg-primary text-primary-foreground" : ""}`}
    >
      <span
        className={`flex items-center justify-between text-[13px] ${filled ? "" : "text-muted-foreground"}`}
      >
        {label}
        <Icon size={17} aria-hidden />
      </span>
      <span className="font-display text-[28px] leading-none font-extrabold">{value}</span>
      {hint && (
        <span className={`text-[12.5px] font-semibold ${filled ? "" : "text-muted-foreground"}`}>{hint}</span>
      )}
    </Card>
  );
}
