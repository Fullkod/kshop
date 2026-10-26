"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

const DISMISSED_KEY = "kshop-app-banner-dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Storage blocked: show it, closing it just will not be remembered.
    return false;
  }
}

const noSubscribe = () => () => {};

/** Discreet notice on Android phones when the store has a published app (PRP-7 D13); closing it is remembered. */
export function AndroidAppBanner({ storeName }: { storeName: string }) {
  const pathname = usePathname();
  // Browser-only facts: false on the server and in the first render.
  const eligible = useSyncExternalStore(
    noSubscribe,
    () => /Android/i.test(navigator.userAgent) && !wasDismissed(),
    () => false,
  );
  const [closed, setClosed] = useState(false);

  if (!eligible || closed || pathname.endsWith("/app")) return null;
  const close = () => {
    setClosed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Ignore.
    }
  };
  return (
    <div
      className="flex items-center gap-3 border-b bg-accent-soft px-4 py-2 text-sm"
      data-testid="app-banner"
    >
      <Link href="/app" className="flex-1 underline-offset-2 hover:underline">
        Descarga la app de {storeName} para Android
      </Link>
      <button
        type="button"
        onClick={close}
        aria-label="Cerrar aviso de la app"
        className="px-1 text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}
