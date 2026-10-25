import "server-only";
import type { ProductInput } from "@kshop/core";
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

/** Saves the whole product in one transaction (public.save_product). Returns its id. */
export async function saveProduct(
  storeId: string,
  userId: string,
  input: ProductInput,
  productId?: string,
): Promise<string> {
  const { data, error } = await getServiceClient().rpc("save_product", {
    p_store_id: storeId,
    p_input: toSaveProductPayload(input, productId),
    p_user_id: userId,
  });
  if (error) mapDbError(error, "El producto");
  return data as string;
}

/** Public URL prefix of objects in the store-media bucket for a store. */
export function storeMediaPrefix(supabaseUrl: string, storeId: string): string {
  return `${supabaseUrl}/storage/v1/object/public/store-media/stores/${storeId}/`;
}
