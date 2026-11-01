import { ChevronDown } from "@kshop/ui";
import { articleAnchor, screenshotUrl } from "../lib/help-utils";
import type { HelpArticle } from "../types";
import type { HelpLinkComponent } from "./HelpLink";

/** One guide as a foldable card (native <details>): summary, numbered steps with their screenshots, tips. */
export function HelpArticleCard({
  article,
  open,
  screenshotBase = "",
  relatedHref,
  titleOf,
  withAnchor = false,
  linkAs,
  onNavigate,
}: {
  article: HelpArticle;
  open?: boolean;
  screenshotBase?: string;
  /** Where a related guide link points (in-page anchor or the Ayuda page). */
  relatedHref: (slug: string) => string;
  titleOf: (slug: string) => string | undefined;
  /** On the Ayuda page the card carries the guide's anchor id. */
  withAnchor?: boolean;
  /** Router link for related guides outside this page; plain <a> otherwise. */
  linkAs?: HelpLinkComponent;
  onNavigate?: () => void;
}) {
  const RelatedLink = linkAs ?? "a";
  return (
    <details
      id={withAnchor ? articleAnchor(article.slug) : undefined}
      open={open}
      className="group scroll-mt-24 rounded-xl border bg-background"
      data-testid={`help-article-${article.slug}`}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold">{article.title}</span>
          <span className="text-sm text-muted-foreground">{article.summary}</span>
        </span>
        <ChevronDown
          size={18}
          aria-hidden
          className="mt-1 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-4 border-t px-4 py-4">
        <ol className="flex flex-col gap-4">
          {article.steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-primary">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="text-sm leading-relaxed">{step.text}</p>
                {step.screenshot && (
                  <img
                    src={screenshotUrl(step.screenshot, screenshotBase)}
                    alt=""
                    loading="lazy"
                    className="w-full max-w-2xl rounded-lg border"
                    // A missing PNG (not shot yet) must not leave a broken image.
                    onError={(e) => {
                      e.currentTarget.hidden = true;
                    }}
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
        {article.tips?.length ? (
          <div className="rounded-lg bg-surface px-3.5 py-3 text-sm">
            <p className="mb-1 font-semibold">Consejos</p>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {article.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {article.related?.length ? (
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <span className="text-muted-foreground">Relacionado:</span>
            {article.related.map((slug) => (
              <RelatedLink
                key={slug}
                href={relatedHref(slug)}
                onClick={onNavigate}
                className="font-medium text-primary underline"
              >
                {titleOf(slug) ?? slug}
              </RelatedLink>
            ))}
          </p>
        ) : null}
      </div>
    </details>
  );
}
