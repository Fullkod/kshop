import { z } from "zod";
import { collectionRulesSchema } from "../storefront/content";
import { currencyCodeSchema } from "../currency";

// Inputs of /api/v1/stores/{storeId}/catalog/*. Shared by the web admin and the mobile admin app.

export const CATALOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const name = (max: number) => z.string().trim().min(1, "Obligatorio.").max(max, `Máximo ${max} caracteres.`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();
export const catalogSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .regex(CATALOG_SLUG_PATTERN, "Solo minúsculas, números y guiones.");
const uuid = z.uuid();
const money = z.coerce
  .number({ error: "Escribe un número." })
  .min(0, "No puede ser negativo.")
  .max(9_999_999_999.99)
  .transform((v) => Math.round(v * 100) / 100);

export const ATTRIBUTE_INPUT_TYPES = [
  "dropdown",
  "multiselect",
  "swatch",
  "boolean",
  "numeric",
  "text",
  "date",
] as const;
export type AttributeInputType = (typeof ATTRIBUTE_INPUT_TYPES)[number];
/** Types whose values live in attribute_values (the rest store a free value per product). */
export const VALUE_LIST_TYPES: readonly AttributeInputType[] = ["dropdown", "multiselect", "swatch"];

export const PRODUCT_STATUSES = ["draft", "published", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const attributeValueInputSchema = z.object({
  id: uuid.optional(),
  name: name(80),
  slug: catalogSlugSchema.optional(),
  /** Swatch color as #RRGGBB. */
  value: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color en formato #RRGGBB.")
    .optional(),
});

export const attributeInputSchema = z.object({
  name: name(60),
  slug: catalogSlugSchema.optional(),
  inputType: z.enum(ATTRIBUTE_INPUT_TYPES).default("dropdown"),
  unit: optionalText(20),
  valueRequired: z.boolean().default(false),
  visibleInStorefront: z.boolean().default(true),
  filterableInStorefront: z.boolean().default(false),
  values: z.array(attributeValueInputSchema).max(500).default([]),
});
export type AttributeInput = z.infer<typeof attributeInputSchema>;

export const productTypeInputSchema = z
  .object({
    name: name(60),
    slug: catalogSlugSchema.optional(),
    hasVariants: z.boolean().default(false),
    isShippingRequired: z.boolean().default(true),
    weight: z.coerce.number().min(0).optional(),
    attributes: z
      .array(
        z.object({
          attributeId: uuid,
          scope: z.enum(["product", "variant"]),
          variantSelection: z.boolean().default(false),
        }),
      )
      .max(50)
      .default([]),
  })
  .refine((t) => t.hasVariants || t.attributes.every((a) => a.scope === "product"), {
    message: "Sin variantes, todos los atributos son del producto.",
    path: ["attributes"],
  })
  .refine((t) => new Set(t.attributes.map((a) => a.attributeId)).size === t.attributes.length, {
    message: "Un atributo aparece dos veces.",
    path: ["attributes"],
  });
export type ProductTypeInput = z.infer<typeof productTypeInputSchema>;

export const categoryInputSchema = z.object({
  name: name(80),
  slug: catalogSlugSchema.optional(),
  parentId: uuid.nullable().optional(),
  description: optionalText(2000),
  imageUrl: z.url().optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const brandInputSchema = z.object({
  name: name(80),
  slug: catalogSlugSchema.optional(),
  description: optionalText(2000),
  logoUrl: z.url().optional(),
  isPublished: z.boolean().default(true),
});
export type BrandInput = z.infer<typeof brandInputSchema>;

export const collectionInputSchema = z.object({
  name: name(80),
  slug: catalogSlugSchema.optional(),
  description: optionalText(2000),
  imageUrl: z.url().optional(),
  isPublished: z.boolean().default(true),
  /** Automatic collection (D8, phase 2): null = manual (products chosen one by one). */
  rules: collectionRulesSchema.nullable().optional(),
});
export type CollectionInput = z.infer<typeof collectionInputSchema>;

export const warehouseInputSchema = z.object({
  name: name(80),
  address: optionalText(300),
  phone: optionalText(30),
  isPickupPoint: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type WarehouseInput = z.infer<typeof warehouseInputSchema>;

export const currencyInputSchema = z.object({
  currency: currencyCodeSchema,
  /** 1 unit of this currency in base currency units (e.g. 1 USD = 300 CUP -> 300). */
  rateToBase: z.coerce.number().positive("La tasa debe ser mayor que 0.").max(1_000_000),
  /** Sale currency (needs multi_currency) or only used for costs. */
  sells: z.boolean().default(false),
  rounding: z.coerce.number().positive().max(1000).optional(),
});
export type CurrencyInput = z.infer<typeof currencyInputSchema>;

export const variantInputSchema = z.object({
  id: uuid.optional(),
  sku: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/, "SKU: letras, números, . _ / - (máx. 64)."),
  name: z.string().trim().max(120).default(""),
  price: money,
  compareAtPrice: money.nullable().optional(),
  trackInventory: z.boolean().default(true),
  weight: z.coerce.number().min(0).nullable().optional(),
  /** Absolute stock in the default warehouse ("flat" editing). Omit to leave it unchanged. */
  stock: z.coerce.number().int().min(0).max(1_000_000).optional(),
  /** Private cost. null removes it; omit to leave it unchanged. */
  cost: z.object({ price: money, currency: currencyCodeSchema }).nullable().optional(),
  /** Per-currency overrides (multi_currency). Omit to leave them unchanged. */
  prices: z
    .array(
      z.object({ currency: currencyCodeSchema, price: money, compareAtPrice: money.nullable().optional() }),
    )
    .optional(),
  mediaIds: z.array(uuid).optional(),
  attributeValues: z.array(z.object({ attributeId: uuid, valueId: uuid })).default([]),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const productAttributeInputSchema = z.object({
  attributeId: uuid,
  valueIds: z.array(uuid).optional(),
  valueText: z.string().trim().max(500).optional(),
  valueNumeric: z.coerce.number().optional(),
  valueBoolean: z.boolean().optional(),
  valueDate: z.iso.date().optional(),
});

export const productInputSchema = z
  .object({
    productTypeId: uuid,
    categoryId: uuid.nullable().optional(),
    brandId: uuid.nullable().optional(),
    name: name(200),
    slug: catalogSlugSchema,
    description: z.string().max(20_000).default(""),
    status: z.enum(PRODUCT_STATUSES).default("draft"),
    featured: z.boolean().default(false),
    badge: optionalText(30),
    seoTitle: optionalText(120),
    seoDescription: optionalText(300),
    tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
    collectionIds: z.array(uuid).max(50).default([]),
    attributes: z.array(productAttributeInputSchema).max(50).default([]),
    variants: z.array(variantInputSchema).min(1, "Añade al menos una variante.").max(300),
  })
  .refine((p) => new Set(p.variants.map((v) => v.sku.toUpperCase())).size === p.variants.length, {
    message: "Hay SKU repetidos.",
    path: ["variants"],
  });
export type ProductInput = z.infer<typeof productInputSchema>;

export const productStatusBulkInputSchema = z.object({
  productIds: z.array(uuid).min(1).max(500),
  status: z.enum(PRODUCT_STATUSES),
});

export const stockInputSchema = z.object({
  variantId: uuid,
  warehouseId: uuid,
  quantity: z.coerce.number().int().min(0).max(1_000_000),
  note: optionalText(200),
});
export type StockInput = z.infer<typeof stockInputSchema>;

export const productMediaInputSchema = z.object({
  /** Path inside store-media: stores/{storeId}/products/... */
  storageKey: z.string().min(1).max(300),
  url: z.url(),
  thumbUrl: z.url().optional(),
  alt: optionalText(200),
});
export type ProductMediaInput = z.infer<typeof productMediaInputSchema>;

export const reorderInputSchema = z.object({ ids: z.array(uuid).min(1).max(1000) });
