import { z } from "zod";

// Storefront content (D4–D8): typed links, home sections per type, banners, menus, pages and the rules
// of automatic collections. Shared by the API (validation) and the admin/storefront (types).

const uuid = z.uuid();
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const LINK_TYPES = ["product", "category", "collection", "brand", "page", "url"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

/** Absolute http(s) URL or a path of the store ("/products?sort=price-asc"). */
const linkUrl = z
  .string()
  .trim()
  .max(500)
  .regex(/^(https?:\/\/|\/)/, "Usa un enlace que empiece por https:// o por /.");

export const linkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url"), url: linkUrl }),
  z.object({ type: z.enum(["product", "category", "collection", "brand", "page"]), targetId: uuid }),
]);
export type Link = z.infer<typeof linkSchema>;

/** Path of a link in the storefront, given the slug of its target ("" when the target is gone). */
export function linkHref(type: LinkType, slug: string | null | undefined, url?: string | null): string {
  if (type === "url") return url ?? "";
  if (!slug) return "";
  return `/${type}/${slug}`;
}

const schedule = {
  isVisible: z.boolean().default(true),
  startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
};
const scheduleCheck = (v: { startsAt?: string | null; endsAt?: string | null }) =>
  !v.startsAt || !v.endsAt || new Date(v.startsAt) < new Date(v.endsAt);
const scheduleMessage = { message: "La fecha de fin debe ser posterior a la de inicio.", path: ["endsAt"] };

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

export const bannerInputSchema = z
  .object({
    title: optionalText(120),
    subtitle: optionalText(240),
    ctaLabel: optionalText(40),
    imageUrl: z.url(),
    imageMobileUrl: z.url().nullable().optional(),
    alt: optionalText(200),
    link: linkSchema.nullable().optional(),
    ...schedule,
  })
  .refine(scheduleCheck, scheduleMessage);
export type BannerInput = z.infer<typeof bannerInputSchema>;

// ---------------------------------------------------------------------------
// Home sections (one settings shape per type)
// ---------------------------------------------------------------------------

export const PRODUCT_SORTS = ["newest", "price-asc", "price-desc", "name"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const HOME_SECTION_TYPES = [
  "hero_slider",
  "banner",
  "product_carousel",
  "category_grid",
  "brand_strip",
  "rich_text",
] as const;
export type HomeSectionType = (typeof HOME_SECTION_TYPES)[number];

export const HOME_SECTION_LABELS: Record<HomeSectionType, string> = {
  hero_slider: "Carrusel de portada",
  banner: "Banner",
  product_carousel: "Productos",
  category_grid: "Categorías",
  brand_strip: "Marcas",
  rich_text: "Texto",
};

export const RICH_TEXT_MAX = 20_000;

const sectionBase = { title: optionalText(120), ...schedule };

export const homeSectionInputSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("hero_slider"),
      ...sectionBase,
      bannerIds: z.array(uuid).min(1, "Elige al menos un banner.").max(8),
      settings: z
        .object({ autoplaySeconds: z.int().min(0).max(30).default(6) })
        .default({ autoplaySeconds: 6 }),
    }),
    z.object({
      type: z.literal("banner"),
      ...sectionBase,
      bannerIds: z.array(uuid).length(1, "Elige un banner."),
      settings: z.object({}).default({}),
    }),
    z.object({
      type: z.literal("product_carousel"),
      ...sectionBase,
      source: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("collection"), id: uuid }),
        z.object({ kind: z.literal("category"), id: uuid }),
        z.object({ kind: z.literal("brand"), id: uuid }),
        z.object({ kind: z.literal("all") }),
      ]),
      settings: z
        .object({ limit: z.int().min(4).max(24).default(8), sort: z.enum(PRODUCT_SORTS).default("newest") })
        .default({ limit: 8, sort: "newest" }),
    }),
    z.object({
      type: z.literal("category_grid"),
      ...sectionBase,
      settings: z.object({ categoryIds: z.array(uuid).max(12).default([]) }).default({ categoryIds: [] }),
    }),
    z.object({
      type: z.literal("brand_strip"),
      ...sectionBase,
      settings: z.object({}).default({}),
    }),
    z.object({
      type: z.literal("rich_text"),
      ...sectionBase,
      settings: z.object({ markdown: z.string().max(RICH_TEXT_MAX) }),
    }),
  ])
  .refine(scheduleCheck, scheduleMessage);
export type HomeSectionInput = z.infer<typeof homeSectionInputSchema>;

// ---------------------------------------------------------------------------
// Menus and pages
// ---------------------------------------------------------------------------

export const MENU_LOCATIONS = ["header", "footer"] as const;
export type MenuLocation = (typeof MENU_LOCATIONS)[number];

export type MenuItemInput = { label: string; link: Link; children?: MenuItemInput[] };
const menuLeafSchema = z.object({ label: z.string().trim().min(1).max(60), link: linkSchema });

/** The whole menu is saved at once (two levels). */
/** Footer text of the store (Appearance); empty clears it. */
export const storeDescriptionSchema = z.object({
  description: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null)
    .nullable(),
});
export type StoreDescriptionInput = z.input<typeof storeDescriptionSchema>;

export const menuInputSchema = z.object({
  items: z.array(menuLeafSchema.extend({ children: z.array(menuLeafSchema).max(20).default([]) })).max(20),
});
export type MenuInput = z.infer<typeof menuInputSchema>;

export const pageInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones.")
    .max(80),
  content: z.string().max(50_000).default(""),
  isPublished: z.boolean().default(false),
  seoTitle: optionalText(70),
  seoDescription: optionalText(160),
});
export type PageInput = z.infer<typeof pageInputSchema>;

// ---------------------------------------------------------------------------
// Automatic collections (D8) — resolved by private.product_matches_rules
// ---------------------------------------------------------------------------

export const collectionRulesSchema = z
  .object({
    categoryId: uuid.optional(),
    brandId: uuid.optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    onSale: z.boolean().optional(),
    newerThanDays: z.int().min(1).max(365).optional(),
    featured: z.boolean().optional(),
    inStock: z.boolean().optional(),
  })
  .refine(
    (r) => Object.values(r).some((v) => v !== undefined && v !== false && !(Array.isArray(v) && !v.length)),
    {
      message: "Añade al menos una regla.",
    },
  );
export type CollectionRules = z.infer<typeof collectionRulesSchema>;
