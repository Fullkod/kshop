"use client";

import { ApiError, type PlatformDomain } from "@kshop/data";
import { Alert, Button, Card } from "@kshop/ui";
import { useCallback, useEffect, useState } from "react";
import { DnsRecords, statusBadge } from "@/features/custom-domain/components/CustomDomainPage";
import { formatDate, storeUrl } from "@/lib/format";
import { useSession } from "@/lib/session";

// Every custom domain of the platform (PRP-6 D20): status, DNS records, check and remove. The owners ask for them
// from their admin; the superadmin helps when the DNS does not verify.

export default function SuperadminDomainsPage() {
  const { api } = useSession();
  const [data, setData] = useState<{ domains: PlatformDomain[]; mode: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(
    () => api.platform.domains().then(setData, () => setError("No se pudieron cargar los dominios.")),
    [api],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function run(id: string, action: () => Promise<unknown>) {
    setPending(id);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo completar la acción.");
    } finally {
      setPending(null);
    }
  }

  if (!data)
    return error ? (
      <Alert variant="destructive">{error}</Alert>
    ) : (
      <p className="text-muted-foreground">Cargando…</p>
    );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dominios propios</h1>
        <p className="text-sm text-muted-foreground">
          Los pide cada dueño desde su admin. Se sirven mientras estén verificados, la tienda activa y con el
          módulo «Dominio propio».
          {data.mode === "dry_run" && " Modo de prueba: sin token de Vercel, la conexión está simulada."}
        </p>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {data.domains.length === 0 ? (
        <p className="text-muted-foreground">Ninguna tienda tiene dominio propio todavía.</p>
      ) : (
        data.domains.map((d) => (
          <Card key={d.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{d.domain}</span>
                {statusBadge(d)}
                <a
                  href={storeUrl(d.storeSlug)}
                  target="_blank"
                  className="text-sm text-primary hover:underline"
                >
                  {d.storeName}
                </a>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending === d.id}
                  onClick={() => void run(d.id, () => api.platform.checkDomain(d.id))}
                >
                  Comprobar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending === d.id}
                  onClick={() =>
                    window.confirm(`¿Quitar ${d.domain} de ${d.storeName}?`) &&
                    void run(d.id, () => api.platform.removeDomain(d.id))
                  }
                >
                  Quitar
                </Button>
              </div>
            </div>
            {!d.verifiedAt && <DnsRecords domain={d} />}
            {d.lastError && <p className="text-xs text-destructive">Último error: {d.lastError}</p>}
            <p className="text-xs text-muted-foreground">
              Pedido el {formatDate(d.createdAt)}
              {d.checkedAt && ` · Comprobado el ${formatDate(d.checkedAt)}`}
            </p>
          </Card>
        ))
      )}
    </div>
  );
}
