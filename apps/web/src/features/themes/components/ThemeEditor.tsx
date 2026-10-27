"use client";

import {
  resolveTheme,
  THEME_FONTS,
  THEME_COLOR_FIELDS,
  THEME_PRESETS,
  THEME_RADII,
  THEME_RADIUS_LABELS,
  themeContrastIssues,
  type Theme,
  type ThemeButtonShape,
  type ThemeElevation,
  type ThemeFont,
  type ThemeHeadingCase,
  type ThemePresetKey,
  type ThemeRadius,
} from "@kshop/core";
import { Alert, Button, Card, CircleCheck, Label, Segmented, TriangleAlert } from "@kshop/ui";
import { useState, type ReactNode } from "react";
import { useApiAction } from "@/features/catalog/use-catalog";
import type { AdminContent } from "../use-content";
import { ThemePreview } from "./ThemePreview";

const SHAPE_OPTIONS: {
  key: "buttonShape" | "elevation" | "headingCase";
  label: string;
  options: { value: string; label: string }[];
}[] = [
  {
    key: "buttonShape",
    label: "Botones",
    options: [
      { value: "auto", label: "Como esquinas" },
      { value: "pill", label: "Píldora" },
    ] satisfies { value: ThemeButtonShape; label: string }[],
  },
  {
    key: "elevation",
    label: "Sombras",
    options: [
      { value: "flat", label: "Planas" },
      { value: "soft", label: "Suaves" },
      { value: "lifted", label: "Marcadas" },
    ] satisfies { value: ThemeElevation; label: string }[],
  },
  {
    key: "headingCase",
    label: "Títulos",
    options: [
      { value: "normal", label: "Normal" },
      { value: "uppercase", label: "MAYÚSCULAS" },
    ] satisfies { value: ThemeHeadingCase; label: string }[],
  },
];

const sectionTitle = "font-display text-base font-bold";

/**
 * Appearance › Tema (redesign R6): preset cards, the 12 colors by group, letters and shape, and a live preview of the
 * real storefront. Changing the preset drops the overrides. Contrast warns, it never blocks.
 */
