import { THEME_RADII, type Theme, type ThemeFont } from "@kshop/core";
import type { CSSProperties } from "react";

// The store theme as CSS variables on the storefront root: @kshop/ui tokens read --bg, --fg, --accent…,
// the storefront CSS reads --sf-heading / --sf-body / --sf-radius.

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

export function themeStyle(theme: Theme): CSSProperties {
  const c = theme.colors;
  return {
    "--bg": c.background,
    "--fg": c.foreground,
    "--surface": c.surface,
    "--muted": c.muted,
    "--line": c.line,
    "--accent": c.accent,
    "--accent-fg": c.accentFg,
    "--accent-soft": `color-mix(in srgb, ${c.accent} 12%, ${c.background})`,
    "--sf-heading": fontStack(theme.headingFont),
    "--sf-body": fontStack(theme.bodyFont),
    "--sf-radius": THEME_RADII[theme.radius],
    colorScheme: theme.preset === "dark" ? "dark" : "light",
  } as CSSProperties;
}
