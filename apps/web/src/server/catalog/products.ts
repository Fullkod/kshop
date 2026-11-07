import "server-only";
import { fillMissingSkus, skuBase, type ProductInput } from "@kshop/core";
import { mapDbError } from "../db-errors";
import { getServiceClient } from "../supabase";

/** Maps the API input (camelCase) to the jsonb shape of public.save_product. */
function toSaveProductPayload(input: ProductInput, productId?: string) {
  return {
    ...(productId && { id: productId }),
    product_type_id: input.productTypeId,
    category_id: input.categoryId ?? null,
    brand_id: input.brandId ?? null,
    name: input.name,
    slug: input.slug,
    description: input.description,
    status: input.status,
    featured: input.featured,
    badge: input.badge ?? null,
    seo_title: input.seoTitle ?? null,
    seo_description: input.seoDescription ?? null,
    // KSH0015: omitted = unchanged (old apps); the step only makes sense with a unit of measure.
    ...(input.saleUnit !== undefined && { sale_unit: input.saleUnit }),
    ...(input.quantityStep !== undefined && { quantity_step: input.quantityStep }),
    tags: input.tags,
    collection_ids: input.collectionIds,
    attributes: input.attributes.map((a) => ({
      attribute_id: a.attributeId,
      value_ids: a.valueIds,
      value_text: a.valueText,
      value_numeric: a.valueNumeric,
      value_boolean: a.valueBoolean,
      value_date: a.valueDate,
    })),
    variants: input.variants.map((v, index) => ({
      ...(v.id && { id: v.id }),
      sku: v.sku,
      name: v.name,
      sort_order: index,
      price: v.price,
      compare_at_price: v.compareAtPrice ?? null,
      track_inventory: v.trackInventory,
      weight: v.weight ?? null,
      ...(v.stock !== undefined && { stock: v.stock }),
      ...(v.cost !== undefined && { cost: v.cost }),
      ...(v.prices !== undefined && {
        prices: v.prices.map((p) => ({
          currency: p.currency,
          price: p.price,
          compare_at_price: p.compareAtPrice ?? null,
        })),
      }),
      ...(v.mediaIds !== undefined && { media_ids: v.mediaIds }),
      attribute_values: v.attributeValues.map((a) => ({ attribute_id: a.attributeId, value_id: a.valueId })),
    })),
  };
}

/**
 * Variants sent without a SKU get one from the product and variant names ("VESTIDO-NANDU-S-ROJO"), with "-2", "-3"…
 * when the store already uses it. A race with another save on the same code ends in the usual duplicate SKU error.
 */
async function withSkus(storeId: string, input: ProductInput): Promise<ProductInput> {
  if (input.variants.every((v) => v.sku)) return input;
  // A saved variant sent without a SKU (the editor kept the empty field) keeps the one it has.
  const ids = input.variants.filter((v) => !v.sku && v.id).map((v) => v.id!);
  if (ids.length) {
    const { data, error } = await getServiceClient()
      .from("product_variants")
      .select("id, sku")
      .eq("store_id", storeId)
      .in("id", ids);
    if (error) mapDbError(error, "El producto");
    const current = new Map((data ?? []).map((r: { id: string; sku: string }) => [r.id, r.sku]));
    input = {
      ...input,
      variants: input.variants.map((v) =>
        !v.sku && v.id && current.has(v.id) ? { ...v, sku: current.get(v.id)! } : v,
      ),
    };
  }
  const missing = input.variants.filter((v) => !v.sku);
  if (!missing.length) return input;
  const bases = [...new Set(missing.map((v) => skuBase(input.name, v.name)))];
  const taken: string[] = [];
  for (const base of bases) {
    // Every SKU of the store that starts with the base (a base is A-Z, 0-9 and "-": no ilike wildcards in it).
    const { data, error } = await getServiceClient()
      .from("product_variants")
      .select("sku")
      .eq("store_id", storeId)
      .ilike("sku", `${base}%`);
    if (error) mapDbError(error, "El producto");
    taken.push(...(data ?? []).map((r: { sku: string }) => r.sku));
  }
  return { ...input, variants: fillMissingSkus(input.name, input.variants, taken) };
}

/** Saves the whole product in one transaction (public.save_product). Returns its id. */
export async function saveProduct(
  storeId: string,
  userId: string,
  input: ProductInput,
  productId?: string,
): Promise<string> {
  const { data, error } = await getServiceClient().rpc("save_product", {
    p_store_id: storeId,
    p_input: toSaveProductPayload(await withSkus(storeId, input), productId),
    p_user_id: userId,
  });
  if (error) mapDbError(error, "El producto");
  return data as string;
}

/** Public URL prefix of objects in the store-media bucket for a store. */
export function storeMediaPrefix(supabaseUrl: string, storeId: string): string {
  return `${supabaseUrl}/storage/v1/object/public/store-media/stores/${storeId}/`;
}
