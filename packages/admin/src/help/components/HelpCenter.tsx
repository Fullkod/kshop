"use client";

import { buttonVariants, cn, Download, Input, Search, Segmented } from "@kshop/ui";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { helpContentRaw } from "../content/raw";
import { helpToIndex, searchHelp } from "../generators/search-index";
import { loadHelpAudience, saveHelpAudience, subscribeHelpStorage } from "../lib/first-day-progress";
import {
  HELP_ANCHORS,
  HELP_MARKDOWN_FILES,
  HELP_GUIDE_PLANS,
  HELP_PDF_FILE,
  helpGuideFile,
  articleAnchor,
  inScope,
  matchesAudience,
  type HelpAudienceFilter,
  type HelpScope,
} from "../lib/help-utils";
import type { HelpAudience } from "../types";
import { FirstDayChecklist } from "./FirstDayChecklist";
import { HelpArticleCard } from "./HelpArticleCard";
import type { HelpLinkComponent } from "./HelpLink";

const FILTERS = [
  { value: "all", label: "Todo" },
  { value: "owner", label: "Dueño" },
  { value: "staff", label: "Empleado" },
] as const satisfies readonly { value: HelpAudienceFilter; label: string }[];

function subscribeHash(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

const readHash = () => window.location.hash.slice(1);

/**
 * The Ayuda page (KSH0005): search, audience filter (store help only; it starts on the reader's role and remembers
 * the choice), «Tu primer día», guides with their index, glossary and FAQ. Same component on the web and in
 * Kshop Admin.
 */
export function HelpCenter({
  scope,
  viewer,
  screenshotBase,
  linkAs,
}: {
  scope: HelpScope;
  /** The reader's role: the default filter. */
  viewer: HelpAudience;
  screenshotBase?: string;
  linkAs: HelpLinkComponent;
}) {
  const saved = useSyncExternalStore(subscribeHelpStorage, loadHelpAudience, () => null);
  const [picked, setPicked] = useState<HelpAudienceFilter | null>(null);
  const savedFilter = FILTERS.find((f) => f.value === saved)?.value;
  const filter: HelpAudienceFilter = scope === "store" ? (picked ?? savedFilter ?? viewer) : "all";
  const [query, setQuery] = useState("");
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "");

  // A link to #guia-… (search, «Relacionado», the «?» dialog) unfolds that guide and scrolls to it.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el instanceof HTMLDetailsElement) el.open = true;
    el?.scrollIntoView({ block: "start" });
  }, [hash]);

  const show = (audiences: HelpAudience[]) =>
    inScope(audiences, scope) && (scope === "superadmin" || matchesAudience(audiences, filter));
  const articles = helpContentRaw.articles.filter((a) => show(a.audiences));
  const firstDay = scope === "store" ? helpContentRaw.firstDay.filter((s) => show(s.audiences)) : [];
  const glossary = helpContentRaw.glossary.filter((g) => show(g.audiences));
  const faq = helpContentRaw.faq.filter((f) => show(f.audiences));
  const titles = useMemo(() => new Map(helpContentRaw.articles.map((a) => [a.slug, a.title])), []);
  const index = useMemo(() => helpToIndex(helpContentRaw), []);
  const results = query.trim() ? searchHelp(index, query, 20).filter((e) => show(e.audiences)) : null;

  const base = (screenshotBase ?? "").replace(/\/$/, "");
  const downloads = [
    ...(scope === "store" ? [{ file: HELP_PDF_FILE, label: "PDF" }] : []),
    ...Object.entries(HELP_MARKDOWN_FILES)
      .filter(([, f]) => f.scope === scope)
      .map(([file, f]) => ({ file, label: f.label })),
  ];

  function pickFilter(value: HelpAudienceFilter) {
    setPicked(value);
    saveHelpAudience(value);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8" data-testid="help-center">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Ayuda</h1>
          <p className="text-muted-foreground">
            {scope === "store"
              ? "Guías paso a paso para el día a día de tu tienda. En cada pantalla, el botón «?» abre las suyas."
              : "Guías del panel de Kshop. En cada pantalla, el botón «?» abre las suyas."}
          </p>
        </div>
        <div className="relative">
          <Search
            size={18}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="¿Qué quieres hacer? Ej.: Excel, caja"
            aria-label="Buscar en la ayuda"
            className="pl-10"
            data-testid="help-search"
          />
        </div>
        {scope === "store" && (
          <Segmented
            label="Ayuda para"
            options={FILTERS}
            value={filter}
            onSelect={pickFilter}
            className="self-start"
          />
        )}
      </header>

      {results ? (
        <section className="flex flex-col gap-2" aria-label="Resultados" data-testid="help-results">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay nada con «{query.trim()}». Prueba con otra palabra.
            </p>
          ) : (
            results.map((r) => (
              <a
                key={`${r.kind}-${r.slug}`}
                href={`#${r.anchor}`}
                onClick={() => setQuery("")}
                className="flex flex-col gap-0.5 rounded-xl border bg-background px-4 py-3 hover:bg-surface"
              >
                <span className="font-semibold">{r.title}</span>
                <span className="line-clamp-2 text-sm text-muted-foreground">{r.summary}</span>
              </a>
            ))
          )}
        </section>
      ) : null}

      {firstDay.length > 0 && (
        <section id={HELP_ANCHORS.firstDay} className="flex scroll-mt-24 flex-col gap-3">
          <h2 className="font-display text-xl font-bold">Tu primer día</h2>
          <FirstDayChecklist steps={firstDay} screenshotBase={screenshotBase} linkAs={linkAs} />
        </section>
      )}

      <section id={HELP_ANCHORS.guides} className="flex scroll-mt-24 flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Guías</h2>
        <nav aria-label="Índice de guías">
          <ul className="flex flex-col gap-1 text-sm">
            {articles.map((a) => (
              <li key={a.slug}>
                <a href={`#${articleAnchor(a.slug)}`} className="text-primary underline">
                  {a.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-2">
          {articles.map((a) => (
            <HelpArticleCard
              key={a.slug}
              article={a}
              withAnchor
              screenshotBase={screenshotBase}
              relatedHref={(slug) => `#${articleAnchor(slug)}`}
              titleOf={(slug) => titles.get(slug)}
            />
          ))}
        </div>
      </section>

      {glossary.length > 0 && (
        <section id={HELP_ANCHORS.glossary} className="flex scroll-mt-24 flex-col gap-3">
          <h2 className="font-display text-xl font-bold">Glosario</h2>
          <dl className="flex flex-col gap-3">
            {glossary.map((g) => (
              <div key={g.term} className="rounded-xl border bg-background px-4 py-3">
                <dt className="font-semibold">{g.term}</dt>
                <dd className="text-sm text-muted-foreground">{g.definition}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {faq.length > 0 && (
        <section id={HELP_ANCHORS.faq} className="flex scroll-mt-24 flex-col gap-3">
          <h2 className="font-display text-xl font-bold">Preguntas frecuentes</h2>
          <div className="flex flex-col gap-2">
            {faq.map((f) => (
              <details key={f.question} className="group rounded-xl border bg-background">
                <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                  {f.question}
                </summary>
                <p className="border-t px-4 py-3 text-sm">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="help-downloads">
        <h2 id="help-downloads" className="font-display text-xl font-bold">
          Descargar
        </h2>
        <p className="text-sm text-muted-foreground">
          Toda la ayuda en un archivo, para imprimirla o pasársela a quien empieza.
        </p>
        <div className="flex flex-wrap gap-2" data-testid="help-downloads">
          {downloads.map((d) => (
            <a
              key={d.file}
              href={`${base}/help/${d.file}`}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "touch:min-h-10")}
            >
              <Download size={16} aria-hidden />
              {d.label}
            </a>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="help-guides">
        <h2 id="help-guides" className="font-display text-xl font-bold">
          Manuales de cada plan
        </h2>
        <p className="text-sm text-muted-foreground">
          {scope === "store"
            ? "Un manual de Kshop Admin (la app del teléfono) y otro del panel web por plan, en PDF. Están todos: así ves también lo que traen los otros planes."
            : "Los manuales que ve cada tienda en su Ayuda, para mandárselos a un cliente."}
        </p>
        <ul className="flex flex-col divide-y rounded-md border" data-testid="help-guides">
          {HELP_GUIDE_PLANS.map((g) => (
            <li
              key={g.plan}
              className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-medium">Plan {g.name}</span>
              <span className="flex flex-wrap gap-2">
                {(["app", "web"] as const).map((kind) => (
                  <a
                    key={kind}
                    href={`${base}/help/${helpGuideFile(g.plan, kind)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "touch:min-h-10")}
                  >
                    <Download size={16} aria-hidden />
                    {kind === "app" ? "Kshop Admin" : "Panel web"}
                  </a>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
