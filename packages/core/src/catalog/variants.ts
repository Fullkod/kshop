import { slugify } from "../slug";

export type AxisValue = { id: string; name: string; slug: string };
export type VariantAxis = { attributeId: string; values: AxisValue[] };
export type VariantCombination = { attributeId: string; value: AxisValue }[];

/** Cartesian product of the selected values: Talla {S, M} × Color {Rojo} -> [[S, Rojo], [M, Rojo]]. */
export function variantMatrix(axes: VariantAxis[]): VariantCombination[] {
  const used = axes.filter((a) => a.values.length > 0);
  if (used.length === 0) return [];
  return used.reduce<VariantCombination[]>(
    (combos, axis) =>
      combos.flatMap((combo) =>
        axis.values.map((value) => [...combo, { attributeId: axis.attributeId, value }]),
      ),
    [[]],
  );
}

/** Human name of a variant: "S / Rojo". */
export function variantName(combo: VariantCombination): string {
  return combo.map((c) => c.value.name).join(" / ");
}

/** Suggested SKU from the product and the value slugs: "VESTIDO-NANDU-S-ROJO" (max 64 chars). */
export function suggestSku(productNameOrCode: string, combo: VariantCombination = []): string {
  const base = slugify(productNameOrCode).toUpperCase().slice(0, 40) || "SKU";
  const suffix = combo.map((c) => c.value.slug.toUpperCase()).join("-");
  return (suffix ? `${base}-${suffix}` : base).slice(0, 64).replace(/-+$/g, "");
}

/** SKU base for a variant left without one: product name plus the variant name ("Vestido Ñandú", "S / Rojo"). */
export function skuBase(productName: string, variantName = ""): string {
  const base = slugify(productName).toUpperCase().slice(0, 40) || "SKU";
  const suffix = slugify(variantName).toUpperCase();
  return (suffix ? `${base}-${suffix}` : base).slice(0, 60).replace(/-+$/g, "");
}

/**
 * Fills the empty SKUs of a product's variants with `skuBase`, adding "-2", "-3"… when the code is already in use
 * (`taken`: SKUs of the store, any case) or repeated in the product. Variants with a SKU keep it.
 */
export function fillMissingSkus<T extends { sku: string; name: string }>(
  productName: string,
  variants: T[],
  taken: Iterable<string>,
): T[] {
  const used = new Set([...taken].map((s) => s.toUpperCase()));
  for (const v of variants) if (v.sku) used.add(v.sku.toUpperCase());
  return variants.map((v) => {
    if (v.sku) return v;
    const base = skuBase(productName, v.name);
    let sku = base;
    for (let n = 2; used.has(sku); n++) sku = `${base}-${n}`;
    used.add(sku);
    return { ...v, sku };
  });
}

/** Key to match an existing variant with a combination regardless of attribute order. */
export function combinationKey(values: { attributeId: string; valueId: string }[]): string {
  return values
    .map((v) => `${v.attributeId}:${v.valueId}`)
    .sort()
    .join("|");
}

/** Slug for catalog entities (products, categories…): up to 80 chars, no accents. */
export function catalogSlug(name: string): string {
  return slugify(name.slice(0, 120)).slice(0, 80).replace(/-+$/g, "");
}
