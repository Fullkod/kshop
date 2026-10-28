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
    /** Pill above the title in the split hero («Nueva temporada»). */
    eyebrow: optionalText(40),
    /** Product shown in the hero's floating mini card. */
    productId: uuid.nullable().optional(),
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
  "announcement_bar",
  "hero_slider",
  "benefits",
  "category_grid",
  "product_carousel",
  "banner",
  "banner_mosaic",
  "offer_countdown",
  "featured_product",
  "collection_cards",
  "brand_strip",
  "testimonials",
  "rich_text",
] as const;
export type HomeSectionType = (typeof HOME_SECTION_TYPES)[number];

export const HOME_SECTION_LABELS: Record<HomeSectionType, string> = {
  announcement_bar: "Barra de anuncio",
  hero_slider: "Carrusel de portada",
  benefits: "Beneficios",
  category_grid: "Categorías",
  product_carousel: "Productos",
  banner: "Banner",
  banner_mosaic: "Banner doble",
  offer_countdown: "Oferta con cuenta atrás",
  featured_product: "Producto destacado",
  collection_cards: "Colecciones",
  brand_strip: "Marcas",
  testimonials: "Opiniones",
  rich_text: "Texto",
};

/** Icons the owner can pick for benefits and the announcement bar (lucide names, mapped in @kshop/storefront). */
export const BENEFIT_ICONS = [
  "truck",
  "banknote",
  "message-circle",
  "refresh-ccw",
  "shield-check",
  "clock",
  "gift",
  "store",
] as const;
export type BenefitIcon = (typeof BENEFIT_ICONS)[number];

export const RICH_TEXT_MAX = 20_000;

// The eyebrow (small uppercase line above the title) is common to every section; the API keeps it in settings.
const sectionBase = { title: optionalText(120), eyebrow: optionalText(40), ...schedule };

const benefitSchema = z.object({
  icon: z.enum(BENEFIT_ICONS),
  title: z.string().trim().min(1).max(40),
  text: optionalText(60),
});

const testimonialSchema = z.object({
  quote: z.string().trim().min(1).max(280),
  name: z.string().trim().min(1).max(60),
  place: optionalText(40),
  product: optionalText(60),
  rating: z.int().min(1).max(5).default(5),
});

