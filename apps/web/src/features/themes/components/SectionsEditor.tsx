"use client";

import {
  HOME_SECTION_LABELS,
  HOME_SECTION_TYPES,
  PRODUCT_SORTS,
  SORT_LABELS,
  type HomeSectionInput,
  type HomeSectionType,
  type ProductSort,
} from "@kshop/core";
import type { ApiClient } from "@kshop/data";
import { Alert, Badge, Button, Card, Input, Label } from "@kshop/ui";
import { useState } from "react";
import { categoryOptions, useApiAction, type CatalogStructure } from "@/features/catalog/use-catalog";
import type { AdminContent, AdminSection } from "../use-content";
import { Schedule, ScheduleBadges } from "./BannersEditor";

type SourceKind = "all" | "collection" | "category" | "brand";
type Draft = {
  id?: string;
  type: HomeSectionType;
  title: string;
  bannerIds: string[];
  source: { kind: SourceKind; id: string };
  limit: number;
  sort: ProductSort;
  categoryIds: string[];
  markdown: string;
  autoplaySeconds: number;
  isVisible: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

const newDraft = (type: HomeSectionType): Draft => ({
  type,
  title: "",
  bannerIds: [],
  source: { kind: "all", id: "" },
  limit: 8,
  sort: "newest",
  categoryIds: [],
  markdown: "",
  autoplaySeconds: 6,
  isVisible: true,
  startsAt: null,
  endsAt: null,
});

function fromSection(s: AdminSection): Draft {
  const settings = s.settings as Record<string, unknown>;
  return {
    ...newDraft(s.type),
    id: s.id,
    title: s.title ?? "",
    bannerIds: s.bannerIds,
    source: s.sourceCollectionId
      ? { kind: "collection", id: s.sourceCollectionId }
      : s.sourceCategoryId
        ? { kind: "category", id: s.sourceCategoryId }
        : s.sourceBrandId
          ? { kind: "brand", id: s.sourceBrandId }
          : { kind: "all", id: "" },
    limit: typeof settings.limit === "number" ? settings.limit : 8,
    sort: (settings.sort as ProductSort) ?? "newest",
    categoryIds: Array.isArray(settings.categoryIds) ? (settings.categoryIds as string[]) : [],
    markdown: typeof settings.markdown === "string" ? settings.markdown : "",
    autoplaySeconds: typeof settings.autoplaySeconds === "number" ? settings.autoplaySeconds : 6,
    isVisible: s.isVisible,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
  };
}

function toInput(d: Draft): HomeSectionInput {
  const base = { title: d.title || null, isVisible: d.isVisible, startsAt: d.startsAt, endsAt: d.endsAt };
  switch (d.type) {
    case "hero_slider":
      return {
        ...base,
        type: d.type,
        bannerIds: d.bannerIds,
        settings: { autoplaySeconds: d.autoplaySeconds },
      };
    case "banner":
      return { ...base, type: d.type, bannerIds: d.bannerIds.slice(0, 1), settings: {} };
    case "product_carousel":
      return {
        ...base,
        type: d.type,
        source: d.source.kind === "all" ? { kind: "all" } : { kind: d.source.kind, id: d.source.id },
        settings: { limit: d.limit, sort: d.sort },
      };
    case "category_grid":
      return { ...base, type: d.type, settings: { categoryIds: d.categoryIds } };
    case "brand_strip":
      return { ...base, type: d.type, settings: {} };
    case "rich_text":
      return { ...base, type: d.type, settings: { markdown: d.markdown } };
  }
}

export function SectionsEditor({
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
  const action = useApiAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newType, setNewType] = useState<HomeSectionType>("hero_slider");

  async function save() {
    if (!draft) return;
    const input = toInput(draft);
    const ok = await action.run(() =>
      draft.id ? api.update("sections", draft.id, input) : api.create("sections", input),
    );
    if (ok) {
      setDraft(null);
      reload();
    }
  }
  async function move(index: number, delta: number) {
    const ids = content.sections.map((s) => s.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    if ((await action.run(() => api.reorder("sections", ids))) !== undefined) reload();
  }
  async function remove(section: AdminSection) {
    if (!window.confirm(`¿Borrar la sección «${section.title || HOME_SECTION_LABELS[section.type]}»?`))
      return;
    if ((await action.run(() => api.remove("sections", section.id))) !== undefined) reload();
  }

  const sources: Record<Exclude<SourceKind, "all">, { id: string; label: string }[]> = {
    collection: structure.collections.map((c) => ({ id: c.id, label: c.name })),
    category: categoryOptions(structure.categories).map((c) => ({ id: c.id, label: c.label })),
    brand: structure.brands.map((b) => ({ id: b.id, label: b.name })),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          La portada se arma con secciones, en este orden. Sin secciones la tienda muestra las novedades y las
          categorías.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="new-section-type">Tipo</Label>
            <select
              id="new-section-type"
              value={newType}
              onChange={(e) => setNewType(e.target.value as HomeSectionType)}
              className="h-10 rounded-md border bg-background px-2 text-sm"
            >
              {HOME_SECTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {HOME_SECTION_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => setDraft(newDraft(newType))}>Añadir sección</Button>
        </div>
      </div>
      {action.error && <Alert variant="destructive">{action.error}</Alert>}

      {draft && (
        <Card className="grid gap-4 sm:grid-cols-2" data-testid="section-form">
          <h3 className="font-semibold sm:col-span-2">
            {draft.id ? "Editar" : "Nueva"} sección: {HOME_SECTION_LABELS[draft.type]}
          </h3>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="section-title">Título (opcional)</Label>
            <Input
              id="section-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>

          {(draft.type === "hero_slider" || draft.type === "banner") && (
            <fieldset className="flex flex-col gap-2 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">
                {draft.type === "banner" ? "Banner" : "Banners (en este orden)"}
              </legend>
              {content.banners.length === 0 && (
                <p className="text-sm text-muted-foreground">Primero crea banners en la pestaña «Banners».</p>
              )}
              {content.banners.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input
                    type={draft.type === "banner" ? "radio" : "checkbox"}
                    name="section-banners"
                    checked={draft.bannerIds.includes(b.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        bannerIds:
                          draft.type === "banner"
                            ? [b.id]
                            : e.target.checked
                              ? [...draft.bannerIds, b.id]
                              : draft.bannerIds.filter((id) => id !== b.id),
                      })
                    }
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element -- banner thumbnail */}
                  <img src={b.imageUrl} alt="" className="h-8 w-16 rounded border object-cover" />
                  {b.title || b.alt || "Sin título"}
                </label>
              ))}
              {draft.type === "hero_slider" && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  Cambiar cada
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    value={draft.autoplaySeconds}
                    onChange={(e) => setDraft({ ...draft, autoplaySeconds: Number(e.target.value) })}
                    className="w-20"
                  />
                  segundos (0 = no cambia solo)
                </label>
              )}
            </fieldset>
          )}

          {draft.type === "product_carousel" && (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="section-source">Productos de</Label>
                <select
                  id="section-source"
                  value={draft.source.kind}
                  onChange={(e) => {
                    const kind = e.target.value as SourceKind;
                    setDraft({
                      ...draft,
                      source: { kind, id: kind === "all" ? "" : (sources[kind][0]?.id ?? "") },
                    });
                  }}
                  className="h-10 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="all">Toda la tienda</option>
                  <option value="collection">Una colección</option>
                  <option value="category">Una categoría</option>
                  <option value="brand">Una marca</option>
                </select>
              </div>
              {draft.source.kind !== "all" && (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="section-source-id">Cuál</Label>
                  <select
                    id="section-source-id"
                    value={draft.source.id}
                    onChange={(e) => setDraft({ ...draft, source: { ...draft.source, id: e.target.value } })}
                    className="h-10 rounded-md border bg-background px-2 text-sm"
                  >
                    {sources[draft.source.kind].map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Label htmlFor="section-limit">Cuántos (4 a 24)</Label>
                <Input
                  id="section-limit"
                  type="number"
                  min={4}
                  max={24}
                  value={draft.limit}
                  onChange={(e) => setDraft({ ...draft, limit: Number(e.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="section-sort">Orden</Label>
                <select
                  id="section-sort"
                  value={draft.sort}
                  onChange={(e) => setDraft({ ...draft, sort: e.target.value as ProductSort })}
                  className="h-10 rounded-md border bg-background px-2 text-sm"
                >
                  {PRODUCT_SORTS.map((s) => (
                    <option key={s} value={s}>
                      {SORT_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {draft.type === "category_grid" && (
            <fieldset className="flex flex-col gap-1 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">
                Categorías (ninguna marcada = las principales)
              </legend>
              {categoryOptions(structure.categories).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.categoryIds.includes(c.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        categoryIds: e.target.checked
                          ? [...draft.categoryIds, c.id]
                          : draft.categoryIds.filter((id) => id !== c.id),
                      })
                    }
                  />
                  {c.label}
                </label>
              ))}
            </fieldset>
          )}

          {draft.type === "rich_text" && (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="section-markdown">Texto</Label>
              <textarea
                id="section-markdown"
                rows={6}
                value={draft.markdown}
                onChange={(e) => setDraft({ ...draft, markdown: e.target.value })}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                **negrita**, *cursiva*, ## Título, - listas y [enlaces](/products).
              </p>
            </div>
          )}

          <Schedule draft={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
          <div className="flex gap-2 sm:col-span-2">
            <Button onClick={save} disabled={action.pending}>
              {action.pending ? "Guardando…" : "Guardar"}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {content.sections.length === 0 ? (
        <Card className="text-center text-muted-foreground">
          Todavía no hay secciones: la portada usa la de por defecto.
        </Card>
      ) : (
        <Card className="p-0">
          <ol className="divide-y">
            {content.sections.map((s, i) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-6 text-sm text-muted-foreground">{i + 1}</span>
                <span className="flex-1">
                  <span className="font-medium">{s.title || HOME_SECTION_LABELS[s.type]}</span>{" "}
                  <Badge variant="muted">{HOME_SECTION_LABELS[s.type]}</Badge>
                </span>
                <ScheduleBadges item={s} />
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
                    disabled={i === content.sections.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Bajar"
                  >
                    ↓
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDraft(fromSection(s))}>
                    Editar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(s)}>
                    Borrar
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
