"use client";

import { Alert, Button } from "@kshop/ui";

/** A read that failed (busy database, timeout, no network): the message and «Reintentar», never a false «no existe». */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3" role="alert">
      <Alert variant="destructive">{message}</Alert>
      <Button variant="outline" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
