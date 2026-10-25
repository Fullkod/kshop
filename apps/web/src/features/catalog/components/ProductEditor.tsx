"use client";

import {
  catalogSlug,
  combinationKey,
  CURRENCY_CODES,
  convertFromBase,
  convertToBase,
  formatMoney,
  marginPercent,
  suggestSku,
  variantMatrix,
  variantName,
  VALUE_LIST_TYPES,
  type CurrencyCode,
  type ProductInput,
  type ProductStatus,
} from "@kshop/core";
import { ProductDetailQuery, type ProductMedia } from "@kshop/data";
import { Alert, Badge, Button, Card, FieldError, Input, Label, Select } from "@kshop/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { uploadProductImage } from "@/lib/images";
import { useSession } from "@/lib/session";
import { useStore } from "@/lib/store-context";
import {
  categoryOptions,
  useApiAction,
  useCatalogApi,
  useCatalogStructure,
  type Attribute,
  type CatalogStructure,
} from "../use-catalog";
import { STATUS_LABELS } from "./ProductList";

type VariantRow = {
  id?: string;
  /** combinationKey of its attribute values ("" for products without variants). */
  key: string;
  name: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  cost: string;
  costCurrency: CurrencyCode;
  stock: string;
  trackInventory: boolean;
  attributeValues: { attributeId: string; valueId: string }[];
  mediaId: string;
  /** Price overrides in other selling currencies (multi_currency); "" = converted with the rate. */
  prices: Partial<Record<CurrencyCode, { price: string; compareAtPrice: string }>>;
  /** Stock in the non-default warehouses (multi_warehouse), and what was last saved. */
  warehouseStock: Record<string, string>;
  savedWarehouseStock: Record<string, string>;
};

type ProductAttrValue = { valueIds: string[]; text: string };

type Form = {
  productTypeId: string;
  name: string;
  slug: string;
  slugEdited: boolean;
  description: string;
  status: ProductStatus;
  categoryId: string;
  brandId: string;
  collectionIds: string[];
  tags: string;
  featured: boolean;
  attributes: Record<string, ProductAttrValue>;
  /** Selected values per variant-selection attribute (builds the matrix). */
  axes: Record<string, string[]>;
  variants: VariantRow[];
};

const emptyVariant = (currency: CurrencyCode): VariantRow => ({
  key: "",
  name: "",
  sku: "",
  price: "",
  compareAtPrice: "",
  cost: "",
  costCurrency: currency,
  stock: "0",
  trackInventory: true,
  attributeValues: [],
  mediaId: "",
  prices: {},
  warehouseStock: {},
  savedWarehouseStock: {},
});

function blankForm(structure: CatalogStructure, currency: CurrencyCode): Form {
  const firstType = structure.productTypes[0];
  return {
    productTypeId: firstType?.id ?? "",
    name: "",
    slug: "",
    slugEdited: false,
    description: "",
    status: "draft",
    categoryId: "",
    brandId: "",
    collectionIds: [],
    tags: "",
    featured: false,
    attributes: {},
    axes: {},
    variants: firstType && !firstType.hasVariants ? [emptyVariant(currency)] : [],
  };
}

const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));

