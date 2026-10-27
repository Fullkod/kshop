"use client";

import { Button, Label } from "@kshop/ui";
import { useStore } from "@kshop/storefront";
import { useState } from "react";
import { uploadCatalogImage } from "@/lib/images";
import { useSession } from "@/lib/session";

/**
 * Photo of a category or a collection, or a brand logo, inside an uncontrolled form: the file is compressed and
 * uploaded to store-media at once and its URL travels in a hidden input named `name` (empty = no image).
 */
export function ImageField({
  name,
  label,
  folder,
  defaultValue,
  hint,
}: {
  name: string;
  label: string;
  folder: "categories" | "collections" | "brands";
  defaultValue: string | null;
  hint?: string;
}) {
  const store = useStore();
  const { supabase } = useSession();
  const [url, setUrl] = useState(defaultValue ?? "");
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");

  async function upload(file: File | undefined) {
    if (!file) return;
    setState("uploading");
    try {
      setUrl(await uploadCatalogImage(supabase, store.id, folder, file));
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <Label htmlFor={`${name}-file`}>{label}</Label>
      <input type="hidden" name={name} value={url} />
      <div className="flex flex-wrap items-center gap-3">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element -- preview of the uploaded image
          <img src={url} alt="" className="size-20 rounded-md border object-cover" />
        )}
        <input
          id={`${name}-file`}
          type="file"
          accept="image/*"
          className="text-sm"
          onChange={(e) => upload(e.target.files?.[0])}
        />
        {url && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setUrl("")}>
            Quitar imagen
          </Button>
        )}
      </div>
      {state === "uploading" && <span className="text-xs text-muted-foreground">Subiendo…</span>}
      {state === "error" && <span className="text-xs text-destructive">No se pudo subir la imagen.</span>}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