export const homeSectionInputSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("announcement_bar"),
      ...sectionBase,
      settings: z.object({
        text: z.string().trim().min(1).max(120),
        secondaryText: optionalText(80),
        linkLabel: optionalText(40),
        link: linkSchema.nullable().optional(),
        icon: z.enum(BENEFIT_ICONS).default("truck"),
      }),
    }),
    z.object({
      type: z.literal("hero_slider"),
      ...sectionBase,
      bannerIds: z.array(uuid).min(1, "Elige al menos un banner.").max(8),
      settings: z
        .object({
          autoplaySeconds: z.int().min(0).max(30).default(6),
          /** Second button «Pedir por WhatsApp» on the text panel. */
          whatsapp: z.boolean().default(false),
        })
        .default({ autoplaySeconds: 6, whatsapp: false }),
    }),
    z.object({
      type: z.literal("benefits"),
      ...sectionBase,
      settings: z.object({ items: z.array(benefitSchema).min(2, "Añade al menos dos.").max(4) }),
    }),
    z.object({
      type: z.literal("banner"),
      ...sectionBase,
      bannerIds: z.array(uuid).length(1, "Elige un banner."),
      settings: z.object({}).default({}),
    }),
    z.object({
      type: z.literal("banner_mosaic"),
      ...sectionBase,
      // Piece A is a banner with a photo; piece B is a second banner or a block in the secondary color.
      bannerIds: z.array(uuid).min(1, "Elige al menos un banner.").max(2),
      settings: z
        .object({
          block: z
            .object({
              eyebrow: optionalText(40),
              title: z.string().trim().min(1).max(80),
              text: optionalText(160),
              ctaLabel: optionalText(30),
              link: linkSchema.nullable().optional(),
              /** Big decorative text in the background, e.g. «30%». */
              bigText: optionalText(6),
            })
            .nullable()
            .default(null),
        })
        .default({ block: null }),
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
      type: z.literal("offer_countdown"),
      ...sectionBase,
      // endsAt is required (checked below): the section hides itself when the countdown reaches 0.
      source: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("collection"), id: uuid }),
        z.object({ kind: z.literal("on_sale") }),
      ]),
      settings: z
        .object({ text: optionalText(160), limit: z.int().min(2).max(6).default(3) })
        .default({ limit: 3 }),
    }),
    z.object({
      type: z.literal("featured_product"),
      ...sectionBase,
      settings: z.object({ productId: uuid, badge: optionalText(24) }),
    }),
    z.object({
      type: z.literal("category_grid"),
      ...sectionBase,
      settings: z.object({ categoryIds: z.array(uuid).max(12).default([]) }).default({ categoryIds: [] }),
    }),
    z.object({
      type: z.literal("collection_cards"),
      ...sectionBase,
      settings: z.object({ collectionIds: z.array(uuid).min(2, "Elige al menos dos colecciones.").max(6) }),
    }),
    z.object({
      type: z.literal("brand_strip"),
      ...sectionBase,
      settings: z.object({}).default({}),
    }),
    z.object({
      type: z.literal("testimonials"),
      ...sectionBase,
      settings: z.object({
        items: z.array(testimonialSchema).min(1, "Añade al menos una opinión.").max(9),
        /** Summary under the title («4,9 de 5 · 312 opiniones»), written by the owner. */
        summary: z
          .object({ rating: z.number().min(1).max(5), count: z.int().min(0) })
          .nullable()
          .default(null),
      }),
    }),
    z.object({
      type: z.literal("rich_text"),
      ...sectionBase,
      settings: z.object({
        markdown: z.string().max(RICH_TEXT_MAX),
        linkLabel: optionalText(40),
        link: linkSchema.nullable().optional(),
      }),
    }),
  ])
  .refine(scheduleCheck, scheduleMessage)
  .refine((v) => v.type !== "offer_countdown" || !!v.endsAt, {
    message: "La oferta necesita una fecha de fin.",
    path: ["endsAt"],
  });
export type HomeSectionInput = z.infer<typeof homeSectionInputSchema>;

/**
 * Sections of a new store (PRP-R D11, answer 4): created hidden, for the owner to fill in and turn on. Written as
 * rows (the hero and the mosaic still need banners, so they are not valid inputs until the owner picks them). No
 * «Cambios en 7 días»: a return policy is the store's to promise.
 */
export const DEFAULT_HOME_SECTIONS: {
  type: HomeSectionType;
  title: string | null;
  settings: Record<string, unknown>;
}[] = [
  { type: "hero_slider", title: null, settings: { autoplaySeconds: 6, whatsapp: true } },
  {
    type: "benefits",
    title: null,
    settings: {
      items: [
        { icon: "truck", title: "Envío a domicilio", text: "Te lo llevamos a casa" },
        { icon: "banknote", title: "Paga al recibir", text: "En efectivo o transferencia" },
        { icon: "message-circle", title: "Pide por WhatsApp", text: "Te atendemos al momento" },
      ],
    },
  },
  { type: "category_grid", title: "Compra por categoría", settings: { eyebrow: "Explora", categoryIds: [] } },
  {
    type: "product_carousel",
    title: "Novedades",
    settings: { eyebrow: "Recién llegados", limit: 8, sort: "newest" },
  },
  { type: "banner_mosaic", title: null, settings: { block: null } },
  {
    type: "rich_text",
    title: "Sobre nosotros",
    settings: { markdown: "Cuéntales a tus clientes quiénes sois y cómo trabajáis." },
  },
];

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

/** Store logo (Appearance): shown in the storefront header instead of the name and used as the app icon. */
export const storeLogoSchema = z.object({ logoUrl: z.url().max(500).nullable() });
export type StoreLogoInput = z.input<typeof storeLogoSchema>;

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
