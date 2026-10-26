"use client";

import {
  resolveTheme,
  THEME_FONTS,
  THEME_PRESETS,
  THEME_RADII,
  themeContrastIssues,
  type Theme,
  type ThemeColors,
  type ThemeFont,
  type ThemePresetKey,
  type ThemeRadius,
} from "@kshop/core";
import { Alert, Button, Card, Label } from "@kshop/ui";
import { useState } from "react";
import { useApiAction } from "@/features/catalog/use-catalog";
import { themeStyle, useStore } from "@kshop/storefront";
import type { AdminContent } from "../use-content";

const COLOR_LABELS: Record<keyof ThemeColors, string> = {
  accent: "Color principal (botones, enlaces)",
  accentFg: "Texto sobre el color principal",
  background: "Fondo",
  foreground: "Texto",
  surface: "Tarjetas, cabecera y pie",
  muted: "Texto secundario",
  line: "Bordes",
};
const RADIUS_LABELS: Record<ThemeRadius, string> = {
  none: "Rectas",
  sm: "Poco redondeadas",
  md: "Redondeadas",
  lg: "Muy redondeadas",
  full: "Píldora",
};

export function ThemeEditor({
  content,
  save,
}: {
  content: AdminContent;
  save: (theme: Theme) => Promise<unknown>;
}) {
  const store = useStore();
  const action = useApiAction();
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(content.theme));
  const [saved, setSaved] = useState(false);
  const issues = themeContrastIssues(theme.colors);

  const applyPreset = (preset: ThemePresetKey) => {
    const p = THEME_PRESETS[preset];
    setTheme({
      preset,
      colors: { ...p.colors },
      headingFont: p.headingFont,
      bodyFont: p.bodyFont,
      radius: p.radius,
    });
    setSaved(false);
  };
  const update = (patch: Partial<Theme>) => {
    setTheme((t) => ({ ...t, ...patch }));
    setSaved(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Estilo de partida</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(Object.keys(THEME_PRESETS) as ThemePresetKey[]).map((key) => {
              const p = THEME_PRESETS[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  aria-pressed={theme.preset === key}
                  className={`flex flex-col gap-2 rounded-md border p-2 text-left text-sm ${theme.preset === key ? "border-primary ring-2 ring-primary" : "hover:bg-surface"}`}
                >
                  <span className="flex gap-1" aria-hidden>
                    {[p.colors.accent, p.colors.background, p.colors.foreground, p.colors.surface].map(
                      (c, i) => (
                        <span key={i} className="h-5 w-5 rounded-full border" style={{ background: c }} />
                      ),
                    )}
                  </span>
                  {p.label}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="grid gap-3 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Colores</h2>
          {(Object.keys(COLOR_LABELS) as (keyof ThemeColors)[]).map((key) => (
            <label key={key} className="flex items-center gap-3 text-sm">
              <input
                type="color"
                value={theme.colors[key]}
                onChange={(e) => update({ colors: { ...theme.colors, [key]: e.target.value.toUpperCase() } })}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              {COLOR_LABELS[key]}
            </label>
          ))}
          {issues.length > 0 && (
            <Alert variant="destructive" className="sm:col-span-2">
              Poco contraste (se lee mal): {issues.map((i) => `${i.pair} (${i.ratio}:1)`).join(", ")}. Se
              recomienda al menos 4,5:1.
            </Alert>
          )}
        </Card>

        <Card className="grid gap-3 sm:grid-cols-3">
          <h2 className="font-semibold sm:col-span-3">Letra y forma</h2>
          {(["headingFont", "bodyFont"] as const).map((key) => (
            <div key={key} className="flex flex-col gap-1">
              <Label htmlFor={key}>{key === "headingFont" ? "Títulos" : "Texto"}</Label>
              <select
                id={key}
                value={theme[key]}
                onChange={(e) => update({ [key]: e.target.value as ThemeFont })}
                className="h-10 rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(THEME_FONTS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <Label htmlFor="radius">Esquinas</Label>
            <select
              id="radius"
              value={theme.radius}
              onChange={(e) => update({ radius: e.target.value as ThemeRadius })}
              className="h-10 rounded-md border bg-background px-2 text-sm"
            >
              {(Object.keys(THEME_RADII) as ThemeRadius[]).map((r) => (
                <option key={r} value={r}>
                  {RADIUS_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </Card>

        {action.error && <Alert variant="destructive">{action.error}</Alert>}
        {saved && <Alert variant="success">Tema guardado. La tienda ya lo muestra.</Alert>}
        <div>
          <Button
            disabled={action.pending}
            onClick={async () => {
              const ok = await action.run(() => save(theme));
              if (ok) setSaved(true);
            }}
          >
            {action.pending ? "Guardando…" : "Guardar tema"}
          </Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-2 text-sm font-medium">Vista previa</p>
        <div
          className="sf-root overflow-hidden rounded-md border"
          style={themeStyle(theme)}
          data-testid="theme-preview"
        >
          <div className="flex items-center justify-between border-b bg-surface px-4 py-3">
            <span className="sf-heading font-semibold">{store.name}</span>
            <span className="text-xs text-muted-foreground">Buscar</span>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <h3 className="text-xl font-semibold">Vestido de verano</h3>
            <p className="text-sm text-muted-foreground">Algodón, tallas S a L.</p>
            <p className="font-semibold">1500 CUP</p>
            <span className="rounded-[var(--sf-radius)] bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">
              Pedir por WhatsApp
            </span>
            <span className="rounded-[var(--sf-radius)] border px-4 py-2 text-center text-sm">Ver más</span>
          </div>
        </div>
      </div>
    </div>
  );
}
