// AÑADIDOS a packages/core/src/storefront/content.ts (no es un archivo completo).
// 7 tipos de sección nuevos para la portada. Se suman a HOME_SECTION_TYPES, HOME_SECTION_LABELS y
// al discriminatedUnion de homeSectionInputSchema. Reutiliza `sectionBase`, `uuid`, `optionalText`, `linkSchema`.

export const HOME_SECTION_TYPES = [
  "announcement_bar", // NUEVO — barra superior (encima de la cabecera; solo 1 activa)
  "hero_slider",
  "benefits", // NUEVO
  "category_grid",
  "product_carousel",
  "banner",
  "banner_mosaic", // NUEVO — 2 piezas: imagen + bloque de color
  "offer_countdown", // NUEVO
  "featured_product", // NUEVO
  "collection_cards", // NUEVO
  "brand_strip",
  "testimonials", // NUEVO
  "rich_text",
] as const;

export const HOME_SECTION_LABELS = {
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
} as const;

export const BENEFIT_ICONS = ["truck", "banknote", "message-circle", "refresh-ccw", "shield-check", "clock", "gift", "store"] as const;

// Añadir dentro de z.discriminatedUnion("type", [ ... ]):
/*
    z.object({
      type: z.literal("announcement_bar"),
      ...sectionBase,
      settings: z.object({
        text: z.string().trim().min(1).max(120),
        linkLabel: optionalText(40),
        link: linkSchema.nullable().optional(),
        icon: z.enum(BENEFIT_ICONS).default("truck"),
      }),
    }),
    z.object({
      type: z.literal("benefits"),
      ...sectionBase,
      settings: z.object({
        items: z.array(z.object({
          icon: z.enum(BENEFIT_ICONS),
          title: z.string().trim().min(1).max(40),
          text: optionalText(60),
        })).min(2).max(4),
      }),
    }),
    z.object({
      type: z.literal("banner_mosaic"),
      ...sectionBase,
      // Pieza A = banner con imagen; pieza B = bloque de color (secondary) con texto y botón, o un 2º banner.
      bannerIds: z.array(uuid).min(1).max(2),
      settings: z.object({
        block: z.object({
          eyebrow: optionalText(40),
          title: z.string().trim().min(1).max(80),
          text: optionalText(160),
          ctaLabel: optionalText(30),
          link: linkSchema.nullable().optional(),
          bigText: optionalText(6), // número decorativo de fondo, p. ej. "30%"
        }).nullable().default(null),
      }),
    }),
    z.object({
      type: z.literal("offer_countdown"),
      ...sectionBase,
      // endsAt de sectionBase es OBLIGATORIO aquí: la sección se oculta sola al llegar a 0.
      source: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("collection"), id: uuid }),
        z.object({ kind: z.literal("on_sale") }),
      ]),
      settings: z.object({
        eyebrow: optionalText(30), // "Oferta flash"
        text: optionalText(160),
        limit: z.int().min(2).max(6).default(3),
      }),
    }),
    z.object({
      type: z.literal("featured_product"),
      ...sectionBase,
      settings: z.object({ productId: uuid, eyebrow: optionalText(40), badge: optionalText(24) }),
    }),
    z.object({
      type: z.literal("collection_cards"),
      ...sectionBase,
      settings: z.object({ collectionIds: z.array(uuid).min(2).max(6) }),
    }),
    z.object({
      type: z.literal("testimonials"),
      ...sectionBase,
      settings: z.object({
        items: z.array(z.object({
          quote: z.string().trim().min(1).max(280),
          name: z.string().trim().min(1).max(60),
          place: optionalText(40),
          product: optionalText(60),
          rating: z.int().min(1).max(5).default(5),
        })).min(1).max(9),
        summary: z.object({ rating: z.number().min(1).max(5), count: z.int().min(0) }).nullable().default(null),
      }),
    }),
*/
// Además: refine extra para offer_countdown -> `endsAt` obligatorio.
// Migración SQL: si home_sections.type es un enum/check, ampliar con los 7 valores nuevos (+ test de RLS igual que el resto).
