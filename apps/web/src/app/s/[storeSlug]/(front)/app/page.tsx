import { buttonVariants } from "@kshop/ui";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { getPublicStoreApp } from "@/server/app-builds";
import { requireStore, storeMetadata, storeUrl } from "@/server/storefront/page-helpers";

type Props = PageProps<"/s/[storeSlug]/app">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = await requireStore(params);
  return storeMetadata(store, {
    title: "App para Android",
    description: `Descarga la app de ${store.name} para Android.`,
    path: "/app",
  });
}

const formatSize = (bytes: number | null) =>
  bytes ? `${(bytes / 1024 / 1024).toLocaleString("es", { maximumFractionDigits: 1 })} MB` : null;

// The store's Android app (PRP-7 D13): direct APK download while the store has mobile_app (D15), with a QR to open
// this page on the phone and how to install an APK.
export default async function AppPage({ params }: Props) {
  const store = await requireStore(params);
  const build = await getPublicStoreApp(store.id, store.slug);
  const pageUrl = `${storeUrl(store)}/app`;
  const qr = await QRCode.toString(pageUrl, { type: "svg", margin: 1 });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <h1 className="sf-heading text-3xl font-semibold">App de {store.name} para Android</h1>
      {!build ? (
        <p className="text-muted-foreground" data-testid="app-unavailable">
          Esta tienda todavía no tiene app. Puedes comprar desde esta web en tu teléfono.
        </p>
      ) : (
        <>
          <p className="text-muted-foreground">
            Compra más rápido desde tu teléfono: el catálogo se abre aunque tengas poca conexión y tus pedidos
            siguen llegando a la tienda por WhatsApp.
          </p>
          <div className="flex flex-col items-start gap-2">
            <a
              href={build.url}
              download
              className={buttonVariants({ size: "lg" })}
              data-testid="app-download"
            >
              Descargar para Android
            </a>
            <p className="text-sm text-muted-foreground">
              Versión {build.versionName}
              {formatSize(build.sizeBytes) && ` · ${formatSize(build.sizeBytes)}`}
            </p>
          </div>
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Cómo instalarla</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Pulsa «Descargar para Android» y espera a que termine la descarga.</li>
              <li>Abre el archivo descargado (en las notificaciones o en la carpeta Descargas).</li>
              <li>
                Si el teléfono lo pide, permite «Instalar apps desconocidas» para tu navegador o tu gestor de
                archivos.
              </li>
              <li>Pulsa «Instalar» y abre la app.</li>
            </ol>
            <p className="text-sm text-muted-foreground">
              Cuando haya una versión nueva, la app te avisará para actualizarla.
            </p>
          </section>
        </>
      )}
      <section className="flex flex-col items-start gap-2">
        <h2 className="text-lg font-semibold">¿Estás en el ordenador?</h2>
        <p className="text-sm text-muted-foreground">
          Escanea este código con tu teléfono para abrir esta página.
        </p>
        <div
          className="size-40 rounded-md bg-white p-2 [&>svg]:size-full"
          aria-label={`Código QR de ${pageUrl}`}
          role="img"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      </section>
    </div>
  );
}
