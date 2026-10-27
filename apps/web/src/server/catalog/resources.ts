import "server-only";
import {
  attributeInputSchema,
  brandInputSchema,
  catalogSlug,
  categoryInputSchema,
  collectionInputSchema,
  productTypeInputSchema,
  VALUE_LIST_TYPES,
  warehouseInputSchema,
  type AttributeInput,
  type BrandInput,
  type CategoryInput,
  type CollectionInput,
  type WarehouseInput,
  type ProductTypeInput,
  type StoreRole,
} from "@kshop/core";
import type { ZodType } from "zod";
import { publicEnv } from "@/env";
import { mapDbError } from "../db-errors";
import { HttpError } from "../http";
import { storeMediaPrefix } from "./products";
import { getServiceClient } from "../supabase";

/**
 * Simple catalog entities written by /api/v1/stores/{storeId}/catalog/{resource}[/{id}].
 * store_id always comes from the route (never from the body); rows are written with the service client
 * after requireStoreRole + requireModule('catalog').
 */
export type CatalogResource<TInput> = {
  table: string;
  /** Spanish name for error messages. */
  entity: string;
  minRole: StoreRole;
  schema: ZodType<TInput>;
  toRow: (input: TInput, storeId: string) => Record<string, unknown>;
  /** Child rows that belong to the entity (attribute values, type attributes). */
  saveChildren?: (storeId: string, id: string, input: TInput) => Promise<void>;
};

const slugOf = (input: { name: string; slug?: string }) => input.slug ?? catalogSlug(input.name);

/** Category/collection photos and brand logos must be files of this store in store-media (uploaded by the admin). */
function storeImage(storeId: string, url: string | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith(storeMediaPrefix(publicEnv.supabaseUrl, storeId))) {
    throw new HttpError(400, "invalid_media", "La imagen no pertenece a esta tienda.");
  }
  return url;
}

async function saveAttributeValues(storeId: string, attributeId: string, input: AttributeInput) {
  const db = getServiceClient();
  if (!VALUE_LIST_TYPES.includes(input.inputType)) return;

  const rows = input.values.map((v, index) => ({
    ...(v.id && { id: v.id }),
    store_id: storeId,
    attribute_id: attributeId,
    name: v.name,
    slug: v.slug ?? catalogSlug(v.name),
    value: v.value ?? null,
    sort_order: index,
  }));
  const keep = input.values.flatMap((v) => (v.id ? [v.id] : []));

  // Values removed from the list (fails with 409 if a product still uses them).
  let remove = db.from("attribute_values").delete().eq("store_id", storeId).eq("attribute_id", attributeId);
  if (keep.length) remove = remove.not("id", "in", `(${keep.join(",")})`);
  const removed = await remove;
  if (removed.error) mapDbError(removed.error, "El valor");

  const existing = rows.filter((r) => "id" in r);
  const created = rows.filter((r) => !("id" in r));
  if (existing.length) {
    const { error } = await db.from("attribute_values").upsert(existing, { onConflict: "id" });
    if (error) mapDbError(error, "El valor");
  }
  if (created.length) {
    const { error } = await db.from("attribute_values").insert(created);
    if (error) mapDbError(error, "El valor");
  }
}

async function saveTypeAttributes(storeId: string, typeId: string, input: ProductTypeInput) {
  const db = getServiceClient();
  const removed = await db
    .from("product_type_attributes")
    .delete()
    .eq("store_id", storeId)
    .eq("product_type_id", typeId);
  if (removed.error) mapDbError(removed.error, "El atributo");
  if (input.attributes.length === 0) return;
  const { error } = await db.from("product_type_attributes").insert(
    input.attributes.map((a, index) => ({
      store_id: storeId,
      product_type_id: typeId,
      attribute_id: a.attributeId,
      scope: a.scope,
      variant_selection: a.scope === "variant" && a.variantSelection,
      sort_order: index,
    })),
  );
  if (error) mapDbError(error, "El atributo");
}

const resources = {
  attributes: {
    table: "attributes",
    entity: "El atributo",
    minRole: "admin",
    schema: attributeInputSchema,
    toRow: (i: AttributeInput) => ({
      name: i.name,
      slug: slugOf(i),
      input_type: i.inputType,
      unit: i.unit ?? null,
      value_required: i.valueRequired,
      visible_in_storefront: i.visibleInStorefront,
      filterable_in_storefront: i.filterableInStorefront,
    }),
    saveChildren: saveAttributeValues,
  } satisfies CatalogResource<AttributeInput>,
  "product-types": {
    table: "product_types",
    entity: "El tipo de producto",
    minRole: "admin",
    schema: productTypeInputSchema,
    toRow: (i: ProductTypeInput) => ({
      name: i.name,
      slug: slugOf(i),
      has_variants: i.hasVariants,
      is_shipping_required: i.isShippingRequired,
      weight: i.weight ?? null,
    }),
    saveChildren: saveTypeAttributes,
  } satisfies CatalogResource<ProductTypeInput>,
  categories: {
    table: "categories",
    entity: "La categoría",
    minRole: "admin",
    schema: categoryInputSchema,
    toRow: (i, storeId) => ({
      name: i.name,
      slug: slugOf(i),
      parent_id: i.parentId ?? null,
      description: i.description ?? null,
      image_url: storeImage(storeId, i.imageUrl),
    }),
  } satisfies CatalogResource<CategoryInput>,
  brands: {
    table: "brands",
    entity: "La marca",
    minRole: "admin",
    schema: brandInputSchema,
    toRow: (i, storeId) => ({
      name: i.name,
      slug: slugOf(i),
      description: i.description ?? null,
      logo_url: storeImage(storeId, i.logoUrl),
      is_published: i.isPublished,
    }),
  } satisfies CatalogResource<BrandInput>,
  collections: {
    table: "collections",
    entity: "La colección",
    minRole: "admin",
    schema: collectionInputSchema,
    toRow: (i, storeId) => ({
      name: i.name,
      slug: slugOf(i),
      description: i.description ?? null,
      image_url: storeImage(storeId, i.imageUrl),
      is_published: i.isPublished,
      // Omitted keeps the current rules; null makes it manual.
      ...(i.rules !== undefined && { rules: i.rules }),
    }),
  } satisfies CatalogResource<CollectionInput>,
  warehouses: {
    table: "warehouses",
    entity: "El almacén",
    minRole: "admin",
    schema: warehouseInputSchema,
    toRow: (i) => ({
      name: i.name,
      address: i.address ?? null,
      phone: i.phone ?? null,
      is_pickup_point: i.isPickupPoint,
      is_active: i.isActive,
    }),
  } satisfies CatalogResource<WarehouseInput>,
};

export type CatalogResourceName = keyof typeof resources;

export function getCatalogResource(name: string): CatalogResource<unknown> | undefined {
  return (resources as Record<string, CatalogResource<unknown>>)[name];
}
