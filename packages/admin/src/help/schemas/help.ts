import { z } from "zod";
import { HELP_CONTEXTS, type HelpContent } from "../types";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug en kebab-case");
const audience = z.enum(["owner", "staff", "superadmin"]);
const context = z.enum(HELP_CONTEXTS);
const text = z.string().trim().min(1);
const route = z.string().regex(/^\/(admin|superadmin)(\/|$|\?)/, "ruta del admin o del superadmin");

export const screenshotSpecSchema = z.object({
  slug,
  description: text,
  route,
  viewport: z.enum(["desktop", "mobile"]),
  setup: z.array(text).optional(),
});

export const helpStepSchema = z.object({ text, screenshot: slug.optional() });

export const helpArticleSchema = z.object({
  slug,
  title: text,
  summary: text,
  audiences: z.array(audience).min(1),
  keywords: z.array(text).min(1),
  contexts: z.array(context).optional(),
  steps: z.array(helpStepSchema).min(2, "una guía tiene al menos dos pasos"),
  tips: z.array(text).optional(),
  related: z.array(slug).optional(),
});

export const firstDayStepSchema = z.object({
  id: slug,
  title: text,
  detail: text,
  audiences: z.array(audience).min(1),
  link: route.optional(),
  screenshot: slug.optional(),
});

export const glossaryEntrySchema = z.object({
  term: text,
  badge: text.optional(),
  definition: text,
  audiences: z.array(audience).min(1),
  related: z.array(slug).optional(),
  screenshot: slug.optional(),
});

export const faqEntrySchema = z.object({
  question: text,
  answer: text,
  audiences: z.array(audience).min(1),
  related: z.array(slug).optional(),
});

export const helpContentSchema = z.object({
  version: text,
  screenshots: z.array(screenshotSpecSchema),
  firstDay: z.array(firstDayStepSchema).min(1),
  articles: z.array(helpArticleSchema).min(20, "la ayuda tiene al menos 20 guías"),
  glossary: z.array(glossaryEntrySchema).min(1),
  faq: z.array(faqEntrySchema).min(1),
});

/** Voseo is a bug in Kshop's copy: the readers are Cuban, «tú». */
// Unicode boundaries on purpose: JS `\b` treats «é» as a non-letter. No -ir imperatives (subí, elegí, abrí,
// escribí): they are also the «yo» preterite («Subí un producto…»).
export const VOSEO =
  /(?<!\p{L})(vos|creá|podés|sos|tenés|ingresá|configurá|pedile|hacé|mirá|tocá|usá|querés|sabés|marcá|activá|guardá|agregá)(?!\p{L})/iu;

/**
 * Validates shape AND cross references: unique slugs, related/screenshot slugs that exist, every declared
 * screenshot used, and no voseo anywhere in the copy. Throws with every problem listed.
 */
export function validateHelpContent(input: HelpContent): HelpContent {
  const parsed = helpContentSchema.safeParse(input);
  const problems: string[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues) problems.push(`${issue.path.join(".")}: ${issue.message}`);
  }
  const content = parsed.success ? parsed.data : input;

  const shots = new Set<string>();
  for (const s of content.screenshots) {
    if (shots.has(s.slug)) problems.push(`captura duplicada: ${s.slug}`);
    shots.add(s.slug);
  }
  const articles = new Set<string>();
  for (const a of content.articles) {
    if (articles.has(a.slug)) problems.push(`guía duplicada: ${a.slug}`);
    articles.add(a.slug);
  }
  const ids = new Set<string>();
  for (const s of content.firstDay) {
    if (ids.has(s.id)) problems.push(`paso de primer día duplicado: ${s.id}`);
    ids.add(s.id);
  }

  const checkShot = (where: string, s?: string) => {
    if (s && !shots.has(s)) problems.push(`${where}: la captura "${s}" no está declarada en screenshots`);
  };
  const checkRelated = (where: string, rel?: string[]) => {
    for (const r of rel ?? [])
      if (!articles.has(r)) problems.push(`${where}: la guía relacionada "${r}" no existe`);
  };
  const checkCopy = (where: string, ...texts: (string | undefined)[]) => {
    for (const t of texts) {
      const m = t?.match(VOSEO);
      if (m) problems.push(`${where}: voseo ("${m[0]}"), el texto va con «tú»`);
    }
  };

  for (const a of content.articles) {
    checkRelated(`guía ${a.slug}`, a.related);
    if (a.related?.includes(a.slug)) problems.push(`guía ${a.slug}: se cita a sí misma en related`);
    checkCopy(`guía ${a.slug}`, a.title, a.summary, ...(a.tips ?? []));
    a.steps.forEach((st, i) => {
      checkShot(`guía ${a.slug} paso ${i + 1}`, st.screenshot);
      checkCopy(`guía ${a.slug} paso ${i + 1}`, st.text);
    });
  }
  for (const s of content.firstDay) {
    checkShot(`primer día ${s.id}`, s.screenshot);
    checkCopy(`primer día ${s.id}`, s.title, s.detail);
  }
  for (const g of content.glossary) {
    checkShot(`glosario ${g.term}`, g.screenshot);
    checkRelated(`glosario ${g.term}`, g.related);
    checkCopy(`glosario ${g.term}`, g.definition);
  }
  for (const f of content.faq) {
    checkRelated(`faq "${f.question}"`, f.related);
    checkCopy(`faq "${f.question}"`, f.question, f.answer);
  }
  for (const s of content.screenshots) checkCopy(`captura ${s.slug}`, s.description);

  const used = new Set<string>();
  content.articles.forEach((a) => a.steps.forEach((s) => s.screenshot && used.add(s.screenshot)));
  content.firstDay.forEach((s) => s.screenshot && used.add(s.screenshot));
  content.glossary.forEach((g) => g.screenshot && used.add(g.screenshot));
  for (const s of shots) if (!used.has(s)) problems.push(`la captura "${s}" está declarada pero nada la usa`);

  if (problems.length > 0) {
    throw new Error(`Contenido de ayuda inválido:\n- ${problems.join("\n- ")}`);
  }
  return content;
}
