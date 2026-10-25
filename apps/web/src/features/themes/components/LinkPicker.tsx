"use client";

import { LINK_TYPES, type Link, type LinkType } from "@kshop/core";
import { Input, Label } from "@kshop/ui";
import { categoryOptions, type CatalogStructure } from "@/features/catalog/use-catalog";
import type { AdminContent } from "../use-content";

const LABELS: Record<LinkType, string> = {
  product: "Producto",
  category: "Categoría",
  collection: "Colección",
  brand: "Marca",
  page: "Página",
  url: "Enlace (URL)",
};

export function linkTargets(type: LinkType, structure: CatalogStructure, content: AdminContent) {
  switch (type) {
    case "product":
      return content.products.map((p) => ({ id: p.id, label: p.name }));
    case "category":
      return categoryOptions(structure.categories).map((c) => ({ id: c.id, label: c.label }));
    case "collection":
      return structure.collections.map((c) => ({ id: c.id, label: c.name }));
    case "brand":
      return structure.brands.map((b) => ({ id: b.id, label: b.name }));
    case "page":
      return content.pages.map((p) => ({ id: p.id, label: p.title }));
    default:
      return [];
  }
}

/** Typed link: a store entity (product, category…) or a URL. `optional` adds "no link". */
export function LinkPicker({
  id,
  value,
  onChange,
  structure,
  content,
  optional,
}: {
  id: string;
  value: Link | null;
  onChange: (link: Link | null) => void;
  structure: CatalogStructure;
  content: AdminContent;
  optional?: boolean;
}) {
  const type = value?.type ?? "";
  const targets = value && value.type !== "url" ? linkTargets(value.type, structure, content) : [];
  return (
    <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-type`}>Lleva a</Label>
        <select
          id={`${id}-type`}
          value={type}
          onChange={(e) => {
            const next = e.target.value as LinkType | "";
            if (!next) onChange(null);
            else if (next === "url") onChange({ type: "url", url: "/" });
            else onChange({ type: next, targetId: linkTargets(next, structure, content)[0]?.id ?? "" });
          }}
          className="h-10 rounded-md border bg-background px-2 text-sm"
        >
          {optional && <option value="">Sin enlace</option>}
          {LINK_TYPES.map((t) => (
            <option key={t} value={t}>
              {LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      {value?.type === "url" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-url`}>Dirección</Label>
          <Input
            id={`${id}-url`}
            value={value.url}
            placeholder="/products o https://…"
            onChange={(e) => onChange({ type: "url", url: e.target.value })}
          />
        </div>
      ) : value ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-target`}>{LABELS[value.type]}</Label>
          <select
            id={`${id}-target`}
            value={value.targetId}
            onChange={(e) => onChange({ type: value.type, targetId: e.target.value })}
            className="h-10 rounded-md border bg-background px-2 text-sm"
          >
            {targets.length === 0 && <option value="">(no hay ninguno)</option>}
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
