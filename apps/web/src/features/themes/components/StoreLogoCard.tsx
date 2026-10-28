"use client";

import { Alert, Button, Card, Label } from "@kshop/ui";
import { useStore } from "@kshop/storefront";
import { useState } from "react";
import { useApiAction } from "@/features/catalog/use-catalog";
import { uploadCatalogImage } from "@/lib/images";
import { useSession } from "@/lib/session";

/**
 * Store logo: the storefront header shows it instead of the name, and the Android app uses it as its icon.
 * The file is compressed and uploaded to store-media at once; «Guardar logo» stores its URL.
 */
export function StoreLogoCard({
  initial,
  save,
}: {
  initial: string | null;
  save: (logoUrl: string | null) => Promise<unknown>;
}) {
  const store = useStore();
  const { supabase } = useSession();
  const action = useApiAction();
  const [url, setUrl] = useState(initial ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed = url !== (initial ?? "");

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setSaved(false);
    try {
      setUrl(await uploadCatalogImage(supabase, store.id, "logo", file));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 lg:max-w-[calc(100%-23.5rem)]">
      <h2 className="font-semibold">Logo de la tienda</h2>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-40 items-center justify-center rounded-md border bg-surface px-3">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview of the uploaded logo
            <img src={url} alt="Logo" className="max-h-12 max-w-full object-contain" />
          ) : (
            <span className="truncate text-sm font-semibold">{store.name}</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="store-logo-file">Imagen</Label>
          <input
            id="store-logo-file"
            type="file"
            accept="image/*"
            className="text-sm"
            disabled={uploading}
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Se muestra en la cabecera de la tienda en lugar del nombre y es el icono de la app de Android. Mejor un PNG
        con fondo transparente; si es cuadrado, también sirve para la app.
      </p>
      {uploading && <p className="text-sm text-muted-foreground">Subiendo…</p>}
      {(uploadError ?? action.error) && <Alert variant="destructive">{uploadError ?? action.error}</Alert>}
      {saved && <Alert variant="success">Logo guardado.</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={action.pending || uploading || !changed}
          onClick={async () => {
            if (await action.run(() => save(url || null))) setSaved(true);
          }}
        >
          {action.pending ? "Guardando…" : "Guardar logo"}
        </Button>
        {url && (
          <Button
            variant="ghost"
            disabled={action.pending || uploading}
            onClick={() => {
              setUrl("");
              setSaved(false);
            }}
          >
            Quitar logo
          </Button>
        )}
      </div>
    </Card>
  );
}
