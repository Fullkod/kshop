import { HELP_AUDIENCE_LABEL, HELP_VERSION, helpContentRaw, inScope, screenshotUrl } from "@kshop/admin/help";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ayuda para imprimir", robots: { index: false } };

const store = <T extends { audiences: Parameters<typeof inScope>[0] }>(items: T[]) =>
  items.filter((i) => inScope(i.audiences, "store"));

/**
 * KSH0005: the whole store help unfolded, for `pnpm help:pdf` (public, no session: only text and screenshots).
 * The Ayuda page offers the PDF; this page is not linked anywhere.
 */
export default function HelpPrintPage() {
  const firstDay = store(helpContentRaw.firstDay);
  const articles = store(helpContentRaw.articles);
  const glossary = store(helpContentRaw.glossary);
  const faq = store(helpContentRaw.faq);
  return (
    <main
      className="mx-auto flex max-w-3xl flex-col gap-10 bg-white px-8 py-10 text-[#1a1033]"
      data-testid="help-print"
    >
      <header>
        <h1 className="font-display text-3xl font-bold">Ayuda de Kshop</h1>
        <p className="text-sm text-[#5d5677]">
          Versión {HELP_VERSION}. La misma ayuda está en el admin: menú › Ayuda o el botón «?» de cada
          pantalla.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold">Tu primer día</h2>
        <ol className="flex list-decimal flex-col gap-3 pl-6">
          {firstDay.map((s) => (
            <li key={s.id} className="break-inside-avoid">
              <p className="font-semibold">{s.title}</p>
              <p className="text-sm">{s.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-8">
        <h2 className="font-display text-2xl font-bold">Guías</h2>
        {articles.map((a) => (
          <article
            key={a.slug}
            className="flex flex-col gap-3 break-before-page first-of-type:break-before-auto"
          >
            <h3 className="font-display text-xl font-bold">{a.title}</h3>
            <p className="text-xs text-[#5d5677]">
              Para: {a.audiences.map((x) => HELP_AUDIENCE_LABEL[x]).join(" · ")}
            </p>
            <p className="text-sm">{a.summary}</p>
            <ol className="flex list-decimal flex-col gap-3 pl-6">
              {a.steps.map((st, i) => (
                <li key={i} className="break-inside-avoid text-sm">
                  <p>{st.text}</p>
                  {st.screenshot && (
                    // eslint-disable-next-line @next/next/no-img-element -- printed as is, no optimization
                    <img src={screenshotUrl(st.screenshot)} alt="" className="mt-2 w-full rounded border" />
                  )}
                </li>
              ))}
            </ol>
            {a.tips?.length ? (
              <div className="break-inside-avoid rounded bg-[#f3effb] px-4 py-3 text-sm">
                <p className="font-semibold">Consejos</p>
                <ul className="list-disc pl-5">
                  {a.tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        ))}
      </section>

      <section className="flex break-before-page flex-col gap-3">
        <h2 className="font-display text-2xl font-bold">Glosario</h2>
        <dl className="flex flex-col gap-2 text-sm">
          {glossary.map((g) => (
            <div key={g.term} className="break-inside-avoid">
              <dt className="font-semibold">{g.term}</dt>
              <dd>{g.definition}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold">Preguntas frecuentes</h2>
        {faq.map((f) => (
          <div key={f.question} className="break-inside-avoid text-sm">
            <p className="font-semibold">{f.question}</p>
            <p>{f.answer}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
