"use client";

import { ApiError, type AppBuild, type PlatformAppsResponse } from "@kshop/data";
import { Alert, Badge, Button, Card } from "@kshop/ui";
import { useCallback, useEffect, useState } from "react";
import { formatApkSize } from "@/features/mobile-app/components/MobileAppPage";
import { formatDate, storeUrl } from "@/lib/format";
import { useSession } from "@/lib/session";

// Android apps of the platform (PRP-7 D11–D14). The owners ask in Admin › App móvil; the APK is built by the
// android-app workflow in GitHub Actions and `pnpm app:publish <slug>` uploads and registers it here unpublished;
// «Publicar» offers it on the store's /app page and to the installed apps («Actualizar»).

function Builds({
  builds,
  pending,
  onPublish,
}: {
  builds: AppBuild[];
  pending: string | null;
  onPublish: (build: AppBuild, published: boolean) => void;
}) {
  if (!builds.length) return <p className="text-sm text-muted-foreground">Sin versiones todavía.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-4 font-medium">Versión</th>
            <th className="py-1 pr-4 font-medium">Tamaño</th>
            <th className="py-1 pr-4 font-medium">Subida</th>
            <th className="py-1 pr-4 font-medium">Estado</th>
            <th className="py-1 font-medium" />
          </tr>
        </thead>
        <tbody>
          {builds.map((b) => (
            <tr key={b.id} className="border-t" data-testid={`build-${b.versionCode}`}>
              <td className="py-1 pr-4">
                <a href={b.url} className="text-primary hover:underline">
                  {b.versionName}
                </a>{" "}
                <span className="text-muted-foreground">({b.versionCode})</span>
              </td>
              <td className="py-1 pr-4">{formatApkSize(b.sizeBytes) ?? "—"}</td>
              <td className="py-1 pr-4">{formatDate(b.createdAt)}</td>
              <td className="py-1 pr-4">
                {b.published ? (
                  <Badge variant="success">Publicada</Badge>
                ) : (
                  <Badge variant="muted">Oculta</Badge>
                )}
              </td>
              <td className="py-1 text-right">
                <Button
                  size="sm"
                  variant={b.published ? "ghost" : "outline"}
                  disabled={pending === b.id}
                  onClick={() => onPublish(b, !b.published)}
                >
                  {b.published ? "Ocultar" : "Publicar"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SuperadminAppsPage() {
  const { api } = useSession();
  const [data, setData] = useState<PlatformAppsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(
    () => api.platform.apps().then(setData, () => setError("No se pudieron cargar las apps.")),
    [api],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function setPublished(build: AppBuild, published: boolean) {
    setPending(build.id);
    setError(null);
    try {
      await api.platform.setAppBuildPublished(build.id, published);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo completar la acción.");
    } finally {
      setPending(null);
    }
  }

  const onPublish = (build: AppBuild, published: boolean) => void setPublished(build, published);

  if (!data)
    return error ? (
      <Alert variant="destructive">{error}</Alert>
    ) : (
      <p className="text-muted-foreground">Cargando…</p>
    );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Apps</h1>
        <p className="text-sm text-muted-foreground">
          Para generar una app: workflow «Android app» en GitHub Actions con el slug de la tienda (o «admin»),
          luego <code>pnpm app:publish &lt;slug&gt;</code>. La versión llega aquí oculta: instálala, pruébala
          y publícala. Se ofrece en la página /app de la tienda mientras tenga el módulo «App móvil».
        </p>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}

      <Card className="flex flex-col gap-3" data-testid="apps-admin">
        <span className="font-semibold">Kshop Admin</span>
        <Builds builds={data.adminBuilds} pending={pending} onPublish={onPublish} />
      </Card>

      {data.stores.length === 0 ? (
        <p className="text-muted-foreground">Ninguna tienda tiene app ni la ha pedido todavía.</p>
      ) : (
        data.stores.map((s) => (
          <Card key={s.storeId} className="flex flex-col gap-3" data-testid={`apps-${s.storeSlug}`}>
            <div className="flex flex-wrap items-center gap-2">
              <a href={storeUrl(s.storeSlug)} target="_blank" className="font-semibold hover:underline">
                {s.storeName}
              </a>
              <span className="text-sm text-muted-foreground">{s.storeSlug}</span>
              {!s.moduleEnabled && <Badge variant="muted">Sin el módulo</Badge>}
              {s.storeStatus !== "active" && <Badge variant="destructive">{s.storeStatus}</Badge>}
              {s.requestedAt && <Badge>Pedida el {formatDate(s.requestedAt)}</Badge>}
            </div>
            <Builds builds={s.builds} pending={pending} onPublish={onPublish} />
          </Card>
        ))
      )}
    </div>
  );
}
