import { z } from "zod";

// Store theme (D2, D3): stored in stores.theme, applied as CSS variables by the storefront layout.
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

export const THEME_RADII = { none: "0px", sm: "4px", md: "8px", lg: "14px", full: "9999px" } as const;
export type ThemeRadius = keyof typeof THEME_RADII;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color en formato #RRGGBB.");

export const themeColorsSchema = z.object({
  /** Buttons, links, highlights. */
  accent: hex,
  /** Text on top of accent. */
  accentFg: hex,
  background: hex,
  foreground: hex,
  /** Cards, header, footer. */
  surface: hex,
  /** Secondary text. */
  muted: hex,
  /** Borders. */
  line: hex,
});
export type ThemeColors = z.infer<typeof themeColorsSchema>;

export type ThemePreset = {
  label: string;
  colors: ThemeColors;
  headingFont: ThemeFont;
  bodyFont: ThemeFont;
  radius: ThemeRadius;
};

export const THEME_PRESETS = {
  kshop: {
    label: "Kshop",
    colors: {
      accent: "#5B21B6",
      accentFg: "#FFFFFF",
      background: "#FFFFFF",
      foreground: "#24104F",
      surface: "#F7F5FC",
      muted: "#5E5873",
      line: "#E6E1F2",
    },
    headingFont: "outfit",
    bodyFont: "dm-sans",
    radius: "lg",
  },
  classic: {
    label: "Clásico",
    colors: {
      accent: "#1F3A5F",
      accentFg: "#FFFFFF",
      background: "#FFFFFF",
      foreground: "#1A1A1A",
      surface: "#F4F4F2",
      muted: "#5C5C5C",
      line: "#E2E2DE",
    },
    headingFont: "playfair-display",
    bodyFont: "lora",
    radius: "sm",
  },
  minimal: {
    label: "Minimal",
    colors: {
      accent: "#111111",
      accentFg: "#FFFFFF",
      background: "#FFFFFF",
      foreground: "#111111",
      surface: "#F5F5F5",
      muted: "#5F5F5F",
      line: "#E5E5E5",
    },
    headingFont: "inter",
    bodyFont: "inter",
    radius: "none",
  },
  warm: {
    label: "Cálido",
    colors: {
      accent: "#B4441E",
      accentFg: "#FFFFFF",
      background: "#FFFBF5",
      foreground: "#3B2416",
      surface: "#F8EEE2",
      muted: "#6E5442",
      line: "#EBDCCB",
    },
    headingFont: "poppins",
    bodyFont: "dm-sans",
    radius: "md",
  },
  dark: {
    label: "Oscuro",
    colors: {
      accent: "#F2B705",
      accentFg: "#24104F",
      background: "#14101F",
      foreground: "#F5F3FA",
      surface: "#211A33",
      muted: "#B8B0CC",
      line: "#332A4A",
    },
    headingFont: "outfit",
    bodyFont: "dm-sans",
    radius: "lg",
  },
} as const satisfies Record<string, ThemePreset>;
export type ThemePresetKey = keyof typeof THEME_PRESETS;
const presetSchema = z.enum(Object.keys(THEME_PRESETS) as [ThemePresetKey, ...ThemePresetKey[]]);

/** What the admin saves: a preset plus optional overrides. */
export const themeInputSchema = z.object({
  preset: presetSchema.default("kshop"),
  colors: themeColorsSchema.partial().default({}),
  headingFont: fontSchema.optional(),
  bodyFont: fontSchema.optional(),
  radius: z.enum(Object.keys(THEME_RADII) as [ThemeRadius, ...ThemeRadius[]]).optional(),
});
export type ThemeInput = z.input<typeof themeInputSchema>;

export type Theme = {
  preset: ThemePresetKey;
  colors: ThemeColors;
  headingFont: ThemeFont;
  bodyFont: ThemeFont;
  radius: ThemeRadius;
};

/** Theme to render from whatever is stored (invalid or empty -> the Kshop preset). */
export function resolveTheme(stored: unknown): Theme {
  const parsed = themeInputSchema.safeParse(stored ?? {});
  const input = parsed.success ? parsed.data : themeInputSchema.parse({});
  const preset = THEME_PRESETS[input.preset];
  return {
    preset: input.preset,
    colors: { ...preset.colors, ...input.colors },
    headingFont: input.headingFont ?? preset.headingFont,
    bodyFont: input.bodyFont ?? preset.bodyFont,
    radius: input.radius ?? preset.radius,
  };
}

function luminance(color: string): number {
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

/** Pairs that must reach WCAG AA (4.5:1) for normal text; returned with their ratio when they do not. */
export function themeContrastIssues(colors: ThemeColors): { pair: string; ratio: number }[] {
  const pairs: [string, string, string][] = [
    ["Texto sobre fondo", colors.foreground, colors.background],
    ["Texto secundario sobre fondo", colors.muted, colors.background],
    ["Texto de los botones", colors.accentFg, colors.accent],
    ["Texto sobre tarjetas", colors.foreground, colors.surface],
  ];
  return pairs.map(([pair, fg, bg]) => ({ pair, ratio: contrastRatio(fg, bg) })).filter((p) => p.ratio < 4.5);
}
