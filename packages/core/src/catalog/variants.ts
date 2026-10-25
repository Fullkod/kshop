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
