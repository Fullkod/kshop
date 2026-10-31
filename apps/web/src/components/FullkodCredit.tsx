import { cn } from "@kshop/ui";

/**
 * "Kshop · Un producto de Fullkod" (CREA0004): the same credit on every platform and admin screen. `pinned` fixes it
 * at the bottom of a full-height screen (logins); otherwise it is a small right-aligned line after the content.
 */
export function FullkodCredit({
  className,
  pinned = false,
  onDark = false,
}: {
  className?: string;
  pinned?: boolean;
  onDark?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex text-xs",
        pinned ? "absolute inset-x-0 bottom-3 justify-center" : "mt-10 justify-end border-t pt-3",
        onDark ? "text-white/55" : "text-muted-foreground",
        className,
      )}
    >
      <a
        href="https://fullkod.com/?ref=kshop"
        target="_blank"
        rel="noopener"
        className={cn(
          "inline-flex items-center gap-1.5 touch:min-h-10",
          onDark ? "hover:text-white" : "hover:text-foreground",
        )}
      >
        Kshop · Un producto de
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
        <img
          src="/brand/fullkod-symbol.svg"
          alt=""
          className={cn("h-3.5 w-3.5", onDark ? "hidden" : "dark:hidden")}
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
        <img
          src="/brand/fullkod-symbol-reversed.svg"
          alt=""
          className={cn("h-3.5 w-3.5", onDark ? "block" : "hidden dark:block")}
        />
        <span className={cn("font-semibold", onDark ? "text-white/80" : "text-foreground")}>Fullkod</span>
      </a>
    </div>
  );
}
