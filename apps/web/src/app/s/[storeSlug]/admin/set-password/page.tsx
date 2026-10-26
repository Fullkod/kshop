"use client";

import { Alert, Button, Card, FieldError, Input, Label } from "@kshop/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";

const MIN_PASSWORD = 8;

/** Landing page of the owner's access link: the session comes in the URL, the owner sets a password. */
export default function SetPasswordPage() {
  const store = useStore();
  const { supabase, session, ready } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < MIN_PASSWORD) {
      setError(`Usa al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== String(form.get("confirm") ?? "")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setPending(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (updateError) {
      setError("No se pudo guardar la contraseña. Pide un enlace nuevo.");
      return;
    }
    router.replace("/admin");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6">
          <p className="text-sm text-muted-foreground">{store.name}</p>
          <h1 className="text-xl font-semibold">Crea tu contraseña</h1>
        </div>
        {!ready ? (
          <p className="text-muted-foreground">Comprobando el enlace…</p>
        ) : !session ? (
          <Alert variant="destructive">
            El enlace no es válido o ya se usó. Pide a Fullkod un enlace nuevo.
          </Alert>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Cuenta: {session.user.email}</p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña nueva</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm">Repite la contraseña</Label>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
            </div>
            <FieldError>{error}</FieldError>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar y entrar"}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
