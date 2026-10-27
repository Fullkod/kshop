import { z } from "zod";

// Store theme v2 (rediseño 2026-10): stored in stores.theme, applied as CSS variables by the storefront layout.
// Retrocompatible con v1: todo lo nuevo es opcional y sale del preset. Reemplaza packages/core/src/storefront/theme.ts.
// Fonts are a closed list because the web app loads them statically with next/font.

export const THEME_FONTS = {
  outfit: "Outfit",
  "dm-sans": "DM Sans",
  inter: "Inter",
  poppins: "Poppins",
  lora: "Lora",
  "playfair-display": "Playfair Display",
} as const;
export type ThemeFont = keyof typeof THEME_FONTS;
const fontSchema = z.enum(Object.keys(THEME_FONTS) as [ThemeFont, ...ThemeFont[]]);

/** v2: un radio por pieza (sm = etiquetas/miniaturas, md = tarjetas, lg = banners/bloques, btn = botones/campos). */
export const THEME_RADII = {
  none: { sm: "0px", md: "0px", lg: "0px", btn: "0px" },
  sm: { sm: "2px", md: "4px", lg: "6px", btn: "4px" },
  md: { sm: "4px", md: "8px", lg: "12px", btn: "8px" },
  lg: { sm: "8px", md: "14px", lg: "22px", btn: "12px" },
  full: { sm: "10px", md: "20px", lg: "28px", btn: "9999px" },
} as const;
export type ThemeRadius = keyof typeof THEME_RADII;
export const THEME_RADIUS_LABELS: Record<ThemeRadius, string> = {
  none: "Rectas",
  sm: "Suaves",
  md: "Medias",
  lg: "Redondas",
  full: "Píldora",
};

export const THEME_BUTTON_SHAPES = ["auto", "pill"] as const;
export type ThemeButtonShape = (typeof THEME_BUTTON_SHAPES)[number];
export const THEME_ELEVATIONS = ["flat", "soft", "lifted"] as const;
export type ThemeElevation = (typeof THEME_ELEVATIONS)[number];
export const THEME_HEADING_CASES = ["normal", "uppercase"] as const;
export type ThemeHeadingCase = (typeof THEME_HEADING_CASES)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color en formato #RRGGBB.");

export const themeColorsSchema = z.object({
  /** Buttons, links, selection, hero background. */
  accent: hex,
  /** Text on top of accent. */
  accentFg: hex,
  /** NEW — "Nuevo" badges, stars, cart counter, details. */
  secondary: hex,
  /** NEW — text on top of secondary. */
  secondaryFg: hex,
  background: hex,
  /** Cards, bands, inputs. */
  surface: hex,
  /** NEW — contrast band: announcement bar, footer, dark blocks, collection cards. */
  ink: hex,
  /** NEW — text on top of ink. */
  inkFg: hex,
  foreground: hex,
  /** Secondary text. */
  muted: hex,
  /** Borders. */
  line: hex,
  /** NEW — sale price, -% badge, countdown. */
  sale: hex,
});
export type ThemeColors = z.infer<typeof themeColorsSchema>;
export type ThemeColorKey = keyof ThemeColors;

/** Labels for the admin editor, grouped as in Apariencia › Tema. */
export const THEME_COLOR_FIELDS: { group: string; keys: { key: ThemeColorKey; label: string; help: string }[] }[] = [
  {
    group: "Marca",
    keys: [
      { key: "accent", label: "Acento", help: "Botones, enlaces, portada" },
      { key: "accentFg", label: "Texto sobre acento", help: "Texto e iconos encima del acento" },
      { key: "secondary", label: "Secundario", help: "Etiquetas «Nuevo», estrellas, contador del carrito" },
      { key: "secondaryFg", label: "Texto sobre secundario", help: "Texto encima del secundario" },
    ],
  },
  {
    group: "Superficies",
    keys: [
      { key: "background", label: "Fondo", help: "Fondo de página" },
      { key: "surface", label: "Superficie", help: "Tarjetas, bandas, campos" },
      { key: "ink", label: "Banda de contraste", help: "Barra de anuncio, pie, bloques oscuros" },
      { key: "inkFg", label: "Texto sobre banda", help: "Texto encima de la banda" },
    ],
  },
  {
    group: "Texto",
    keys: [
      { key: "foreground", label: "Texto", help: "Títulos y texto principal" },
      { key: "muted", label: "Texto secundario", help: "Marcas, ayudas, metadatos" },
      { key: "line", label: "Bordes", help: "Bordes y divisores" },
      { key: "sale", label: "Oferta", help: "Precio rebajado, % de descuento, cuenta atrás" },
    ],
  },
];

