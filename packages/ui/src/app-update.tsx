"use client";

import { useState } from "react";
import { Button } from "./components";
import { cn } from "./cn";
import { Download } from "./icons";

export type AppUpdate = { versionName: string; sizeBytes: number | null };

/**
 * «Hay una versión nueva» banner of the Android apps (KSH0008): «Actualizar» downloads the APK and opens the Android
 * installer through `install`, which reports the download progress (0–1, or null when the size is unknown).
 */
export function AppUpdateBanner({
  update,
  appName,
  install,
  onLater,
  className,
}: {
  update: AppUpdate;
  appName: string;
  install: (onProgress: (fraction: number | null) => void) => Promise<void>;
  onLater?: () => void;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "downloading" | "opened" | "failed">("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const size = update.sizeBytes ? ` · ${Math.max(1, Math.round(update.sizeBytes / 1_048_576))} MB` : "";

  async function run() {
    setState("downloading");
    setProgress(null);
    try {
      await install(setProgress);
      setState("opened");
    } catch {
      setState("failed");
    }
  }

  return (
    <div
      role="status"
      data-testid="app-update"
      className={cn("flex flex-col gap-2 bg-accent-soft px-4 py-3 text-sm", className)}
    >
      <p>
        <span className="font-medium">Hay una versión nueva de {appName}</span> ({update.versionName}
        {size}).{" "}
        {state === "opened"
          ? "Toca «Instalar» en la ventana de Android. Si te pide permiso para instalar apps de esta fuente, actívalo y vuelve atrás."
          : state === "failed"
            ? "No se pudo descargar. Revisa la conexión e inténtalo de nuevo."
            : "Tus datos y las ventas sin subir se conservan."}
      </p>
      {state === "downloading" ? (
        <div className="flex items-center gap-3" data-testid="app-update-progress">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
            <div
              className={cn(
                "h-full rounded-full bg-primary transition-[width]",
                progress === null && "animate-pulse",
              )}
              style={{ width: `${Math.round((progress ?? 1) * 100)}%` }}
            />
          </div>
          <span className="w-16 text-right tabular-nums">
            {progress === null ? "Bajando…" : `${Math.round(progress * 100)} %`}
          </span>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void run()} data-testid="app-update-install">
            <Download size={16} aria-hidden />
            {state === "idle"
              ? "Actualizar"
              : state === "opened"
                ? "Abrir el instalador otra vez"
                : "Reintentar"}
          </Button>
          {onLater && state === "idle" && (
            <Button size="sm" variant="ghost" onClick={onLater} data-testid="app-update-later">
              Luego
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
