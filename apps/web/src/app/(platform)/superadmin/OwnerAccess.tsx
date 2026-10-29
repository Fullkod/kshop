"use client";

import { ApiError, type OwnerAccessResponse } from "@kshop/data";
import { Alert, Button, buttonVariants, Input } from "@kshop/ui";
import { useState } from "react";
import { useSession } from "@/lib/session";

/** «Enviar acceso»: a new one-time link for the owner (forgotten password, lost invitation), by email and WhatsApp. */
export function OwnerAccess({ storeId, storeName }: { storeId: string; storeName: string }) {
  const { api } = useSession();
  const [access, setAccess] = useState<OwnerAccessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function send() {
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      setAccess(await api.platform.ownerAccess(storeId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo generar el enlace.");
    } finally {
      setPending(false);
    }
  }

  const message =
    access &&
    `Hola, este es tu enlace para entrar al panel de ${storeName} en Kshop y crear una contraseña nueva (sirve una vez):
${access.link}`;
  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="owner-access">
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={pending}
        onClick={() => void send()}
      >
        {pending ? "Generando…" : access ? "Generar otro enlace" : "Enviar acceso al dueño"}
      </Button>
      {error && <Alert variant="destructive">{error}</Alert>}
      {access && message && (
        <>
          <p className="text-sm text-muted-foreground">
            {access.emailed
              ? `Enviado por correo a ${access.email}. También puedes mandarlo por WhatsApp:`
              : `No se envió por correo. Mándaselo a ${access.email} por WhatsApp:`}
          </p>
          <Input readOnly value={access.link} className="font-mono text-xs" data-testid="owner-access-link" />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(access.link);
                setCopied(true);
              }}
            >
              {copied ? "Copiado" : "Copiar enlace"}
            </Button>
            <a
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
            >
              Enviar por WhatsApp
            </a>
          </div>
        </>
      )}
    </div>
  );
}
