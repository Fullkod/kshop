"use client";

import { Button, buttonVariants, CircleHelp, cn, Dialog } from "@kshop/ui";
import { useMemo, useState } from "react";
import { helpContentRaw } from "../content/raw";
import { HELP_CONTEXT_LABEL, articleAnchor, visibleTo } from "../lib/help-utils";
import type { HelpAudience, HelpContext } from "../types";
import { HelpArticleCard } from "./HelpArticleCard";
import type { HelpLinkComponent } from "./HelpLink";

/**
 * «?» of a screen (KSH0005): opens «Ayuda · <vista>» with the guides of that screen for this reader, the first one
 * unfolded, and «Toda la ayuda». A full-screen sheet on a phone (Dialog, R13).
 */
export function HelpButton({
  context,
  viewer,
  helpHref,
  screenshotBase,
  linkAs,
  className,
}: {
  context: HelpContext;
  viewer: HelpAudience;
  /** The Ayuda page (`/admin/help`, `/superadmin/help`). */
  helpHref: string;
  screenshotBase?: string;
  linkAs: HelpLinkComponent;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const articles = useMemo(
    () =>
      helpContentRaw.articles.filter((a) => a.contexts?.includes(context) && visibleTo(a.audiences, viewer)),
    [context, viewer],
  );
  const titles = useMemo(() => new Map(helpContentRaw.articles.map((a) => [a.slug, a.title])), []);
  const close = () => setOpen(false);
  const AllLink = linkAs;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ayuda de esta pantalla"
        title="Ayuda"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[10px] border hover:bg-surface",
          className,
        )}
        data-testid="help-button"
      >
        <CircleHelp size={18} aria-hidden />
      </button>
      {open && (
        <Dialog open onClose={close} title={`Ayuda · ${HELP_CONTEXT_LABEL[context]}`} size="lg">
          <div className="flex flex-col gap-3" data-testid="help-dialog">
            {articles.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="help-empty">
                Aún no hay guías para esta pantalla.
              </p>
            ) : (
              articles.map((a, i) => (
                <HelpArticleCard
                  key={a.slug}
                  article={a}
                  open={i === 0}
                  screenshotBase={screenshotBase}
                  relatedHref={(slug) => `${helpHref}#${articleAnchor(slug)}`}
                  titleOf={(slug) => titles.get(slug)}
                  linkAs={linkAs}
                  onNavigate={close}
                />
              ))
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <AllLink
                href={helpHref}
                onClick={close}
                className={cn(buttonVariants({ variant: "outline" }), "touch:min-h-10")}
              >
                Toda la ayuda
              </AllLink>
              <Button variant="ghost" onClick={close}>
                Cerrar
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
