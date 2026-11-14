"use client";

import { Check, cn } from "@kshop/ui";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  parseFirstDay,
  readFirstDayRaw,
  saveFirstDayDone,
  subscribeHelpStorage,
} from "../lib/first-day-progress";
import { screenshotUrl } from "../lib/help-utils";
import type { FirstDayStep } from "../types";
import type { HelpLinkComponent } from "./HelpLink";

/** «Tu primer día»: steps with a box each, remembered in this browser. */
export function FirstDayChecklist({
  steps,
  screenshotBase,
  linkAs: StepLink,
  showLinks = true,
}: {
  steps: FirstDayStep[];
  screenshotBase?: string;
  linkAs: HelpLinkComponent;
  /** «Ir ahora» opens a screen of the admin: not on the public page, outside any store. */
  showLinks?: boolean;
}) {
  // The server renders nothing done; the browser its saved progress. `local` keeps the clicks when storage fails.
  const raw = useSyncExternalStore(subscribeHelpStorage, readFirstDayRaw, () => "[]");
  const saved = useMemo(() => parseFirstDay(raw), [raw]);
  const [local, setLocal] = useState<Set<string> | null>(null);
  const done = local ?? saved;

  function toggle(id: string) {
    const next = new Set(done);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setLocal(next);
    saveFirstDayDone(next);
  }

  const count = steps.filter((s) => done.has(s.id)).length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground" data-testid="first-day-progress">
        {count} de {steps.length} hechos
      </p>
      <ul className="flex flex-col gap-2">
        {steps.map((s) => {
          const checked = done.has(s.id);
          return (
            <li key={s.id} className="flex gap-3 rounded-xl border bg-background px-4 py-3">
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-label={s.title}
                onClick={() => toggle(s.id)}
                className="-m-2 flex size-10 shrink-0 items-center justify-center"
                data-testid={`first-day-${s.id}`}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md border-2",
                    checked ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {checked && <Check size={16} aria-hidden />}
                </span>
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className={cn("font-semibold", checked && "text-muted-foreground line-through")}>
                  {s.title}
                </p>
                <p className="text-sm text-muted-foreground">{s.detail}</p>
                {showLinks && s.link && (
                  <StepLink href={s.link} className="self-start text-sm font-medium text-primary underline">
                    Ir ahora
                  </StepLink>
                )}
                {s.screenshot && (
                  <img
                    src={screenshotUrl(s.screenshot, screenshotBase)}
                    alt=""
                    loading="lazy"
                    className="mt-1 w-full max-w-xl rounded-lg border"
                    onError={(e) => {
                      e.currentTarget.hidden = true;
                    }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
