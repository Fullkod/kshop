"use client";

import { useSyncExternalStore } from "react";
import { cn } from "./cn";
import { Monitor, Moon, Sun } from "./icons";

// Light or dark by choice (Roberto, 2026-10-31): the choice lives in this browser (localStorage) and goes on <html>
// as data-theme; without a choice the site follows the system. styles.css and the `dark:` variant read both.

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "kshop-theme";

/** Runs before the first paint (inline in the HTML) so a dark choice never flashes light. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export function readThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

export function applyThemeChoice(choice: ThemeChoice) {
  if (choice === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Private window: the choice lasts until the page closes.
  }
  window.dispatchEvent(new Event(EVENT));
}

const EVENT = "kshop-theme";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Como el sistema", Icon: Monitor },
  { value: "light", label: "Tema claro", Icon: Sun },
  { value: "dark", label: "Tema oscuro", Icon: Moon },
];

/** Three buttons: system, light, dark. `tone="night"` draws it on the night sidebar. */
export function ThemeSwitch({
  className,
  tone = "surface",
}: {
  className?: string;
  tone?: "surface" | "night";
}) {
  // The server renders «system»; the browser reads its choice and follows later changes (another tab too).
  const choice = useSyncExternalStore(subscribe, readThemeChoice, () => "system" as ThemeChoice);
  const night = tone === "night";
  return (
    <div
      role="group"
      aria-label="Tema"
      className={cn("inline-flex gap-1 rounded-lg p-1", night ? "bg-white/6" : "bg-surface", className)}
      data-testid="theme-switch"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={active}
            onClick={() => applyThemeChoice(value)}
            className={cn(
              "flex size-9 items-center justify-center rounded-md transition-colors touch:size-10",
              night
                ? active
                  ? "bg-white/16 text-white"
                  : "text-[#C8C0DA] hover:bg-white/8 hover:text-white"
                : active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon size={16} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