export type ThemePreset = {
  label: string;
  colors: ThemeColors;
  headingFont: ThemeFont;
  bodyFont: ThemeFont;
  radius: ThemeRadius;
  buttonShape: ThemeButtonShape;
  elevation: ThemeElevation;
  headingCase: ThemeHeadingCase;
};

export const THEME_PRESETS = {
  kshop: {
    label: "Kshop",
    colors: {
      accent: "#5B21B6", accentFg: "#FFFFFF", secondary: "#F2B705", secondaryFg: "#24104F",
      background: "#FFFFFF", surface: "#F7F5FC", ink: "#24104F", inkFg: "#FFFFFF",
      foreground: "#24104F", muted: "#5E5873", line: "#E6E1F2", sale: "#C42350",
    },
    headingFont: "outfit", bodyFont: "dm-sans", radius: "lg", buttonShape: "auto", elevation: "soft", headingCase: "normal",
  },
  classic: {
    label: "Clásico",
    colors: {
      accent: "#1F3A5F", accentFg: "#FFFFFF", secondary: "#B08D57", secondaryFg: "#1A1A1A",
      background: "#FFFFFF", surface: "#F4F4F2", ink: "#1F3A5F", inkFg: "#FFFFFF",
      foreground: "#1A1A1A", muted: "#5C5C5C", line: "#E2E2DE", sale: "#9E2B25",
    },
    headingFont: "playfair-display", bodyFont: "lora", radius: "sm", buttonShape: "auto", elevation: "flat", headingCase: "normal",
  },
  minimal: {
    label: "Minimal",
    colors: {
      accent: "#111111", accentFg: "#FFFFFF", secondary: "#E9E9E6", secondaryFg: "#111111",
      background: "#FFFFFF", surface: "#F5F5F5", ink: "#111111", inkFg: "#FFFFFF",
      foreground: "#111111", muted: "#5F5F5F", line: "#E5E5E5", sale: "#D11A1A",
    },
    headingFont: "inter", bodyFont: "inter", radius: "none", buttonShape: "auto", elevation: "flat", headingCase: "uppercase",
  },
  warm: {
    label: "Cálido",
    colors: {
      accent: "#B4441E", accentFg: "#FFFFFF", secondary: "#E8A33D", secondaryFg: "#3B2416",
      background: "#FFFBF5", surface: "#F8EEE2", ink: "#3B2416", inkFg: "#FFFBF5",
      foreground: "#3B2416", muted: "#6E5442", line: "#EBDCCB", sale: "#A3262E",
    },
    headingFont: "poppins", bodyFont: "dm-sans", radius: "md", buttonShape: "auto", elevation: "soft", headingCase: "normal",
  },
  fresh: {
    label: "Fresco",
    colors: {
      accent: "#0F7B4F", accentFg: "#FFFFFF", secondary: "#FF8A3D", secondaryFg: "#2A1A0A",
      background: "#FFFFFF", surface: "#F1F7F3", ink: "#0F3D2A", inkFg: "#FFFFFF",
      foreground: "#12261C", muted: "#4F6158", line: "#DCE7DF", sale: "#C93A1C",
    },
    headingFont: "poppins", bodyFont: "dm-sans", radius: "full", buttonShape: "pill", elevation: "soft", headingCase: "normal",
  },
  dark: {
    label: "Oscuro",
    colors: {
      accent: "#F2B705", accentFg: "#24104F", secondary: "#B79CFF", secondaryFg: "#14101F",
      background: "#14101F", surface: "#211A33", ink: "#0B0814", inkFg: "#F5F3FA",
      foreground: "#F5F3FA", muted: "#B8B0CC", line: "#332A4A", sale: "#FF7A93",
    },
    headingFont: "outfit", bodyFont: "dm-sans", radius: "lg", buttonShape: "auto", elevation: "lifted", headingCase: "normal",
  },
} as const satisfies Record<string, ThemePreset>;
export type ThemePresetKey = keyof typeof THEME_PRESETS;
const presetSchema = z.enum(Object.keys(THEME_PRESETS) as [ThemePresetKey, ...ThemePresetKey[]]);

