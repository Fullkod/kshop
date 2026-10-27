"use client";

import {
  BENEFIT_ICONS,
  HOME_SECTION_LABELS,
  HOME_SECTION_TYPES,
  PRODUCT_SORTS,
  SORT_LABELS,
  type BenefitIcon,
  type HomeSectionInput,
  type HomeSectionType,
  type Link,
  type ProductSort,
} from "@kshop/core";
import type { ApiClient } from "@kshop/data";
import { Alert, Badge, Button, Card, Input, Label } from "@kshop/ui";
import { useState, type ReactNode } from "react";
import { categoryOptions, useApiAction, type CatalogStructure } from "@/features/catalog/use-catalog";
import type { AdminContent, AdminSection } from "../use-content";
import { Schedule, ScheduleBadges } from "./BannersEditor";
import { LinkPicker } from "./LinkPicker";

type SourceKind = "all" | "collection" | "category" | "brand" | "on_sale";
type Benefit = { icon: BenefitIcon; title: string; text: string };
type Testimonial = { quote: string; name: string; place: string; product: string; rating: number };
type Block = {
  eyebrow: string;
  title: string;
  text: string;
  ctaLabel: string;
  link: Link | null;
  bigText: string;
};

// One flat draft for every type; toInput() keeps only what the type uses.
type Draft = {
  id?: string;
  type: HomeSectionType;
  title: string;
  eyebrow: string;
  bannerIds: string[];
  source: { kind: SourceKind; id: string };
  limit: number;
  sort: ProductSort;
  categoryIds: string[];
  collectionIds: string[];
  markdown: string;
  autoplaySeconds: number;
  whatsapp: boolean;
  text: string;
  secondaryText: string;
  linkLabel: string;
  link: Link | null;
  icon: BenefitIcon;
  benefits: Benefit[];
  block: Block | null;
  productId: string;
  badge: string;
  testimonials: Testimonial[];
  summary: { rating: number; count: number } | null;
  isVisible: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

const ICON_LABELS: Record<BenefitIcon, string> = {
  truck: "Camión",
  banknote: "Billete",
  "message-circle": "WhatsApp",
  "refresh-ccw": "Cambios",
  "shield-check": "Garantía",
  clock: "Reloj",
  gift: "Regalo",
  store: "Tienda",
};

const emptyBenefit = (): Benefit => ({ icon: "truck", title: "", text: "" });
const emptyTestimonial = (): Testimonial => ({ quote: "", name: "", place: "", product: "", rating: 5 });
const emptyBlock = (): Block => ({ eyebrow: "", title: "", text: "", ctaLabel: "", link: null, bigText: "" });

const newDraft = (type: HomeSectionType): Draft => ({
  type,
  title: "",
  eyebrow: "",
  bannerIds: [],
  source: { kind: type === "offer_countdown" ? "on_sale" : "all", id: "" },
  limit: type === "offer_countdown" ? 3 : 8,
  sort: "newest",
  categoryIds: [],
  collectionIds: [],
  markdown: "",
  autoplaySeconds: 6,
  whatsapp: false,
  text: "",
  secondaryText: "",
  linkLabel: "",
  link: null,
  icon: "truck",
  benefits: type === "benefits" ? [emptyBenefit(), emptyBenefit()] : [],
  block: null,
  productId: "",
  badge: "",
  testimonials: type === "testimonials" ? [emptyTestimonial()] : [],
  summary: null,
  isVisible: true,
  startsAt: null,
  endsAt: null,
});

const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function fromSection(s: AdminSection): Draft {
  const settings = s.settings;
  const block = settings.block as Partial<Block> | null | undefined;
  return {
    ...newDraft(s.type),
    id: s.id,
    title: s.title ?? "",
    eyebrow: str(settings.eyebrow),
    bannerIds: s.bannerIds,
    source: s.sourceCollectionId
      ? { kind: "collection", id: s.sourceCollectionId }
      : s.sourceCategoryId
        ? { kind: "category", id: s.sourceCategoryId }
        : s.sourceBrandId
          ? { kind: "brand", id: s.sourceBrandId }
          : { kind: s.type === "offer_countdown" ? "on_sale" : "all", id: "" },
    limit: typeof settings.limit === "number" ? settings.limit : s.type === "offer_countdown" ? 3 : 8,
    sort: (settings.sort as ProductSort) ?? "newest",
    categoryIds: list<string>(settings.categoryIds),
    collectionIds: list<string>(settings.collectionIds),
    markdown: str(settings.markdown),
    autoplaySeconds: typeof settings.autoplaySeconds === "number" ? settings.autoplaySeconds : 6,
    whatsapp: settings.whatsapp === true,
    text: str(settings.text),
    secondaryText: str(settings.secondaryText),
    linkLabel: str(settings.linkLabel),
    link: (settings.link as Link | null | undefined) ?? null,
    icon: (settings.icon as BenefitIcon) ?? "truck",
    benefits: list<Partial<Benefit>>(settings.items)
      .filter(() => s.type === "benefits")
      .map((b) => ({ icon: b.icon ?? "truck", title: str(b.title), text: str(b.text) })),
    block: block ? { ...emptyBlock(), ...block, link: block.link ?? null } : null,
    productId: str(settings.productId),
    badge: str(settings.badge),
    testimonials: list<Partial<Testimonial>>(settings.items)
      .filter(() => s.type === "testimonials")
      .map((t) => ({ ...emptyTestimonial(), ...t, place: str(t.place), product: str(t.product) })),
    summary: (settings.summary as Draft["summary"]) ?? null,
    isVisible: s.isVisible,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
  };
}

const orNull = (v: string) => v.trim() || null;

function toInput(d: Draft): HomeSectionInput {
  const base = {
    title: orNull(d.title),
    eyebrow: orNull(d.eyebrow),
    isVisible: d.isVisible,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
  };
  switch (d.type) {
    case "announcement_bar":
      return {
        ...base,
        type: d.type,
        settings: {
          text: d.text,
          secondaryText: orNull(d.secondaryText),
          linkLabel: orNull(d.linkLabel),
          link: d.link,
          icon: d.icon,
        },
      };
    case "hero_slider":
      return {
        ...base,
        type: d.type,
        bannerIds: d.bannerIds,
        settings: { autoplaySeconds: d.autoplaySeconds, whatsapp: d.whatsapp },
      };
    case "benefits":
      return {
        ...base,
        type: d.type,
        settings: { items: d.benefits.map((b) => ({ icon: b.icon, title: b.title, text: orNull(b.text) })) },
      };
    case "banner":
      return { ...base, type: d.type, bannerIds: d.bannerIds.slice(0, 1), settings: {} };
    case "banner_mosaic":
      return {
        ...base,
        type: d.type,
        bannerIds: d.bannerIds.slice(0, 2),
        settings: {
          block:
            d.bannerIds.length < 2 && d.block
              ? {
                  eyebrow: orNull(d.block.eyebrow),
                  title: d.block.title,
                  text: orNull(d.block.text),
                  ctaLabel: orNull(d.block.ctaLabel),
                  link: d.block.link,
                  bigText: orNull(d.block.bigText),
                }
              : null,
        },
      };
    case "product_carousel":
      return {
        ...base,
        type: d.type,
        source:
          d.source.kind === "all" || d.source.kind === "on_sale"
            ? { kind: "all" }
            : { kind: d.source.kind, id: d.source.id },
        settings: { limit: d.limit, sort: d.sort },
      };
    case "offer_countdown":
      return {
        ...base,
        type: d.type,
        source:
          d.source.kind === "collection" ? { kind: "collection", id: d.source.id } : { kind: "on_sale" },
        settings: { text: orNull(d.text), limit: d.limit },
      };
    case "featured_product":
      return { ...base, type: d.type, settings: { productId: d.productId, badge: orNull(d.badge) } };
    case "category_grid":
      return { ...base, type: d.type, settings: { categoryIds: d.categoryIds } };
    case "collection_cards":
      return { ...base, type: d.type, settings: { collectionIds: d.collectionIds } };
    case "brand_strip":
      return { ...base, type: d.type, settings: {} };
    case "testimonials":
      return {
        ...base,
        type: d.type,
        settings: {
          items: d.testimonials.map((t) => ({
            quote: t.quote,
            name: t.name,
            place: orNull(t.place),
            product: orNull(t.product),
            rating: t.rating,
          })),
          summary: d.summary,
        },
      };
    case "rich_text":
      return {
        ...base,
        type: d.type,
        settings: { markdown: d.markdown, linkLabel: orNull(d.linkLabel), link: d.link },
      };
  }
}

const selectClass = "h-11 rounded-md border bg-background px-2 text-sm";

function Field({
  id,
  label,
  children,
  wide,
}: {
  id: string;
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
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

  const sources: Record<"collection" | "category" | "brand", { id: string; label: string }[]> = {
    collection: structure.collections.map((c) => ({ id: c.id, label: c.name })),
    category: categoryOptions(structure.categories).map((c) => ({ id: c.id, label: c.label })),
    brand: structure.brands.map((b) => ({ id: b.id, label: b.name })),
  };
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const toggle = (ids: string[], id: string, on: boolean) =>
    on ? [...ids, id] : ids.filter((x) => x !== id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          La portada se arma con secciones, en este orden. Sin secciones la tienda muestra las novedades y las
          categorías. La «Barra de anuncio» sale encima de la cabecera en todas las páginas.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="new-section-type">Tipo</Label>
            <select
              id="new-section-type"
              value={newType}
              onChange={(e) => setNewType(e.target.value as HomeSectionType)}
              className={selectClass}
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
          {draft.type !== "announcement_bar" && (
            <>
              <Field id="section-title" label="Título (opcional)">
                <Input
                  id="section-title"
                  value={draft.title}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </Field>
              <Field id="section-eyebrow" label="Antetítulo (opcional, p. ej. «Recién llegados»)">
                <Input
                  id="section-eyebrow"
                  value={draft.eyebrow}
                  maxLength={40}
                  onChange={(e) => set({ eyebrow: e.target.value })}
                />
              </Field>
            </>
          )}

          {draft.type === "announcement_bar" && (
            <>
              <Field id="section-text" label="Texto" wide>
                <Input
                  id="section-text"
                  value={draft.text}
                  maxLength={120}
                  placeholder="Envío gratis en La Habana desde 20 000 CUP"
                  onChange={(e) => set({ text: e.target.value })}
                />
              </Field>
              <Field id="section-secondary" label="Segundo texto (opcional, solo en pantallas anchas)">
                <Input
                  id="section-secondary"
                  value={draft.secondaryText}
                  maxLength={80}
                  onChange={(e) => set({ secondaryText: e.target.value })}
                />
              </Field>
              <Field id="section-icon" label="Icono">
                <IconSelect id="section-icon" value={draft.icon} onChange={(icon) => set({ icon })} />
              </Field>
              <Field id="section-link-label" label="Texto del enlace (opcional)">
                <Input
                  id="section-link-label"
                  value={draft.linkLabel}
                  maxLength={40}
                  onChange={(e) => set({ linkLabel: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <LinkPicker
                  id="section-link"
                  value={draft.link}
                  onChange={(link) => set({ link })}
                  structure={structure}
                  content={content}
                  optional
                />
              </div>
            </>
          )}

          {(draft.type === "hero_slider" || draft.type === "banner" || draft.type === "banner_mosaic") && (
            <fieldset className="flex flex-col gap-2 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">
                {draft.type === "banner"
                  ? "Banner"
                  : draft.type === "banner_mosaic"
                    ? "Banners (1 o 2: con uno, la otra pieza es un bloque de color)"
                    : "Banners (en este orden)"}
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
                    disabled={
                      draft.type === "banner_mosaic" &&
                      draft.bannerIds.length >= 2 &&
                      !draft.bannerIds.includes(b.id)
                    }
                    onChange={(e) =>
                      set({
                        bannerIds:
                          draft.type === "banner" ? [b.id] : toggle(draft.bannerIds, b.id, e.target.checked),
                      })
                    }
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element -- banner thumbnail */}
                  <img src={b.imageUrl} alt="" className="h-8 w-16 rounded border object-cover" />
                  {b.title || b.alt || "Sin título"}
                </label>
              ))}
              {draft.type === "hero_slider" && (
                <>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    Cambiar cada
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      value={draft.autoplaySeconds}
                      onChange={(e) => set({ autoplaySeconds: Number(e.target.value) })}
                      className="w-20"
                    />
                    segundos (0 = no cambia solo)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.whatsapp}
                      onChange={(e) => set({ whatsapp: e.target.checked })}
                    />
                    Botón «Pedir por WhatsApp» junto al del banner
                  </label>
                </>
              )}
            </fieldset>
          )}

          {draft.type === "banner_mosaic" && draft.bannerIds.length < 2 && (
            <fieldset className="grid gap-4 rounded-md border p-4 sm:col-span-2 sm:grid-cols-2">
              <legend className="px-1 text-sm font-medium">Bloque de color (segunda pieza)</legend>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={!!draft.block}
                  onChange={(e) => set({ block: e.target.checked ? emptyBlock() : null })}
                />
                Mostrar un bloque con texto en el color secundario del tema
              </label>
              {draft.block && (
                <BlockFields
                  block={draft.block}
                  onChange={(block) => set({ block })}
                  structure={structure}
                  content={content}
                />
              )}
            </fieldset>
          )}

          {draft.type === "benefits" && (
            <fieldset className="flex flex-col gap-3 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">Ventajas (2 a 4)</legend>
              {draft.benefits.map((b, i) => (
                <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[140px_1fr_1fr_auto]">
                  <IconSelect
                    id={`benefit-icon-${i}`}
                    value={b.icon}
                    label={`Icono de la ventaja ${i + 1}`}
                    onChange={(icon) =>
                      set({ benefits: draft.benefits.map((x, j) => (j === i ? { ...x, icon } : x)) })
                    }
                  />
                  <Input
                    aria-label={`Título de la ventaja ${i + 1}`}
                    placeholder="Envío a domicilio"
                    maxLength={40}
                    value={b.title}
                    onChange={(e) =>
                      set({
                        benefits: draft.benefits.map((x, j) =>
                          j === i ? { ...x, title: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label={`Texto de la ventaja ${i + 1}`}
                    placeholder="En toda La Habana"
                    maxLength={60}
                    value={b.text}
                    onChange={(e) =>
                      set({
                        benefits: draft.benefits.map((x, j) =>
                          j === i ? { ...x, text: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={draft.benefits.length <= 2}
                    onClick={() => set({ benefits: draft.benefits.filter((_, j) => j !== i) })}
                  >
                    Quitar
                  </Button>
                </div>
              ))}
              {draft.benefits.length < 4 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => set({ benefits: [...draft.benefits, emptyBenefit()] })}
                >
                  Añadir ventaja
                </Button>
              )}
            </fieldset>
          )}

          {(draft.type === "product_carousel" || draft.type === "offer_countdown") && (
            <>
              <Field id="section-source" label="Productos de">
                <select
                  id="section-source"
                  value={draft.source.kind}
                  onChange={(e) => {
                    const kind = e.target.value as SourceKind;
                    set({
                      source: {
                        kind,
                        id: kind === "all" || kind === "on_sale" ? "" : (sources[kind][0]?.id ?? ""),
                      },
                    });
                  }}
                  className={selectClass}
                >
                  {draft.type === "offer_countdown" ? (
                    <option value="on_sale">Todo lo rebajado</option>
                  ) : (
                    <option value="all">Toda la tienda</option>
                  )}
                  <option value="collection">Una colección</option>
                  {draft.type === "product_carousel" && (
                    <>
                      <option value="category">Una categoría</option>
                      <option value="brand">Una marca</option>
                    </>
                  )}
                </select>
              </Field>
              {draft.source.kind !== "all" && draft.source.kind !== "on_sale" && (
                <Field id="section-source-id" label="Cuál">
                  <select
                    id="section-source-id"
                    value={draft.source.id}
                    onChange={(e) => set({ source: { ...draft.source, id: e.target.value } })}
                    className={selectClass}
                  >
                    {sources[draft.source.kind].map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field
                id="section-limit"
                label={
                  draft.type === "offer_countdown" ? "Cuántos (2 a 6; en móvil se ven 2)" : "Cuántos (4 a 24)"
                }
              >
                <Input
                  id="section-limit"
                  type="number"
                  min={draft.type === "offer_countdown" ? 2 : 4}
                  max={draft.type === "offer_countdown" ? 6 : 24}
                  value={draft.limit}
                  onChange={(e) => set({ limit: Number(e.target.value) })}
                />
              </Field>
              {draft.type === "product_carousel" ? (
                <Field id="section-sort" label="Orden">
                  <select
                    id="section-sort"
                    value={draft.sort}
                    onChange={(e) => set({ sort: e.target.value as ProductSort })}
                    className={selectClass}
                  >
                    {PRODUCT_SORTS.map((s) => (
                      <option key={s} value={s}>
                        {SORT_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field id="section-text" label="Texto (opcional)" wide>
                  <Input
                    id="section-text"
                    value={draft.text}
                    maxLength={160}
                    onChange={(e) => set({ text: e.target.value })}
                  />
                </Field>
              )}
              {draft.type === "offer_countdown" && (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  La cuenta atrás llega hasta la fecha «Hasta» de abajo (obligatoria) y la sección se oculta
                  sola al terminar.
                </p>
              )}
            </>
          )}

          {draft.type === "featured_product" && (
            <>
              <Field id="section-product" label="Producto">
                <select
                  id="section-product"
                  value={draft.productId}
                  onChange={(e) => set({ productId: e.target.value })}
                  className={selectClass}
                >
                  <option value="">Elige un producto</option>
                  {content.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="section-badge" label="Etiqueta sobre la foto (opcional, p. ej. «Más vendido»)">
                <Input
                  id="section-badge"
                  value={draft.badge}
                  maxLength={24}
                  onChange={(e) => set({ badge: e.target.value })}
                />
              </Field>
            </>
          )}

          {draft.type === "category_grid" && (
            <fieldset className="flex flex-col gap-1 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">
                Categorías (ninguna marcada = las principales). La foto se pone en Catálogo › Categorías.
              </legend>
              {categoryOptions(structure.categories).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.categoryIds.includes(c.id)}
                    onChange={(e) => set({ categoryIds: toggle(draft.categoryIds, c.id, e.target.checked) })}
                  />
                  {c.label}
                </label>
              ))}
            </fieldset>
          )}

          {draft.type === "collection_cards" && (
            <fieldset className="flex flex-col gap-1 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">
                Colecciones (2 a 6, en este orden). La foto se pone en Catálogo › Colecciones.
              </legend>
              {structure.collections.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.collectionIds.includes(c.id)}
                    disabled={draft.collectionIds.length >= 6 && !draft.collectionIds.includes(c.id)}
                    onChange={(e) =>
                      set({ collectionIds: toggle(draft.collectionIds, c.id, e.target.checked) })
                    }
                  />
                  {c.name}
                </label>
              ))}
            </fieldset>
          )}

          {draft.type === "testimonials" && (
            <fieldset className="flex flex-col gap-3 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">Opiniones (las escribes tú, hasta 9)</legend>
              {draft.testimonials.map((t, i) => {
                const update = (patch: Partial<Testimonial>) =>
                  set({ testimonials: draft.testimonials.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-3">
                    <textarea
                      aria-label={`Opinión ${i + 1}`}
                      rows={2}
                      maxLength={280}
                      value={t.quote}
                      placeholder="Lo que dijo el cliente"
                      onChange={(e) => update({ quote: e.target.value })}
                      className="rounded-md border bg-background px-3 py-2 text-sm sm:col-span-3"
                    />
                    <Input
                      aria-label={`Nombre ${i + 1}`}
                      placeholder="Nombre"
                      maxLength={60}
                      value={t.name}
                      onChange={(e) => update({ name: e.target.value })}
                    />
                    <Input
                      aria-label={`Lugar ${i + 1}`}
                      placeholder="Lugar (opcional)"
                      maxLength={40}
                      value={t.place}
                      onChange={(e) => update({ place: e.target.value })}
                    />
                    <Input
                      aria-label={`Producto comprado ${i + 1}`}
                      placeholder="Qué compró (opcional)"
                      maxLength={60}
                      value={t.product}
                      onChange={(e) => update({ product: e.target.value })}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      Estrellas
                      <select
                        value={t.rating}
                        onChange={(e) => update({ rating: Number(e.target.value) })}
                        className={selectClass}
                      >
                        {[5, 4, 3, 2, 1].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-self-start"
                      disabled={draft.testimonials.length <= 1}
                      onClick={() => set({ testimonials: draft.testimonials.filter((_, j) => j !== i) })}
                    >
                      Quitar
                    </Button>
                  </div>
                );
              })}
              {draft.testimonials.length < 9 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => set({ testimonials: [...draft.testimonials, emptyTestimonial()] })}
                >
                  Añadir opinión
                </Button>
              )}
              <label className="flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!draft.summary}
                  onChange={(e) => set({ summary: e.target.checked ? { rating: 5, count: 0 } : null })}
                />
                Mostrar el resumen bajo el título
                {draft.summary && (
                  <>
                    <Input
                      aria-label="Nota media"
                      type="number"
                      min={1}
                      max={5}
                      step={0.1}
                      value={draft.summary.rating}
                      onChange={(e) =>
                        set({ summary: { ...draft.summary!, rating: Number(e.target.value) } })
                      }
                      className="w-20"
                    />
                    de 5 ·
                    <Input
                      aria-label="Número de opiniones"
                      type="number"
                      min={0}
                      value={draft.summary.count}
                      onChange={(e) => set({ summary: { ...draft.summary!, count: Number(e.target.value) } })}
                      className="w-24"
                    />
                    opiniones
                  </>
                )}
              </label>
            </fieldset>
          )}

          {draft.type === "rich_text" && (
            <>
              <Field id="section-markdown" label="Texto" wide>
                <textarea
                  id="section-markdown"
                  rows={6}
                  value={draft.markdown}
                  onChange={(e) => set({ markdown: e.target.value })}
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  **negrita**, *cursiva*, ## Título, - listas y [enlaces](/products).
                </p>
              </Field>
              <Field id="section-link-label" label="Texto del enlace (opcional)">
                <Input
                  id="section-link-label"
                  value={draft.linkLabel}
                  maxLength={40}
                  onChange={(e) => set({ linkLabel: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <LinkPicker
                  id="section-link"
                  value={draft.link}
                  onChange={(link) => set({ link })}
                  structure={structure}
                  content={content}
                  optional
                />
              </div>
            </>
          )}

          <Schedule
            draft={draft}
            endRequired={draft.type === "offer_countdown"}
            onChange={(patch) => set(patch)}
          />
          {Object.keys(action.fieldErrors).length > 0 && (
            <ul className="text-sm text-destructive sm:col-span-2">
              {[...new Set(Object.values(action.fieldErrors))].map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
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

function IconSelect({
  id,
  value,
  label,
  onChange,
}: {
  id: string;
  value: BenefitIcon;
  label?: string;
  onChange: (icon: BenefitIcon) => void;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as BenefitIcon)}
      className={selectClass}
    >
      {BENEFIT_ICONS.map((icon) => (
        <option key={icon} value={icon}>
          {ICON_LABELS[icon]}
        </option>
      ))}
    </select>
  );
}

function BlockFields({
  block,
  onChange,
  structure,
  content,
}: {
  block: Block;
  onChange: (block: Block) => void;
  structure: CatalogStructure;
  content: AdminContent;
}) {
  const fields = [
    ["eyebrow", "Etiqueta (p. ej. «Solo esta semana»)", 40],
    ["title", "Título", 80],
    ["text", "Texto (opcional)", 160],
    ["ctaLabel", "Texto del botón (opcional)", 30],
    ["bigText", "Texto grande de fondo (opcional, p. ej. «30%»)", 6],
  ] as const;
  return (
    <>
      {fields.map(([key, label, max]) => (
        <Field key={key} id={`block-${key}`} label={label}>
          <Input
            id={`block-${key}`}
            value={block[key]}
            maxLength={max}
            onChange={(e) => onChange({ ...block, [key]: e.target.value })}
          />
        </Field>
      ))}
      <div className="sm:col-span-2">
        <LinkPicker
          id="block-link"
          value={block.link}
          onChange={(link) => onChange({ ...block, link })}
          structure={structure}
          content={content}
          optional
        />
      </div>
    </>
  );
}
