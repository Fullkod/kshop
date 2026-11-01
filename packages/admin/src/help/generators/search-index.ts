import { HELP_ANCHORS, articleAnchor } from "../lib/help-utils";
import type { HelpAudience, HelpContent } from "../types";

/** One searchable entry of the Ayuda page. */
export interface HelpIndexEntry {
  kind: "article" | "glossary" | "faq" | "first-day";
  slug: string;
  title: string;
  summary: string;
  audiences: HelpAudience[];
  keywords: string[];
  /** Numbered steps (articles) or the answer/definition (others). */
  body: string[];
  /** Anchor on the Ayuda page that opens this entry. */
  anchor: string;
}

export interface HelpIndex {
  version: string;
  entries: HelpIndexEntry[];
}

/** Static index: built in memory by the page and emitted by `help:export` to `public/help/index.json`. */
export function helpToIndex(content: HelpContent): HelpIndex {
  const entries: HelpIndexEntry[] = [];
  for (const a of content.articles) {
    entries.push({
      kind: "article",
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      audiences: a.audiences,
      keywords: a.keywords,
      body: a.steps.map((s, i) => `${i + 1}. ${s.text}`),
      anchor: articleAnchor(a.slug),
    });
  }
  for (const s of content.firstDay) {
    entries.push({
      kind: "first-day",
      slug: `first-day-${s.id}`,
      title: s.title,
      summary: s.detail,
      audiences: s.audiences,
      keywords: [],
      body: [s.detail],
      anchor: HELP_ANCHORS.firstDay,
    });
  }
  content.glossary.forEach((g, i) => {
    entries.push({
      kind: "glossary",
      slug: `glossary-${i}`,
      title: g.term,
      summary: g.definition,
      audiences: g.audiences,
      keywords: g.badge ? [g.badge] : [],
      body: [g.definition],
      anchor: HELP_ANCHORS.glossary,
    });
  });
  content.faq.forEach((f, i) => {
    entries.push({
      kind: "faq",
      slug: `faq-${i}`,
      title: f.question,
      summary: f.answer,
      audiences: f.audiences,
      keywords: [],
      body: [f.answer],
      anchor: HELP_ANCHORS.faq,
    });
  });
  return { version: content.version, entries };
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Small ranked search: title beats keywords beats body; words of 2 letters or less are ignored. */
export function searchHelp(index: HelpIndex, query: string, limit = 8): HelpIndexEntry[] {
  const words = norm(query)
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return [];
  return index.entries
    .map((e) => {
      const title = norm(e.title);
      const keywords = e.keywords.map(norm);
      const body = norm([e.summary, ...e.body].join(" "));
      let score = 0;
      for (const w of words) {
        if (title.includes(w)) score += 5;
        if (keywords.some((k) => k.includes(w))) score += 4;
        if (body.includes(w)) score += 1;
      }
      return { e, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.e);
}
