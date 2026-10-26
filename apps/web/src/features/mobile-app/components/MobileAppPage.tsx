"use client";

import { storePublicOrigin } from "@kshop/core";
import { ApiError, type AppBuild, type MobileAppResponse } from "@kshop/data";
import { useStore } from "@kshop/storefront";
import { Alert, Badge, Button, buttonVariants, Card } from "@kshop/ui";
import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/app/s/[storeSlug]/admin/admin-context";
import { platformProtocol, publicEnv } from "@/env";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { QrCode } from "./QrCode";

export const formatApkSize = (bytes: number | null) =>
  bytes ? `${(bytes / 1024 / 1024).toLocaleString("es", { maximumFractionDigits: 1 })} MB` : null;

function BuildLine({ build }: { build: AppBuild }) {
  return (
    <p className="text-sm text-muted-foreground">
      Versión {build.versionName}
      {formatApkSize(build.sizeBytes) && ` · ${formatApkSize(build.sizeBytes)}`} · publicada el{" "}
      {formatDate(build.createdAt)}
    </p>
  );
}

// Admin › App móvil (module mobile_app, PRP-7 D13–D14): the owner asks for the store's Android app; Kshop generates
// it (icon from the store logo) and, once published, the owner shares the /app page with their customers.
export function MobileAppPage() {
  const store = useStore();
  const admin = useAdmin();
  const { api } = useSession();
  const [data, setData] = useState<MobileAppResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(
    () =>
      api
        .mobileApp(store.id)
        .get()
        .then(setData, (e: unknown) =>
          setError(e instanceof ApiError ? e.message : "No se pudo cargar la app."),
        ),
    [api, store.id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function onRequest() {
    setPending(true);
    setError(null);
    try {
      setData(await api.mobileApp(store.id).request());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo pedir la app.");
    } finally {
      setPending(false);
    }
  }

  if (admin.role === "staff") {
    return <Alert variant="destructive">Solo el dueño y los administradores gestionan la app.</Alert>;
  }
  if (!data)
    return error ? (
      <Alert variant="destructive">{error}</Alert>
    ) : (
      <p className="text-muted-foreground">Cargando…</p>
    );

  const pageUrl = `${storePublicOrigin(store, publicEnv.platformDomain, platformProtocol)}/app`;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">App móvil</h1>
        <p className="text-sm text-muted-foreground">
          Tu tienda como app de Android, con tu nombre y tu logo: tus clientes la descargan desde tu tienda,
          compran aunque tengan poca conexión y los pedidos te llegan igual que desde la web.
        </p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <Card className="flex flex-col gap-4" data-testid="store-app">
        {data.latest ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">{store.name} para Android</span>
              <Badge variant="success">Publicada</Badge>
            </div>
            <BuildLine build={data.latest} />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <QrCode value={pageUrl} />
              <div className="flex flex-col gap-2 text-sm">
                <p>Comparte esta página con tus clientes (por WhatsApp, en tus redes o impresa con el QR):</p>
                <a href={pageUrl} target="_blank" className="break-all text-primary hover:underline">
                  {pageUrl}
                </a>
                <p className="text-muted-foreground">
                  Los clientes con Android también ven un aviso discreto en tu tienda para descargarla.
                </p>
              </div>
            </div>
            {data.requestedAt && (
              <p className="text-sm text-muted-foreground">
                Pediste una nueva versión el {formatDate(data.requestedAt)}.
              </p>
            )}
          </>
        ) : data.requestedAt ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">{store.name} para Android</span>
              <Badge>Pedida</Badge>
            </div>
            <p className="text-sm">
              La pediste el {formatDate(data.requestedAt)}. Kshop la está preparando; cuando esté publicada
              aparecerá aquí con el enlace para tus clientes.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm">
              La app lleva el nombre de tu tienda y tu logo como icono (si no hay logo o es alargado, la
              inicial de la tienda sobre su color). Pídela y Kshop la prepara; cuando esté publicada verás
              aquí el enlace para tus clientes.
            </p>
            <div>
              <Button onClick={() => void onRequest()} disabled={pending} data-testid="request-app">
                Pedir mi app
              </Button>
            </div>
          </>
        )}
      </Card>

      {data.adminApp && (
        <Card className="flex flex-col gap-2" data-testid="admin-app">
          <span className="text-lg font-semibold">Kshop Admin para tu teléfono</span>
          <p className="text-sm text-muted-foreground">
            Para ti y tu equipo: pedidos, ventas de hoy, stock, precios y fotos desde el móvil.
          </p>
          <BuildLine build={data.adminApp} />
          <div>
            <a href={data.adminApp.url} download className={buttonVariants({ variant: "outline" })}>
              Descargar Kshop Admin
            </a>
          </div>
        </Card>
      )}
    </div>
  );
}
