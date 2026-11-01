import { HELP_ANCHORS, articleAnchor, inScope, type HelpScope } from "../lib/help-utils";
import type { HelpArticle, HelpAudience, HelpContent } from "../types";
import { HELP_AUDIENCE_LABEL } from "../types";

export interface MarkdownOptions {
  /** Store help (owners and staff, the default) or the superadmin's. */
  scope?: HelpScope;
  /** Only content for this audience; omit for everything in the scope. */
  audience?: HelpAudience;
  /** Prefix for screenshot paths (e.g. the platform URL); default: relative to the site root. */
  screenshotBase?: string;
  /** Date label already formatted (never call `new Date()` in render paths). */
  generatedOn?: string;
}

function select<T extends { audiences: HelpAudience[] }>(
  items: T[],
  scope: HelpScope,
  audience?: HelpAudience,
): T[] {
  return items.filter((i) => inScope(i.audiences, scope) && (!audience || i.audiences.includes(audience)));
}

function shot(slug: string | undefined, base: string): string {
  return slug ? `\n\n   ![](${base}/help/screens/${slug}.png)` : "";
}

/** Plain `<a id>` anchors: `{#id}` heading ids are not standard Markdown. */
function heading(level: "##" | "###", title: string, anchor: string): string {
  return `<a id="${anchor}"></a>\n\n${level} ${title}`;
}

function articleMarkdown(a: HelpArticle, base: string, byAudience: boolean): string {
  const aud = byAudience ? "" : ` _(${a.audiences.map((x) => HELP_AUDIENCE_LABEL[x]).join(" · ")})_`;
  const steps = a.steps.map((s, i) => `${i + 1}. ${s.text}${shot(s.screenshot, base)}`).join("\n");
  const tips = a.tips?.length ? `\n\n**Consejos**\n\n${a.tips.map((t) => `- ${t}`).join("\n")}` : "";
  const related = a.related?.length
    ? `\n\n_Relacionado: ${a.related.map((r) => `[${r}](#${articleAnchor(r)})`).join(", ")}_`
    : "";
  return `${heading("###", `${a.title}${aud}`, articleAnchor(a.slug))}\n\n${a.summary}\n\n${steps}${tips}${related}`;
}

/** The whole help as one Markdown document (what people download or print). */
export function helpToMarkdown(content: HelpContent, opts: MarkdownOptions = {}): string {
  const base = (opts.screenshotBase ?? "").replace(/\/$/, "");
  const scope = opts.scope ?? "store";
  const aud = opts.audience ?? (scope === "superadmin" ? "superadmin" : undefined);
  const out: string[] = [];
  out.push(`# ${aud ? `Ayuda de Kshop: ${HELP_AUDIENCE_LABEL[aud]}` : "Ayuda de Kshop"}`);
  out.push(
    `Versión ${content.version}${opts.generatedOn ? ` · generada el ${opts.generatedOn}` : ""}. ` +
      "Sale del mismo contenido que la ayuda del admin (menú › Ayuda o el botón «?» de cada pantalla).",
  );

  const firstDay = select(content.firstDay, scope, aud);
  if (firstDay.length) {
    out.push(heading("##", "Tu primer día", HELP_ANCHORS.firstDay));
    out.push("Haz estos pasos el primer día y la tienda queda lista para vender.");
    out.push(
      firstDay
        .map(
          (s) =>
            `- [ ] **${s.title}**: ${s.detail}${s.link ? ` (${s.link})` : ""}${shot(s.screenshot, base)}`,
        )
        .join("\n"),
    );
  }

  const articles = select(content.articles, scope, aud);
  if (articles.length) {
    out.push(heading("##", "Guías", HELP_ANCHORS.guides));
    out.push(articles.map((a) => `- [${a.title}](#${articleAnchor(a.slug)})`).join("\n"));
    for (const a of articles) out.push(articleMarkdown(a, base, !!aud));
  }

  const glossary = select(content.glossary, scope, aud);
  if (glossary.length) {
    out.push(heading("##", "Glosario", HELP_ANCHORS.glossary));
    out.push(
      glossary
        .map(
          (g) =>
            `- **${g.term}**${g.badge ? ` (${g.badge})` : ""}: ${g.definition}${shot(g.screenshot, base)}`,
        )
        .join("\n"),
    );
  }

  const faq = select(content.faq, scope, aud);
  if (faq.length) {
    out.push(heading("##", "Preguntas frecuentes", HELP_ANCHORS.faq));
    out.push(faq.map((f) => `**${f.question}**\n\n${f.answer}`).join("\n\n"));
  }

  return out.join("\n\n") + "\n";
}
