import { readableOn, THEME_RADII, type Theme, type ThemeFont } from "@kshop/core";
import type { CSSProperties } from "react";

// Store theme v2 as CSS variables on the storefront root (.sf-root).
// @kshop/ui tokens read --bg, --fg, --accent…; the storefront reads --sf-*.
// Editable = the 12 theme colors. Derived = computed here, never stored.

const FONT_VARIABLE: Record<ThemeFont, string> = {
  outfit: "--font-outfit",
  "dm-sans": "--font-dm-sans",
  inter: "--font-inter",
  poppins: "--font-poppins",
  lora: "--font-lora",
  "playfair-display": "--font-playfair-display",
};

const SERIF: ThemeFont[] = ["lora", "playfair-display"];
const fontStack = (font: ThemeFont) =>
  `var(${FONT_VARIABLE[font]}), ${SERIF.includes(font) ? "ui-serif, Georgia, serif" : "ui-sans-serif, system-ui, sans-serif"}`;

const mix = (a: string, b: string, pct: number) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

export function themeStyle(theme: Theme): CSSProperties {
  const c = theme.colors;
  const dark = theme.isDark;
  const r = THEME_RADII[theme.radius];
  const sh = `color-mix(in srgb, ${dark ? "#000" : c.foreground} ${dark ? 60 : 18}%, transparent)`;
  const elevation = {
    flat: ["none", `0 0 0 1px ${c.line}`],
    soft: [`0 1px 2px ${sh}, 0 8px 24px -14px ${sh}`, `0 24px 60px -24px ${sh}`],
    lifted: [`0 2px 4px ${sh}, 0 14px 32px -12px ${sh}`, `0 32px 80px -20px ${sh}`],
  }[theme.elevation];

  return {
    // Editable
    "--bg": c.background,
    "--fg": c.foreground,
    "--surface": c.surface,
    "--muted": c.muted,
    "--line": c.line,
    "--accent": c.accent,
    "--accent-fg": c.accentFg,
    "--secondary": c.secondary,
    "--secondary-fg": c.secondaryFg,
    "--ink": c.ink,
    "--ink-fg": c.inkFg,
    "--sale": c.sale,
    // Derived
    "--accent-hover": mix(c.accent, dark ? "#fff" : "#000", 86),
    "--accent-soft": mix(c.accent, c.background, 12),
    "--secondary-soft": mix(c.secondary, c.background, 20),
    "--sale-soft": mix(c.sale, c.background, 12),
    "--sale-fg": readableOn(c.sale),
    "--surface-2": mix(c.line, c.surface, 45),
    "--ink-muted": mix(c.inkFg, c.ink, 70),
    "--ring": mix(c.accent, "transparent", 45),
    "--scrim": mix(c.ink, "transparent", 72),
    // Status colors: the admin palette on :root switches with the OS dark mode, the store theme does not.
    ...(dark
      ? {
          "--ok": "#6FD39C",
          "--ok-bg": "#17321F",
          "--bad": "#FF8F95",
          "--bad-bg": "#3A1A1E",
          "--warn": "#F5C451",
          "--warn-bg": "#3A2E12",
        }
      : {
          "--ok": "#1F7A4D",
          "--ok-bg": "#E3F4EA",
          "--bad": "#A3262E",
          "--bad-bg": "#FBE6E7",
          "--warn": "#8A5A00",
          "--warn-bg": "#FFF3D6",
        }),
    "--wa": "#1FA855",
    // Type and shape
    "--sf-heading": fontStack(theme.headingFont),
    "--sf-body": fontStack(theme.bodyFont),
    "--sf-case": theme.headingCase,
    "--sf-track": theme.headingCase === "uppercase" ? "0.04em" : "-0.015em",
    "--sf-radius-sm": r.sm,
    "--sf-radius": r.md,
    "--sf-radius-lg": r.lg,
    "--sf-btn-radius": theme.buttonShape === "pill" ? "9999px" : r.btn,
    "--sf-shadow": elevation[0],
    "--sf-shadow-lg": elevation[1],
    colorScheme: dark ? "dark" : "light",
  } as CSSProperties;
}
