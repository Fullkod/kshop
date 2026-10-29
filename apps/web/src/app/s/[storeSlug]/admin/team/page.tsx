"use client";

import { ROLE_LABELS, type StoreRole } from "@kshop/core";
import { ApiError, type TeamInviteResponse, type TeamResponse } from "@kshop/data";
import { Alert, Button, Card, Dialog, FieldError, Input, Label, Select } from "@kshop/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";
import { useAdmin } from "../admin-context";

// Admin › Equipo (owner/admin). The plan limits how many people (the owner does not count). An invitation is a
// one-time access link to send by WhatsApp, as with the owner's own sign-up.

export default function TeamPage() {
  const store = useStore();
  const admin = useAdmin();
  const { api } = useSession();
  const team = api.team(store.id);
  const [data, setData] = useState<TeamResponse | null>(null);
  const [invited, setInvited] = useState<TeamInviteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [inviting, setInviting] = useState(false);
  const isOwner = admin.role === "owner" || (admin.isSuperadmin && admin.role === null);

  const load = useCallback(() => api.team(store.id).list(), [api, store.id]);
  useEffect(() => {
    let cancelled = false;
    load()
      .then((d) => !cancelled && setData(d))
      .catch(
        (e: unknown) =>
          !cancelled && setError(e instanceof ApiError ? e.message : "No se pudo cargar el equipo."),
      );
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    setFields({});
    try {
      await action();
      setData(await load());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Algo salió mal.");
      if (e instanceof ApiError) {
        setFields(Object.fromEntries(Object.entries(e.fields ?? {}).map(([k, v]) => [k, v[0] ?? ""])));
      }
    } finally {
      setPending(false);
    }
  }

  function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setInvited(null);
    void run(async () => {
      const result = await team.invite({
        email: String(form.get("email") ?? ""),
        role: String(form.get("role")) as "admin" | "staff",
      });
      setInvited(result);
      element.reset();
      setInviting(false);
    });
  }

  if (admin.role === "staff")
    return <Alert variant="destructive">Solo el dueño y los administradores gestionan el equipo.</Alert>;
  if (!data)
    return error ? (
      <Alert variant="destructive">{error}</Alert>
    ) : (
      <p className="text-muted-foreground">Cargando…</p>
    );

  const full = data.usage.limit != null && data.usage.used >= data.usage.limit;
  const canManage = (role: StoreRole) => role === "staff" || (role === "admin" && isOwner);
  const whatsapp = invited
    ? `https://wa.me/?text=${encodeURIComponent(
        `Te invito al equipo de ${store.name} en Kshop. Entra aquí para crear tu contraseña: ${invited.accessLink}`,
      )}`
    : null;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Equipo</h1>
          <p className="text-sm text-muted-foreground" data-testid="team-usage">
            {data.usage.limit == null
              ? `${data.usage.used} personas además del dueño.`
              : `${data.usage.used} de ${data.usage.limit} personas permitidas por tu plan (sin contar al dueño).`}
          </p>
        </div>
        {!full && (
          <Button
            onClick={() => {
              setError(null);
              setFields({});
              setInviting(true);
            }}
          >
            Invitar persona
          </Button>
        )}
      </div>
      {error && !inviting && <Alert variant="destructive">{error}</Alert>}
      {full && (
        <Alert data-testid="team-full">
          Tu plan permite {data.usage.limit} {data.usage.limit === 1 ? "persona" : "personas"} de equipo. Para
          añadir más, mejora el plan en «Plan y facturación».
        </Alert>
      )}
      {invited && whatsapp && (
        <Alert variant="success" data-testid="team-invited">
          {invited.member.email} ya es del equipo. Envíale el enlace de acceso (vale una sola vez):{" "}
          <a href={whatsapp} target="_blank" rel="noreferrer" className="font-medium underline">
            enviar por WhatsApp
          </a>
          .
        </Alert>
      )}
      <Dialog open={inviting} onClose={() => setInviting(false)} title="Invitar al equipo">
        <form onSubmit={onInvite} className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="email">Email de la persona</Label>
            <Input id="email" name="email" type="email" required autoComplete="off" />
            <FieldError>{fields.email}</FieldError>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="role">Rol</Label>
            <Select id="role" name="role" defaultValue="staff">
              <option value="staff">{ROLE_LABELS.staff}</option>
              {isOwner && <option value="admin">{ROLE_LABELS.admin}</option>}
            </Select>
          </div>
          {error && (
            <Alert variant="destructive" className="sm:col-span-2">
              {error}
            </Alert>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              Invitar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setInviting(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Dialog>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-surface text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Persona</th>
              <th className="px-4 py-2 font-medium">Rol</th>
              <th className="px-4 py-2 font-medium">Desde</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.userId} className="border-b last:border-0" data-testid={`member-${m.email}`}>
                <td className="px-4 py-2">
                  {m.email ?? "—"}
                  {m.isMe && <span className="text-muted-foreground"> (tú)</span>}
                </td>
                <td className="px-4 py-2">
                  {m.role !== "owner" && canManage(m.role) && isOwner ? (
                    <Select
                      aria-label={`Rol de ${m.email}`}
                      value={m.role}
                      disabled={pending}
                      onChange={(e) => void run(() => team.update(m.userId, e.target.value as StoreRole))}
                      className="h-8 w-36"
                    >
                      <option value="admin">{ROLE_LABELS.admin}</option>
                      <option value="staff">{ROLE_LABELS.staff}</option>
                    </Select>
                  ) : (
                    ROLE_LABELS[m.role]
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{formatDate(m.createdAt)}</td>
                <td className="px-4 py-2 text-right">
                  {m.role !== "owner" && canManage(m.role) && !m.isMe && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`¿Quitar a ${m.email} del equipo?`))
                          void run(() => team.remove(m.userId));
                      }}
                    >
                      Quitar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
