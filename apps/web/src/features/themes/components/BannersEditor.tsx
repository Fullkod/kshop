"use client";

import type { BannerInput, Link } from "@kshop/core";
import type { ApiClient } from "@kshop/data";
import { Alert, Badge, Button, Card, Input, Label } from "@kshop/ui";
import { useState } from "react";
import { useApiAction, type CatalogStructure } from "@/features/catalog/use-catalog";
import { uploadBannerImage } from "@/lib/images";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";
import { fromLocalInput, toLocalInput, type AdminBanner, type AdminContent } from "../use-content";
import { LinkPicker } from "./LinkPicker";

type Draft = Omit<AdminBanner, "id"> & { id?: string };
const empty: Draft = {
  title: "",
  subtitle: "",
  ctaLabel: "",
  imageUrl: "",
  imageMobileUrl: null,
  alt: "",
  link: null,
  isVisible: true,
  startsAt: null,
  endsAt: null,
};

export function BannersEditor({
  content,
  structure,
  api,
  reload,
}: {
  content: AdminContent;
  structure: CatalogStructure;
  api: ReturnType<ApiClient["content"]>;
  reload: () => void;
}) {
  const store = useStore();
  const { supabase } = useSession();
  const action = useApiAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState<"imageUrl" | "imageMobileUrl" | null>(null);

  async function upload(field: "imageUrl" | "imageMobileUrl", file: File | undefined) {
    if (!file || !draft) return;
    setUploading(field);
    try {
      const url = await action.run(() => uploadBannerImage(supabase, store.id, file));
      if (url) setDraft((d) => (d ? { ...d, [field]: url } : d));
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    if (!draft) return;
    const input: BannerInput = {
      title: draft.title || null,
      subtitle: draft.subtitle || null,
      ctaLabel: draft.ctaLabel || null,
      imageUrl: draft.imageUrl,
      imageMobileUrl: draft.imageMobileUrl,
      alt: draft.alt || null,
      link: draft.link,
      isVisible: draft.isVisible,
      startsAt: draft.startsAt,
      endsAt: draft.endsAt,
    };
    const ok = await action.run(() =>
      draft.id ? api.update("banners", draft.id, input) : api.create("banners", input),
    );
    if (ok) {
      setDraft(null);
      reload();
    }
  }

  async function move(index: number, delta: number) {
    const ids = content.banners.map((b) => b.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    if ((await action.run(() => api.reorder("banners", ids))) !== undefined) reload();
  }

  async function remove(banner: AdminBanner) {
    if (!window.confirm(`¿Borrar el banner «${banner.title || banner.alt || "sin título"}»?`)) return;
    if ((await action.run(() => api.remove("banners", banner.id))) !== undefined) reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Imágenes grandes con texto y enlace. Se usan en las secciones «Carrusel de portada» y «Banner».
          Puedes programar cuándo se ven.
        </p>
        <Button onClick={() => setDraft({ ...empty })}>Nuevo banner</Button>
      </div>
      {action.error && <Alert variant="destructive">{action.error}</Alert>}

      {draft && (
        <Card className="grid gap-4 sm:grid-cols-2" data-testid="banner-form">
          <h3 className="font-semibold sm:col-span-2">{draft.id ? "Editar banner" : "Nuevo banner"}</h3>
          {(["imageUrl", "imageMobileUrl"] as const).map((field) => (
            <div key={field} className="flex flex-col gap-2">
              <Label htmlFor={field}>
                {field === "imageUrl"
                  ? "Imagen (ancha, para ordenador)"
                  : "Imagen para móvil (opcional, vertical)"}
              </Label>
              {draft[field] && (
                // eslint-disable-next-line @next/next/no-img-element -- preview of the uploaded banner
                <img
                  src={draft[field]!}
                  alt=""
                  className="aspect-[21/9] w-full rounded-md border object-cover"
                />
              )}
              <input
                id={field}
                type="file"
                accept="image/*"
                className="text-sm"
                onChange={(e) => upload(field, e.target.files?.[0])}
              />
              {uploading === field && <span className="text-xs text-muted-foreground">Subiendo…</span>}
            </div>
          ))}
          {(
            [
              ["title", "Título (opcional)"],
              ["subtitle", "Subtítulo (opcional)"],
              ["ctaLabel", "Texto del botón (opcional)"],
              ["alt", "Descripción de la imagen (para lectores de pantalla)"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1">
              <Label htmlFor={`banner-${key}`}>{label}</Label>
              <Input
                id={`banner-${key}`}
                value={draft[key] ?? ""}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <LinkPicker
              id="banner-link"
              value={draft.link}
              onChange={(link: Link | null) => setDraft({ ...draft, link })}
              structure={structure}
              content={content}
              optional
            />
          </div>
          <Schedule draft={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
          <div className="flex gap-2 sm:col-span-2">
            <Button onClick={save} disabled={action.pending || !draft.imageUrl || uploading !== null}>
              {action.pending ? "Guardando…" : "Guardar"}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {content.banners.length === 0 ? (
        <Card className="text-center text-muted-foreground">Todavía no hay banners.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y">
            {content.banners.map((b, i) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- banner thumbnail */}
                <img src={b.imageUrl} alt="" className="h-12 w-24 rounded border object-cover" />
                <span className="flex-1 font-medium">{b.title || b.alt || "Sin título"}</span>
                <ScheduleBadges item={b} />
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label="Subir"
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={i === content.banners.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Bajar"
                  >
                    ↓
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDraft({ ...b })}>
                    Editar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(b)}>
                    Borrar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Visible flag + optional date window, shared by banners and sections. */
export function Schedule({
  draft,
  onChange,
}: {
  draft: { isVisible: boolean; startsAt: string | null; endsAt: string | null };
  onChange: (patch: { isVisible?: boolean; startsAt?: string | null; endsAt?: string | null }) => void;
}) {
  return (
    <>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={draft.isVisible}
          onChange={(e) => onChange({ isVisible: e.target.checked })}
        />
        Visible en la tienda
      </label>
      <div className="flex flex-col gap-1">
        <Label htmlFor="starts-at">Desde (opcional)</Label>
        <Input
          id="starts-at"
          type="datetime-local"
          value={toLocalInput(draft.startsAt)}
          onChange={(e) => onChange({ startsAt: fromLocalInput(e.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ends-at">Hasta (opcional)</Label>
        <Input
          id="ends-at"
          type="datetime-local"
          value={toLocalInput(draft.endsAt)}
          onChange={(e) => onChange({ endsAt: fromLocalInput(e.target.value) })}
        />
      </div>
    </>
  );
}

export function ScheduleBadges({
  item,
}: {
  item: { isVisible: boolean; startsAt: string | null; endsAt: string | null };
}) {
  // Read once per mount (render must stay pure).
  const [now] = useState(() => Date.now());
  if (!item.isVisible) return <Badge variant="muted">Oculto</Badge>;
  if (item.startsAt && new Date(item.startsAt).getTime() > now)
    return <Badge variant="gold">Programado</Badge>;
  if (item.endsAt && new Date(item.endsAt).getTime() <= now) return <Badge variant="muted">Terminado</Badge>;
  return null;
}