/** What the admin saves: a preset plus optional overrides. v1 documents stay valid. */
export const themeInputSchema = z.object({
  preset: presetSchema.default("kshop"),
  colors: themeColorsSchema.partial().default({}),
  headingFont: fontSchema.optional(),
  bodyFont: fontSchema.optional(),
  radius: z.enum(Object.keys(THEME_RADII) as [ThemeRadius, ...ThemeRadius[]]).optional(),
  buttonShape: z.enum(THEME_BUTTON_SHAPES).optional(),
  elevation: z.enum(THEME_ELEVATIONS).optional(),
  headingCase: z.enum(THEME_HEADING_CASES).optional(),
});
export type ThemeInput = z.input<typeof themeInputSchema>;

export type Theme = {
  preset: ThemePresetKey;
  colors: ThemeColors;
  headingFont: ThemeFont;
  bodyFont: ThemeFont;
  radius: ThemeRadius;
  buttonShape: ThemeButtonShape;
  elevation: ThemeElevation;
  headingCase: ThemeHeadingCase;
  /** Derived from the background luminance (no longer `preset === "dark"`). */
  isDark: boolean;
};

/** Theme to render from whatever is stored (invalid or empty -> the Kshop preset). */
export function resolveTheme(stored: unknown): Theme {
  const parsed = themeInputSchema.safeParse(stored ?? {});
  const input = parsed.success ? parsed.data : themeInputSchema.parse({});
  const preset = THEME_PRESETS[input.preset];
  const colors = { ...preset.colors, ...input.colors };
  return {
    preset: input.preset,
    colors,
    headingFont: input.headingFont ?? preset.headingFont,
    bodyFont: input.bodyFont ?? preset.bodyFont,
    radius: input.radius ?? preset.radius,
    buttonShape: input.buttonShape ?? preset.buttonShape,
    elevation: input.elevation ?? preset.elevation,
    headingCase: input.headingCase ?? preset.headingCase,
    isDark: luminance(colors.background) < 0.2,
  };
}

export function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between two #RRGGBB colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** White or near-black, whichever contrasts more (used for --sale-fg). */
export function readableOn(color: string): "#FFFFFF" | "#111111" {
  return contrastRatio(color, "#FFFFFF") >= contrastRatio(color, "#111111") ? "#FFFFFF" : "#111111";
}

/** Pairs that must reach WCAG AA (4.5:1) for normal text; returned with their ratio when they do not. */
export function themeContrastIssues(colors: ThemeColors): { pair: string; ratio: number }[] {
  const pairs: [string, string, string][] = [
    ["Texto sobre fondo", colors.foreground, colors.background],
    ["Texto secundario sobre fondo", colors.muted, colors.background],
    ["Texto de los botones", colors.accentFg, colors.accent],
    ["Texto sobre secundario", colors.secondaryFg, colors.secondary],
    ["Texto sobre banda", colors.inkFg, colors.ink],
    ["Texto sobre tarjetas", colors.foreground, colors.surface],
  ];
  return pairs.map(([pair, fg, bg]) => ({ pair, ratio: contrastRatio(fg, bg) })).filter((p) => p.ratio < 4.5);
}