export function ThemeEditor({
  content,
  save,
}: {
  content: AdminContent;
  save: (theme: Theme) => Promise<unknown>;
}) {
  const action = useApiAction();
  const [initial] = useState<Theme>(() => resolveTheme(content.theme));
  const [theme, setTheme] = useState<Theme>(initial);
  const [saved, setSaved] = useState(false);
  const issues = themeContrastIssues(theme.colors);

  const applyPreset = (preset: ThemePresetKey) => {
    setTheme(resolveTheme({ preset }));
    setSaved(false);
  };
  const update = (patch: Partial<Theme>) => {
    setTheme((t) => resolveTheme({ ...t, ...patch }));
    setSaved(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-[440px_1fr]">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 rounded-[14px]">
            <h2 className={sectionTitle}>Estilo de partida</h2>
            <div className="grid grid-cols-3 gap-2.5">
              {(Object.keys(THEME_PRESETS) as ThemePresetKey[]).map((key) => {
                const p = THEME_PRESETS[key];
                const selected = theme.preset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key)}
                    aria-pressed={selected}
                    className={`overflow-hidden rounded-[10px] border text-left ${selected ? "ring-2 ring-primary ring-offset-1" : "hover:border-primary"}`}
                  >
                    <span
                      className="flex h-[38px] items-end gap-1 p-2"
                      style={{ background: p.colors.accent }}
                      aria-hidden
                    >
                      {[p.colors.secondary, p.colors.ink].map((c, i) => (
                        <span
                          key={i}
                          className="size-3 rounded-full ring-1 ring-white/60"
                          style={{ background: c }}
                        />
                      ))}
                    </span>
                    <span className="block px-2 py-1.5 text-[12.5px] font-semibold">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="flex flex-col gap-4 rounded-[14px]">
            <div className="flex items-center justify-between">
              <h2 className={sectionTitle}>Colores</h2>
              <Button variant="ghost" size="sm" onClick={() => applyPreset(theme.preset)}>
                Restablecer
              </Button>
            </div>
            {THEME_COLOR_FIELDS.map((group) => (
              <fieldset key={group.group} className="flex flex-col gap-2">
                <legend className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  {group.group}
                </legend>
                <div className="grid grid-cols-2 gap-2.5">
                  {group.keys.map(({ key, label, help }) => (
                    <label key={key} className="flex items-center gap-2.5" title={help}>
                      <input
                        type="color"
                        value={theme.colors[key]}
                        onChange={(e) =>
                          update({ colors: { ...theme.colors, [key]: e.target.value.toUpperCase() } })
                        }
                        className="size-[30px] shrink-0 cursor-pointer rounded-md border"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[12.5px] font-semibold">{label}</span>
                        <span className="font-mono text-[10.5px] text-muted-foreground">
                          {theme.colors[key]}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </Card>

          <Card className="flex flex-col gap-4 rounded-[14px]">
            <h2 className={sectionTitle}>Letra y forma</h2>
            <div className="grid grid-cols-2 gap-3">
              {(["headingFont", "bodyFont"] as const).map((key) => (
                <div key={key} className="flex flex-col gap-1">
                  <Label htmlFor={key}>{key === "headingFont" ? "Títulos" : "Texto"}</Label>
                  <select
                    id={key}
                    value={theme[key]}
                    onChange={(e) => update({ [key]: e.target.value as ThemeFont })}
                    className="h-10 rounded-[9px] border bg-background px-2 text-sm"
                  >
                    {Object.entries(THEME_FONTS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <ShapeRow label="Esquinas">
              <Segmented
                label="Esquinas"
                value={theme.radius}
                onSelect={(radius) => update({ radius })}
                options={(Object.keys(THEME_RADII) as ThemeRadius[]).map((r) => ({
                  value: r,
                  label: THEME_RADIUS_LABELS[r],
                }))}
                className="flex-wrap"
              />
            </ShapeRow>
            {SHAPE_OPTIONS.map(({ key, label, options }) => (
              <ShapeRow key={key} label={label}>
                <Segmented
                  label={label}
                  value={theme[key]}
                  onSelect={(v) => update({ [key]: v })}
                  options={options}
                />
              </ShapeRow>
            ))}
          </Card>
        </div>

        <ThemePreview theme={theme} />
      </div>

      <Card className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-[14px]">
        {issues.length === 0 ? (
          <span
            className="flex flex-1 items-center gap-2 text-sm font-medium text-success"
            data-testid="contrast-ok"
          >
            <CircleCheck size={17} aria-hidden />
            Contraste correcto en todas las parejas
          </span>
        ) : (
          <span
            className="flex flex-1 items-start gap-2 text-sm text-destructive"
            data-testid="contrast-issues"
          >
            <TriangleAlert size={17} aria-hidden className="mt-0.5 shrink-0" />
            Poco contraste (se lee mal): {issues.map((i) => `${i.pair} (${i.ratio}:1)`).join(", ")}. Se
            recomienda al menos 4,5:1.
          </span>
        )}
        {saved && <span className="text-sm text-success">Tema guardado. La tienda ya lo muestra.</span>}
        <Button
          variant="ghost"
          onClick={() => {
            setTheme(initial);
            setSaved(false);
          }}
        >
          Descartar
        </Button>
        <Button
          disabled={action.pending}
          onClick={async () => {
            const ok = await action.run(() => save(theme));
            if (ok) setSaved(true);
          }}
        >
          {action.pending ? "Guardando…" : "Guardar tema"}
        </Button>
        {action.error && (
          <Alert variant="destructive" className="w-full">
            {action.error}
          </Alert>
        )}
      </Card>
    </div>
  );
}

function ShapeRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
