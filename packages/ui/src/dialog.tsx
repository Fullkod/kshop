"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "./cn";
import { X } from "./icons";

/**
 * Modal dialog (R13) on the native <dialog> (showModal: focus kept inside and given back, Esc, inert page behind,
 * top layer), like the cart drawer. Centered from 640 px; below it, a full-screen sheet from the bottom. `open` comes
 * from the screen's state; Esc, the close button and `onClose` keep both in step. A click outside does not close it,
 * so a half-filled form is never lost by accident.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  className,
  initialFocus,
  compact = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: "md" | "lg";
  children: ReactNode;
  className?: string;
  /** Element focused on opening (showModal focuses the first focusable one, the close button, otherwise). */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Below 640 px, a bottom sheet as tall as its content (confirmations) instead of the full screen (forms). */
  compact?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      initialFocus?.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, initialFocus]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => open && onClose()}
      className={cn(
        "m-0 mt-auto w-full max-w-none overflow-hidden bg-background p-0 text-foreground shadow-sf-lg",
        compact ? "h-fit max-h-[90dvh] rounded-t-xl" : "h-dvh max-h-none",
        "backdrop:bg-[color-mix(in_srgb,var(--ink)_55%,transparent)]",
        "sm:m-auto sm:h-fit sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:rounded-xl sm:border",
        size === "md" ? "sm:max-w-xl" : "sm:max-w-3xl",
        className,
      )}
    >
      {open && (
        <div className="flex h-full max-h-[inherit] flex-col sm:max-h-[90dvh]">
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-lg font-bold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
