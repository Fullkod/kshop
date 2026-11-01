"use client";

import { resolveTheme } from "@kshop/core";
import { Markdown, themeStyle } from "@kshop/storefront";
import { Button, Label } from "@kshop/ui";
import { useMemo, useRef } from "react";

type Edit = { text: string; start: number; end: number };

/** Wraps the selection (or a placeholder) in `before`…`after` and selects the inner text. */
function wrap(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): Edit {
  const inner = value.slice(start, end) || placeholder;
  const text = value.slice(0, start) + before + inner + after + value.slice(end);
  return { text, start: start + before.length, end: start + before.length + inner.length };
}

/** Puts `prefix` at the start of every selected line (numbered lists count up); removes it when all have it. */
function prefixLines(value: string, start: number, end: number, prefix: "## " | "### " | "- " | "1. "): Edit {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const toBreak = value.indexOf("\n", end);
  const to = toBreak === -1 ? value.length : toBreak;
  const lines = value.slice(from, to).split("\n");
  const marker =
    prefix === "1. " ? /^\d+\. / : new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const allHave = lines.every((l) => marker.test(l));
  const next = lines
    .map((l, i) => {
      const bare = l.replace(/^(#{2,3} |- |\d+\. )/, "");
      if (allHave) return bare;
      return (prefix === "1. " ? `${i + 1}. ` : prefix) + bare;
    })
    .join("\n");
  return { text: value.slice(0, from) + next + value.slice(to), start: from, end: from + next.length };
}

/** Inserts `block` as its own paragraph at the cursor and selects `select` inside it. */
function insertBlock(value: string, start: number, end: number, block: string, select: string): Edit {
  const before = value.slice(0, start).replace(/\s*$/, "");
  const after = value.slice(end).replace(/^\s*/, "");
  const head = before ? `${before}\n\n` : "";
  const text = `${head}${block}${after ? `\n\n${after}` : "\n"}`;
  const at = head.length + block.indexOf(select);
  return { text, start: at, end: at + select.length };
}

const TOOLS: { label: string; title: string; run: (v: string, s: number, e: number) => Edit }[] = [
  { label: "Negrita", title: "**texto**", run: (v, s, e) => wrap(v, s, e, "**", "**", "texto en negrita") },
  { label: "Cursiva", title: "*texto*", run: (v, s, e) => wrap(v, s, e, "*", "*", "texto en cursiva") },
  { label: "Título", title: "## Título", run: (v, s, e) => prefixLines(v, s, e, "## ") },
  { label: "Subtítulo", title: "### Subtítulo", run: (v, s, e) => prefixLines(v, s, e, "### ") },
  { label: "Lista", title: "- elemento", run: (v, s, e) => prefixLines(v, s, e, "- ") },
  { label: "Lista numerada", title: "1. paso", run: (v, s, e) => prefixLines(v, s, e, "1. ") },
  {
    label: "Enlace",
    title: "[texto](https://…)",
    run: (v, s, e) => {
      const edit = wrap(v, s, e, "[", "](https://)", "texto del enlace");
      const url = edit.end + 2;
      return { text: edit.text, start: url, end: url + "https://".length };
    },
  },
  {
    label: "Botón",
    title: "Un enlace solo en su párrafo se ve como botón",
    run: (v, s, e) => insertBlock(v, s, e, "[Ver productos](/products)", "Ver productos"),
  },
];

/** Page content (restricted Markdown) with a format toolbar and a live preview drawn with the store's theme. */
export function PageContentField({
  value,
  onChange,
  theme,
}: {
  value: string;
  onChange: (value: string) => void;
  theme: unknown;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const style = useMemo(() => themeStyle(resolveTheme(theme)), [theme]);

  function apply(tool: (typeof TOOLS)[number]) {
    const el = ref.current;
    if (!el) return;
    const edit = tool.run(value, el.selectionStart, el.selectionEnd);
    onChange(edit.text);
    // After React writes the new value: focus the field and select what the tool added.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(edit.start, edit.end);
    });
  }

  return (
    <div className="flex flex-col gap-2" data-testid="page-content-field">
      <Label htmlFor="page-content">Contenido</Label>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div role="toolbar" aria-label="Formato del texto" className="flex flex-wrap gap-1.5">
            {TOOLS.map((tool) => (
              <Button
                key={tool.label}
                type="button"
                variant="outline"
                size="sm"
                title={tool.title}
                onClick={() => apply(tool)}
              >
                {tool.label}
              </Button>
            ))}
          </div>
          <textarea
            id="page-content"
            ref={ref}
            rows={18}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-64 rounded-md border bg-background px-3 py-2 font-mono text-sm touch:text-base"
          />
          <p className="text-xs text-muted-foreground">
            Cada salto de línea se respeta. Un enlace solo en su párrafo se ve como botón (verde si lleva a
            WhatsApp, con un enlace wa.me). Bajo un título «Preguntas frecuentes», cada subtítulo es una
            pregunta que se abre y se cierra.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-medium">Vista previa</span>
          <div
            data-testid="page-preview"
            className="sf-root max-h-[34rem] min-h-64 overflow-y-auto rounded-md border bg-background p-5 text-foreground"
            style={style}
          >
            {value.trim() ? (
              <Markdown>{value}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">Escribe a la izquierda y aquí verás cómo queda.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
