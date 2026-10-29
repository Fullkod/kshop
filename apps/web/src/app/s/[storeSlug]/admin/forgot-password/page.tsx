"use client";

import { ApiError } from "@kshop/data";
import { Alert, Button, Card, Input, Label } from "@kshop/ui";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FullkodCredit } from "@/components/FullkodCredit";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";

/** «¿Olvidaste tu contraseña?»: emails a one-time link to /admin/set-password (staff of this store only). */
export default function ForgotPasswordPage() {
  const store = useStore();
  const { api } = useSession();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setPending(true);
    setError(null);
    try {
      await api.staffAuth(store.id).passwordReset({ email });
      setSentTo(email);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo enviar. Inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-surface px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6">
          <p className="text-sm text-muted-foreground">{store.name}</p>
          <h1 className="text-xl font-semibold">Recuperar contraseña</h1>
        </div>
        {sentTo ? (
          <Alert variant="success">
            Si {sentTo} tiene acceso al panel de {store.name}, le llegará un correo con un enlace para crear
            una contraseña nueva. Revisa también la carpeta de spam.
          </Alert>
        ) : (
          <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Escribe el email con el que entras al panel y te enviaremos un enlace para crear una contraseña
              nueva.
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            {error && <Alert variant="destructive">{error}</Alert>}
            <Button type="submit" disabled={pending}>
              {pending ? "Enviando…" : "Enviar enlace"}
            </Button>
          </form>
        )}
        <Link href="/admin/login" className="mt-4 block text-center text-sm text-primary hover:underline">
          Volver a entrar
        </Link>
      </Card>
      <FullkodCredit pinned />
    </main>
  );
}