export function ProductEditor({ productId }: { productId?: string }) {
  const store = useStore();
  const router = useRouter();
  const { graphql, supabase } = useSession();
  const { data: structure, error: structureError } = useCatalogStructure();
  const { catalog, seesCosts, canDelete, has } = useCatalogApi();
  const action = useApiAction();
  const [loadedForm, setForm] = useState<Form | null>(null);
  const [media, setMedia] = useState<ProductMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  const baseCurrency = (structure?.currencies.find((c) => c.isBase)?.currency ??
    store.baseCurrency) as CurrencyCode;
  const defaultWarehouseId = structure?.warehouses.find((w) => w.isDefault)?.id;

  // A new product starts from an empty form derived from the structure; an existing one is loaded below.
  const form: Form | null =
    loadedForm ?? (!productId && structure ? blankForm(structure, baseCurrency) : null);

  useEffect(() => {
    if (!structure || loadedForm || !productId) return;
    let cancelled = false;
    graphql
      .query(ProductDetailQuery, { id: productId })
      .toPromise()
      .then((result) => {
        const p = result.data?.productsCollection?.edges[0]?.node;
        if (cancelled || !p) return;
        const attributes: Record<string, ProductAttrValue> = {};
        for (const { node: a } of p.productAttributeValuesCollection?.edges ?? []) {
          const current = attributes[a.attributeId] ?? { valueIds: [], text: "" };
          if (a.valueId) current.valueIds.push(a.valueId);
          current.text =
            a.valueText ??
            (a.valueNumeric != null
              ? String(a.valueNumeric)
              : a.valueBoolean != null
                ? String(a.valueBoolean)
                : (a.valueDate ?? current.text));
          attributes[a.attributeId] = current;
        }
        const variants: VariantRow[] = (p.productVariantsCollection?.edges ?? []).map(({ node: v }) => {
          const attributeValues = (v.variantAttributeValuesCollection?.edges ?? []).map((e) => e.node);
          const stocks = (v.stocksCollection?.edges ?? []).map((e) => e.node);
          const stockRow = stocks.find((st) => st.warehouseId === defaultWarehouseId);
          const warehouseStock = Object.fromEntries(
            stocks
              .filter((st) => st.warehouseId !== defaultWarehouseId)
              .map((st) => [st.warehouseId, String(st.quantity)]),
          );
          return {
            id: v.id,
            key: combinationKey(attributeValues),
            name: v.name,
            sku: v.sku,
            price: String(Number(v.price)),
            compareAtPrice: v.compareAtPrice != null ? String(Number(v.compareAtPrice)) : "",
            cost: v.variantCosts ? String(Number(v.variantCosts.costPrice)) : "",
            costCurrency: (v.variantCosts?.costCurrency as CurrencyCode | undefined) ?? baseCurrency,
            stock: String(stockRow?.quantity ?? 0),
            trackInventory: v.trackInventory,
            attributeValues,
            mediaId: v.variantMediaCollection?.edges[0]?.node.mediaId ?? "",
            prices: Object.fromEntries(
              (v.variantPricesCollection?.edges ?? []).map(({ node: vp }) => [
                vp.currency,
                {
                  price: String(Number(vp.price)),
                  compareAtPrice: vp.compareAtPrice != null ? String(Number(vp.compareAtPrice)) : "",
                },
              ]),
            ),
            warehouseStock,
            savedWarehouseStock: warehouseStock,
          };
        });
        const axes: Record<string, string[]> = {};
        for (const v of variants)
          for (const av of v.attributeValues)
            axes[av.attributeId] = [...new Set([...(axes[av.attributeId] ?? []), av.valueId])];
        setMedia(
          (p.productMediaCollection?.edges ?? []).map(({ node: m }, i) => ({
            id: m.id,
            url: m.url,
            thumbUrl: m.thumbUrl ?? null,
            alt: m.alt ?? null,
            sortOrder: i,
          })),
        );
        setForm({
          productTypeId: p.productTypeId,
          name: p.name,
          slug: p.slug,
          slugEdited: true,
          description: p.descriptionPlain,
          status: p.status,
          categoryId: p.categoryId ?? "",
          brandId: p.brandId ?? "",
          collectionIds: (p.collectionProductsCollection?.edges ?? []).map((e) => e.node.collectionId),
          tags: (p.productTagsCollection?.edges ?? []).map((e) => e.node.tag).join(", "),
          featured: p.featured,
          attributes,
          axes,
          variants,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [structure, loadedForm, productId, graphql, baseCurrency, defaultWarehouseId]);

  const type = structure?.productTypes.find((t) => t.id === form?.productTypeId);
  const attrById = useMemo(() => new Map((structure?.attributes ?? []).map((a) => [a.id, a])), [structure]);
  const productAttributes = (type?.attributes ?? [])
    .filter((a) => a.scope === "product")
    .map((a) => attrById.get(a.attributeId)!)
    .filter(Boolean);
  const selectionAttributes = (type?.attributes ?? [])
    .filter((a) => a.scope === "variant" && a.variantSelection)
    .map((a) => attrById.get(a.attributeId)!)
    .filter(Boolean);

  if (structureError) return <Alert variant="destructive">{structureError}</Alert>;
  if (!structure || !form) return <p className="text-muted-foreground">Cargando…</p>;
  if (structure.productTypes.length === 0) {
    return (
      <Alert>
        Antes de crear productos define al menos un <strong>tipo de producto</strong> (pestaña «Tipos de
        producto»).
      </Alert>
    );
  }

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const setVariant = (index: number, patch: Partial<VariantRow>) =>
    set({ variants: form.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)) });

  function onTypeChange(typeId: string) {
    const next = structure!.productTypes.find((t) => t.id === typeId);
    set({
      productTypeId: typeId,
      axes: {},
      attributes: {},
      variants: next && !next.hasVariants ? [form!.variants[0] ?? emptyVariant(baseCurrency)] : [],
    });
  }

  function toggleAxisValue(attributeId: string, valueId: string) {
    const current = form!.axes[attributeId] ?? [];
    set({
      axes: {
        ...form!.axes,
        [attributeId]: current.includes(valueId)
          ? current.filter((v) => v !== valueId)
          : [...current, valueId],
      },
    });
  }

  /** Builds the variant matrix from the selected values, keeping data of variants that already exist. */
  function generateVariants() {
    const axes = selectionAttributes.map((a) => ({
      attributeId: a.id,
      values: a.values.filter((v) => (form!.axes[a.id] ?? []).includes(v.id)),
    }));
    const existing = new Map(form!.variants.map((v) => [v.key, v]));
    const template = form!.variants[0] ?? emptyVariant(baseCurrency);
    const variants = variantMatrix(axes).map((combo) => {
      const attributeValues = combo.map((c) => ({ attributeId: c.attributeId, valueId: c.value.id }));
      const key = combinationKey(attributeValues);
      return (
        existing.get(key) ?? {
          ...emptyVariant(baseCurrency),
          key,
          name: variantName(combo),
          sku: suggestSku(form!.name || "SKU", combo),
          price: template.price,
          compareAtPrice: template.compareAtPrice,
          cost: template.cost,
          costCurrency: template.costCurrency,
          attributeValues,
        }
      );
    });
    set({ variants });
  }

  function applyToAll(field: "price" | "compareAtPrice" | "cost" | "costCurrency" | "stock", value: string) {
    set({ variants: form!.variants.map((v) => ({ ...v, [field]: value })) });
  }

  function buildInput(): ProductInput {
    return {
      productTypeId: form!.productTypeId,
      categoryId: form!.categoryId || null,
      brandId: form!.brandId || null,
      name: form!.name.trim(),
      slug: form!.slug || catalogSlug(form!.name),
      description: form!.description,
      status: form!.status,
      featured: form!.featured,
      badge: undefined,
      seoTitle: undefined,
      seoDescription: undefined,
      tags: form!.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      collectionIds: form!.collectionIds,
      attributes: productAttributes.flatMap((a): ProductInput["attributes"] => {
        const value = form!.attributes[a.id];
        if (!value) return [];
        if (VALUE_LIST_TYPES.includes(a.inputType))
          return value.valueIds.length ? [{ attributeId: a.id, valueIds: value.valueIds }] : [];
        if (!value.text.trim()) return [];
        if (a.inputType === "numeric") return [{ attributeId: a.id, valueNumeric: Number(value.text) }];
        if (a.inputType === "boolean") return [{ attributeId: a.id, valueBoolean: value.text === "true" }];
        if (a.inputType === "date") return [{ attributeId: a.id, valueDate: value.text }];
        return [{ attributeId: a.id, valueText: value.text }];
      }),
      variants: form!.variants.map((v) => ({
        id: v.id,
        sku: v.sku.trim(),
        name: v.name,
        price: num(v.price) ?? 0,
        compareAtPrice: num(v.compareAtPrice) ?? null,
        trackInventory: v.trackInventory,
        weight: null,
        stock: v.trackInventory ? (num(v.stock) ?? 0) : undefined,
        // Staff without cost permission leave it untouched.
        cost: seesCosts
          ? num(v.cost) != null
            ? { price: num(v.cost)!, currency: v.costCurrency }
            : null
          : undefined,
        // Without multi_currency the overrides are left untouched (the API would reject them).
        prices: has("multi_currency")
          ? Object.entries(v.prices).flatMap(([currency, p]) =>
              p && num(p.price) != null
                ? [
                    {
                      currency: currency as CurrencyCode,
                      price: num(p.price)!,
                      compareAtPrice: num(p.compareAtPrice) ?? null,
                    },
                  ]
                : [],
            )
          : undefined,
        mediaIds: v.mediaId ? [v.mediaId] : [],
        attributeValues: v.attributeValues,
      })),
    };
  }

  async function save() {
    setSaved(false);
    const input = buildInput();
    const result = await action.run(async () => {
      const saved = productId
        ? await catalog.updateProduct(productId, input)
        : await catalog.createProduct(input);
      // Stock in the other warehouses (multi_warehouse) goes through PUT stock, only what changed.
      for (const v of form!.variants) {
        if (!v.id || !v.trackInventory) continue;
        for (const [warehouseId, value] of Object.entries(v.warehouseStock)) {
          if (value === (v.savedWarehouseStock[warehouseId] ?? "0") || num(value) == null) continue;
          await catalog.setStock({ variantId: v.id, warehouseId, quantity: num(value)! });
        }
      }
      return saved;
    });
    if (!result) return;
    set({ variants: form!.variants.map((v) => ({ ...v, savedWarehouseStock: { ...v.warehouseStock } })) });
    if (!productId) {
      router.replace(`/admin/catalog/products/${result.id}`);
      return;
    }
    setSaved(true);
  }

  async function onUpload(files: FileList | null) {
    if (!files || !productId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadProductImage(supabase, store.id, file);
        const created = await action.run(() => catalog.addMedia(productId, { ...uploaded, alt: form!.name }));
        if (created) setMedia((current) => [...current, created]);
      }
    } catch (e) {
      action.setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  }

  async function onDeleteMedia(mediaId: string) {
    if ((await action.run(() => catalog.deleteMedia(productId!, mediaId))) !== undefined) {
      setMedia((current) => current.filter((m) => m.id !== mediaId));
      set({ variants: form!.variants.map((v) => (v.mediaId === mediaId ? { ...v, mediaId: "" } : v)) });
    }
  }

  async function onDeleteProduct() {
    if (
      !productId ||
      !window.confirm("¿Borrar el producto para siempre? Si solo quieres ocultarlo, archívalo.")
    )
      return;
    if ((await action.run(() => catalog.deleteProduct(productId))) !== undefined)
      router.replace("/admin/catalog");
  }

  const defaultWarehouse = structure.warehouses.find((w) => w.isDefault);
  const extraWarehouses = structure.warehouses.filter((w) => !w.isDefault);
  const sellCurrencies = structure.currencies.filter((c) => !c.isBase && c.sells);
  const setPrice = (index: number, currency: CurrencyCode, price: string) =>
    setVariant(index, {
      prices: {
        ...form.variants[index]!.prices,
        [currency]: { compareAtPrice: "", ...form.variants[index]!.prices[currency], price },
      },
    });

  const rate = (currency: CurrencyCode) =>
    currency === baseCurrency ? 1 : structure.currencies.find((c) => c.currency === currency)?.rateToBase;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{productId ? form.name || "Producto" : "Nuevo producto"}</h2>
        <div className="flex items-center gap-2">
          <Select
            aria-label="Estado"
            value={form.status}
            onChange={(e) => set({ status: e.target.value as ProductStatus })}
            className="w-40"
          >
            {(Object.keys(STATUS_LABELS) as ProductStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Button onClick={save} disabled={action.pending} data-testid="save-product">
            {action.pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>

      {action.error && <Alert variant="destructive">{action.error}</Alert>}
      {saved && !action.error && <Alert variant="success">Cambios guardados.</Alert>}

      <Card className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-type">Tipo de producto</Label>
          <Select
            id="p-type"
            value={form.productTypeId}
            onChange={(e) => onTypeChange(e.target.value)}
            disabled={!!productId}
          >
            {structure.productTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-name">Nombre</Label>
          <Input
            id="p-name"
            value={form.name}
            onChange={(e) =>
              set({ name: e.target.value, ...(form.slugEdited ? {} : { slug: catalogSlug(e.target.value) }) })
            }
          />
          <FieldError>{action.fieldErrors.name}</FieldError>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-slug">URL</Label>
          <Input
            id="p-slug"
            value={form.slug}
            onChange={(e) => set({ slug: e.target.value, slugEdited: true })}
          />
          <FieldError>{action.fieldErrors.slug}</FieldError>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-category">Categoría</Label>
          <Select
            id="p-category"
            value={form.categoryId}
            onChange={(e) => set({ categoryId: e.target.value })}
          >
            <option value="">Sin categoría</option>
            {categoryOptions(structure.categories).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-brand">Marca</Label>
          <Select id="p-brand" value={form.brandId} onChange={(e) => set({ brandId: e.target.value })}>
            <option value="">Sin marca</option>
            {structure.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-tags">Etiquetas (separadas por comas)</Label>
          <Input
            id="p-tags"
            value={form.tags}
            onChange={(e) => set({ tags: e.target.value })}
            placeholder="verano, algodón"
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="p-description">Descripción</Label>
          <textarea
            id="p-description"
            rows={4}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        {structure.collections.length > 0 && (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-sm font-medium">Colecciones</span>
            <div className="flex flex-wrap gap-3">
              {structure.collections.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.collectionIds.includes(c.id)}
                    onChange={(e) =>
                      set({
                        collectionIds: e.target.checked
                          ? [...form.collectionIds, c.id]
                          : form.collectionIds.filter((id) => id !== c.id),
                      })
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.featured}
            onChange={(e) => set({ featured: e.target.checked })}
          />
          Destacado
        </label>
      </Card>

      {productAttributes.length > 0 && (
        <Card className="grid gap-4 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Características</h3>
          {productAttributes.map((a) => (
            <ProductAttributeField
              key={a.id}
              attribute={a}
              value={form.attributes[a.id] ?? { valueIds: [], text: "" }}
              onChange={(value) => set({ attributes: { ...form.attributes, [a.id]: value } })}
            />
          ))}
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <h3 className="font-semibold">{type?.hasVariants ? "Variantes" : "Precio y stock"}</h3>

        {type?.hasVariants && (
          <div className="flex flex-col gap-3">
            {selectionAttributes.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Este tipo no tiene atributos que elija el cliente (ej. Talla). Configúralos en «Tipos de
                producto».
              </p>
            )}
            {selectionAttributes.map((a) => (
              <div key={a.id} className="flex flex-col gap-1">
                <span className="text-sm font-medium">{a.name}</span>
                <div className="flex flex-wrap gap-2">
                  {a.values.map((v) => {
                    const on = (form.axes[a.id] ?? []).includes(v.id);
                    return (
                      <button
                        type="button"
                        key={v.id}
                        aria-pressed={on}
                        onClick={() => toggleAxisValue(a.id, v.id)}
                        className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${on ? "border-primary bg-accent-soft text-primary" : ""}`}
                      >
                        {v.value && (
                          <span className="h-3 w-3 rounded-full border" style={{ background: v.value }} />
                        )}
                        {v.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {selectionAttributes.length > 0 && (
              <Button type="button" variant="outline" className="self-start" onClick={generateVariants}>
                Generar variantes (
                {selectionAttributes.reduce((n, a) => n * Math.max((form.axes[a.id] ?? []).length, 1), 1)})
              </Button>
            )}
          </div>
        )}

        {form.variants.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm" data-testid="variants-table">
              <thead className="text-muted-foreground">
                <tr>
                  {type?.hasVariants && <th className="py-2 pr-2 font-medium">Variante</th>}
                  <th className="py-2 pr-2 font-medium">SKU</th>
                  <th className="py-2 pr-2 font-medium">Precio ({baseCurrency})</th>
                  <th className="py-2 pr-2 font-medium">Antes</th>
                  {seesCosts && <th className="py-2 pr-2 font-medium">Costo</th>}
                  <th className="py-2 pr-2 font-medium">
                    Stock
                    {extraWarehouses.length > 0 && has("multi_warehouse") && ` (${defaultWarehouse?.name})`}
                  </th>
                  {media.length > 0 && <th className="py-2 pr-2 font-medium">Imagen</th>}
                </tr>
              </thead>
              <tbody>
                {form.variants.length > 1 && (
                  <tr className="bg-surface">
                    {type?.hasVariants && (
                      <td className="py-1 pr-2 text-xs text-muted-foreground">Para todas →</td>
                    )}
                    <td />
                    <td className="py-1 pr-2">
                      <Input
                        aria-label="Precio para todas"
                        placeholder="Precio"
                        onBlur={(e) => e.target.value && applyToAll("price", e.target.value)}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        aria-label="Precio anterior para todas"
                        onBlur={(e) => e.target.value && applyToAll("compareAtPrice", e.target.value)}
                      />
                    </td>
                    {seesCosts && (
                      <td className="py-1 pr-2">
                        <Input
                          aria-label="Costo para todas"
                          placeholder="Costo"
                          onBlur={(e) => e.target.value && applyToAll("cost", e.target.value)}
                        />
                      </td>
                    )}
                    <td className="py-1 pr-2">
                      <Input
                        aria-label="Stock para todas"
                        onBlur={(e) => e.target.value && applyToAll("stock", e.target.value)}
                      />
                    </td>
                    {media.length > 0 && <td />}
                  </tr>
                )}
                {form.variants.map((v, i) => {
                  const costRate = rate(v.costCurrency);
                  const margin =
                    num(v.cost) != null && costRate
                      ? marginPercent(num(v.price) ?? 0, convertToBase(num(v.cost)!, costRate))
                      : null;
                  return (
                    <tr key={v.id ?? v.key} className="border-t align-top">
                      {type?.hasVariants && <td className="py-2 pr-2 whitespace-nowrap">{v.name}</td>}
                      <td className="py-2 pr-2">
                        <Input
                          aria-label={`SKU ${v.name}`}
                          value={v.sku}
                          onChange={(e) => setVariant(i, { sku: e.target.value })}
                          className="w-56"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          aria-label={`Precio ${v.name}`}
                          inputMode="decimal"
                          value={v.price}
                          onChange={(e) => setVariant(i, { price: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          aria-label={`Precio anterior ${v.name}`}
                          inputMode="decimal"
                          value={v.compareAtPrice}
                          onChange={(e) => setVariant(i, { compareAtPrice: e.target.value })}
                        />
                      </td>
                      {seesCosts && (
                        <td className="py-2 pr-2">
                          <div className="flex gap-1">
                            <Input
                              aria-label={`Costo ${v.name}`}
                              inputMode="decimal"
                              value={v.cost}
                              onChange={(e) => setVariant(i, { cost: e.target.value })}
                              className="w-24"
                            />
                            <select
                              aria-label={`Moneda del costo ${v.name}`}
                              value={v.costCurrency}
                              onChange={(e) =>
                                setVariant(i, { costCurrency: e.target.value as CurrencyCode })
                              }
                              className="rounded-md border bg-background px-1 text-sm"
                            >
                              {CURRENCY_CODES.map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          {num(v.cost) != null && !costRate && (
                            <p className="mt-1 text-xs text-destructive">
                              Falta la tasa de {v.costCurrency} (pestaña Monedas)
                            </p>
                          )}
                          {margin != null && (
                            <p className="mt-1 text-xs text-muted-foreground">Margen {margin}%</p>
                          )}
                        </td>
                      )}
                      <td className="py-2 pr-2">
                        {v.trackInventory ? (
                          <Input
                            aria-label={`Stock ${v.name}`}
                            inputMode="numeric"
                            value={v.stock}
                            onChange={(e) => setVariant(i, { stock: e.target.value })}
                            className="w-20"
                          />
                        ) : (
                          <Badge variant="muted">Sin control</Badge>
                        )}
                        <label className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={!v.trackInventory}
                            onChange={(e) => setVariant(i, { trackInventory: !e.target.checked })}
                          />
                          No controlar stock
                        </label>
                      </td>
                      {media.length > 0 && (
                        <td className="py-2 pr-2">
                          <select
                            aria-label={`Imagen de ${v.name || "la variante"}`}
                            value={v.mediaId}
                            onChange={(e) => setVariant(i, { mediaId: e.target.value })}
                            className="rounded-md border bg-background px-1 py-1 text-sm"
                          >
                            <option value="">—</option>
                            {media.map((m, mi) => (
                              <option key={m.id} value={m.id}>
                                Imagen {mi + 1}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <FieldError>{action.fieldErrors.variants ?? action.fieldErrors.sku}</FieldError>
            {form.variants.some((v) => num(v.price)) && (
              <p className="mt-2 text-xs text-muted-foreground">
                Desde {formatMoney(Math.min(...form.variants.map((v) => num(v.price) ?? 0)), baseCurrency)}
              </p>
            )}
          </div>
        )}
      </Card>

      {form.variants.length > 0 && (
        <Card className="flex flex-col gap-3" data-testid="variant-currency-prices">
          <h3 className="flex items-center gap-2 font-semibold">
            Precios en otras monedas {!has("multi_currency") && <Badge variant="gold">Pro</Badge>}
          </h3>
          {!has("multi_currency") ? (
            <p className="text-sm text-muted-foreground">
              Con el plan Pro puedes vender en USD o EUR y fijar un precio propio en cada moneda.
            </p>
          ) : sellCurrencies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Activa «Vender en …» en la pestaña Monedas para fijar precios en otras monedas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <p className="mb-2 text-sm text-muted-foreground">
                Déjalo vacío para usar el precio en {baseCurrency} convertido con la tasa.
              </p>
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    {type?.hasVariants && <th className="py-2 pr-2 font-medium">Variante</th>}
                    {sellCurrencies.map((c) => (
                      <th key={c.currency} className="py-2 pr-2 font-medium">
                        Precio ({c.currency})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.variants.map((v, i) => (
                    <tr key={v.id ?? v.key} className="border-t">
                      {type?.hasVariants && <td className="py-2 pr-2 whitespace-nowrap">{v.name}</td>}
                      {sellCurrencies.map((c) => (
                        <td key={c.currency} className="py-2 pr-2">
                          <Input
                            aria-label={`Precio en ${c.currency} ${v.name}`}
                            inputMode="decimal"
                            className="w-32"
                            value={v.prices[c.currency]?.price ?? ""}
                            placeholder={
                              num(v.price) != null
                                ? String(convertFromBase(num(v.price)!, c.rateToBase, c.rounding))
                                : ""
                            }
                            onChange={(e) => setPrice(i, c.currency, e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {form.variants.length > 0 && (
        <Card className="flex flex-col gap-3" data-testid="warehouse-stock">
          <h3 className="flex items-center gap-2 font-semibold">
            Stock por almacén {!has("multi_warehouse") && <Badge variant="gold">Pro</Badge>}
          </h3>
          {!has("multi_warehouse") ? (
            <p className="text-sm text-muted-foreground">
              Con el plan Pro puedes tener varios almacenes y llevar el stock de cada uno.
            </p>
          ) : extraWarehouses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Solo tienes el almacén «{defaultWarehouse?.name}». Crea más en la pestaña Almacenes.
            </p>
          ) : !productId ? (
            <p className="text-sm text-muted-foreground">
              Guarda el producto para repartir su stock entre almacenes. El stock de la tabla de arriba va a «
              {defaultWarehouse?.name}».
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    {type?.hasVariants && <th className="py-2 pr-2 font-medium">Variante</th>}
                    <th className="py-2 pr-2 font-medium">{defaultWarehouse?.name}</th>
                    {extraWarehouses.map((w) => (
                      <th key={w.id} className="py-2 pr-2 font-medium">
                        {w.name}
                        {!w.isActive && " (inactivo)"}
                      </th>
                    ))}
                    <th className="py-2 pr-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {form.variants.map((v, i) => (
                    <tr key={v.id ?? v.key} className="border-t">
                      {type?.hasVariants && <td className="py-2 pr-2 whitespace-nowrap">{v.name}</td>}
                      {!v.trackInventory ? (
                        <td className="py-2 pr-2" colSpan={extraWarehouses.length + 2}>
                          <Badge variant="muted">Sin control</Badge>
                        </td>
                      ) : (
                        <>
                          <td className="py-2 pr-2">{num(v.stock) ?? 0}</td>
                          {extraWarehouses.map((w) => (
                            <td key={w.id} className="py-2 pr-2">
                              <Input
                                aria-label={`Stock ${w.name} ${v.name}`}
                                inputMode="numeric"
                                className="w-20"
                                value={v.warehouseStock[w.id] ?? "0"}
                                disabled={!v.id}
                                onChange={(e) =>
                                  setVariant(i, {
                                    warehouseStock: { ...v.warehouseStock, [w.id]: e.target.value },
                                  })
                                }
                              />
                            </td>
                          ))}
                          <td className="py-2 pr-2 font-medium">
                            {(num(v.stock) ?? 0) +
                              extraWarehouses.reduce(
                                (n, w) => n + (num(v.warehouseStock[w.id] ?? "0") ?? 0),
                                0,
                              )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                El stock de «{defaultWarehouse?.name}» se edita en la tabla de variantes. Las variantes nuevas
                se pueden repartir después de guardar.
              </p>
            </div>
          )}
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h3 className="font-semibold">Imágenes</h3>
        {!productId ? (
          <p className="text-sm text-muted-foreground">Guarda el producto para poder subir imágenes.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3" data-testid="product-media">
              {media.map((m, i) => (
                <div key={m.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Supabase public image */}
                  <img
                    src={m.thumbUrl ?? m.url}
                    alt={m.alt ?? ""}
                    className="h-24 w-24 rounded-md border object-cover"
                  />
                  <span className="absolute left-1 top-1 rounded bg-background/80 px-1 text-xs">{i + 1}</span>
                  <button
                    type="button"
                    onClick={() => onDeleteMedia(m.id)}
                    className="absolute right-1 top-1 rounded bg-background/80 px-1 text-xs hover:text-destructive"
                    aria-label={`Quitar imagen ${i + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm hover:bg-surface">
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => onUpload(e.target.files)}
                data-testid="media-input"
              />
              {uploading ? "Subiendo…" : "Subir imágenes (se comprimen automáticamente)"}
            </label>
          </>
        )}
      </Card>

      {productId && canDelete && (
        <div>
          <Button variant="ghost" className="text-destructive" onClick={onDeleteProduct}>
            Borrar producto
          </Button>
        </div>
      )}
    </div>
  );
}

function ProductAttributeField({
  attribute,
  value,
  onChange,
}: {
  attribute: Attribute;
  value: ProductAttrValue;
  onChange: (value: ProductAttrValue) => void;
}) {
  const id = `attr-${attribute.id}`;
  if (VALUE_LIST_TYPES.includes(attribute.inputType)) {
    const multiple = attribute.inputType === "multiselect";
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{attribute.name}</Label>
        <Select
          id={id}
          multiple={multiple}
          value={multiple ? value.valueIds : (value.valueIds[0] ?? "")}
          onChange={(e) =>
            onChange({
              ...value,
              valueIds: Array.from(e.target.selectedOptions)
                .map((o) => o.value)
                .filter(Boolean),
            })
          }
          className={multiple ? "h-24" : undefined}
        >
          {!multiple && <option value="">—</option>}
          {attribute.values.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </div>
    );
  }
  if (attribute.inputType === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.text === "true"}
          onChange={(e) => onChange({ ...value, text: String(e.target.checked) })}
        />
        {attribute.name}
      </label>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {attribute.name}
        {attribute.unit ? ` (${attribute.unit})` : ""}
      </Label>
      <Input
        id={id}
        type={attribute.inputType === "date" ? "date" : "text"}
        inputMode={attribute.inputType === "numeric" ? "decimal" : undefined}
        value={value.text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
      />
    </div>
  );
}
