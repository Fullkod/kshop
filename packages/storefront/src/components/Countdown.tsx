"use client";

import { useSyncExternalStore, type ReactNode } from "react";

// One clock for every countdown on the page, ticking each second. The server snapshot is null (no time on the
// server: the cached page would freeze it), so the boxes show «–» until the browser takes over.
const subscribe = (onTick: () => void) => {
  const timer = window.setInterval(onTick, 1000);
  return () => window.clearInterval(timer);
};
const nowSecond = () => Math.floor(Date.now() / 1000);
const useNow = () => useSyncExternalStore(subscribe, nowSecond, () => null);

const UNITS = [
  { label: "días", seconds: 86_400, max: Infinity },
  { label: "horas", seconds: 3_600, max: 24 },
  { label: "min", seconds: 60, max: 60 },
  { label: "seg", seconds: 1, max: 60 },
] as const;

/** Days · hours · minutes · seconds left until `endsAt`. */
export function Countdown({ endsAt }: { endsAt: string }) {
  const now = useNow();
  const left = now == null ? null : Math.max(0, Math.floor(Date.parse(endsAt) / 1000) - now);
  return (
    <div className="flex gap-2" role="timer" aria-label="Tiempo que queda de oferta">
      {UNITS.map((u) => {
        const value = left == null ? null : Math.floor(left / u.seconds) % u.max;
        return (
          <span
            key={u.label}
            className="flex w-[clamp(62px,6cqw,76px)] flex-col items-center gap-1 rounded-sf bg-background py-3 shadow-sf"
          >
            <span className="sf-heading text-[clamp(24px,2.4cqw,30px)] leading-none font-extrabold text-sale tabular-nums">
              {value == null ? "–" : String(value).padStart(2, "0")}
            </span>
            <span className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
              {u.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Hides its content once `endsAt` passes (the server stops sending the section within minutes, PRP-R D10). */
export function UntilEnd({ endsAt, children }: { endsAt: string; children: ReactNode }) {
  const now = useNow();
  if (now != null && now * 1000 >= Date.parse(endsAt)) return null;
  return children;
}
